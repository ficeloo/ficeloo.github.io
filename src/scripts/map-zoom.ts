// Vue rapprochée de la star map (MapZoom.astro) : au clic sur un projet, un viseur se referme
// sur son nœud (« LOCK »), puis la caméra zoome sur sa planète (satellites compris) : elle se
// déplace jusqu'à elle, tout le décor défile (la carte, et les étoiles plus lentement, elles sont
// loin), et la planète finit au centre de l'écran, la fiche à gauche (en bas sur écran étroit).
// ← → passent d'une planète à l'autre sans repasser par la carte, Échap y ramène.
//
// La carte n'est pas recalculée pendant le zoom : tout son calque est déplacé et agrandi par un
// seul transform (le moteur de la carte l'applique via ZoomHost.camera), puis s'efface.
import { createPlanet, type Planet } from './project-planet';

/** Ce que la carte fournit au zoom. Coordonnées en px, dans le repère de l'écran de la carte. */
export interface ZoomHost {
	count: number;
	nodePoint(i: number): { x: number; y: number }; // position actuelle du nœud du projet i
	label(i: number): string; // « 03 Scop » (texte du viseur)
	camera(map: string, opacity: number, stars: string): void; // calques de la carte et des étoiles ('' = au repos)
	jumpTo(i: number): void; // cale la carte (cachée) sur le projet i
	lock(on: boolean): void; // scroll bloqué, chrome de la carte masqué
}

// Durées (ms) : zoom ×1,5 par rapport à la maquette (demande de Théophile)
const LOCK = 450; // le viseur se referme
const DIVE = 1500; // approche
const BACK = 800; // retour à la carte
const HOP = 600; // planète voisine
const SHOT = 3500; // mini diaporama : une capture
const SHOT_GIF = 6000; // un GIF (animé) reste plus longtemps
const NODE_R = 8; // rayon du nœud actif sur la carte (16 px de diamètre)
const STARS_PAN = 0.35; // les étoiles, lointaines, ne suivent qu'une partie du déplacement…
const STARS_ZOOM = 0.12; // … et du zoom (exposant)

const cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = cl((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const outC = (t: number) => 1 - Math.pow(1 - t, 3);
const f1 = (v: number) => v.toFixed(1);

type Anim = { finish(): void };

export function createZoom(root: HTMLElement, host: ZoomHost, text: { targeting: string; lock: string }) {
	const coarse = matchMedia('(pointer: coarse)').matches;
	const cards = [...root.querySelectorAll<HTMLElement>('[data-zoom-card]')];
	const boxes = [...root.querySelectorAll<HTMLElement>('[data-zoom-planet]')];
	const planets: (Planet | null)[] = boxes.map(() => null);
	const planetsEl = root.querySelector<HTMLElement>('[data-zoom-planets]')!;
	const cardsEl = root.querySelector<HTMLElement>('[data-zoom-scroll]')!;
	const narrow = matchMedia('(max-width: 700px), (orientation: portrait)'); // fiche en bas (CSS)
	const reticle = root.querySelector<HTMLElement>('[data-zoom-reticle]')!;
	const reticleText = root.querySelector<HTMLElement>('[data-zoom-reticle-text]')!;
	const prevBtn = root.querySelector<HTMLButtonElement>('[data-zoom-go="-1"]');
	const nextBtn = root.querySelector<HTMLButtonElement>('[data-zoom-go="1"]');

	let open = false;
	let idx = 0;
	let anim: Anim | null = null;
	const live = new Set<number>(); // planètes à animer (la courante, et l'ancienne pendant un bond)

	// --- Animation : une étape = (durée, pas), « finish » saute à la fin (clic pendant le zoom) ---
	function play(dur: number, step: (t: number) => void, done?: () => void): Anim {
		const t0 = performance.now();
		let raf = 0;
		const a: Anim & { done: boolean } = {
			done: false,
			finish() {
				if (a.done) return;
				a.done = true;
				cancelAnimationFrame(raf);
				step(1);
				if (anim === a) anim = null;
				done?.();
			},
		};
		const tick = (now: number) => {
			const t = Math.min(1, (now - t0) / dur);
			if (t >= 1) a.finish();
			else { step(t); raf = requestAnimationFrame(tick); }
		};
		anim = a;
		step(0);
		raf = requestAnimationFrame(tick);
		return a;
	}
	function chain(steps: [number, (t: number) => void][], done?: () => void) {
		const next = (k: number) => (k < steps.length ? play(steps[k][0], steps[k][1], () => next(k + 1)) : done?.());
		next(0);
	}
	/** Termine tout ce qui est en cours, enchaînement compris (chaque fin lance l'étape suivante). */
	function skip() {
		while (anim) anim.finish();
	}

	// --- Planètes : animées tant qu'elles sont affichées (30 images/s en tactile) ---
	let loopRaf = 0;
	let lastFrame = 0;
	const loop = (ms: number) => {
		if (!open) { loopRaf = 0; return; }
		if (!coarse || ms - lastFrame > 32) {
			lastFrame = ms;
			live.forEach((i) => planets[i]?.frame(ms));
		}
		loopRaf = requestAnimationFrame(loop);
	};
	function planetOf(i: number) {
		boxes[i].hidden = false;
		const scene = boxes[i].querySelector<HTMLElement>('[data-planet-scene]')!;
		const p = planets[i] ?? (planets[i] = createPlanet(scene));
		p.resize();
		return p;
	}

	// --- Géométrie : où la caméra amène la planète. Au centre de l'écran (sa scène, planète +
	// orbites, ne passe pas sous la fiche de gauche) ; sur écran étroit, au centre de la place
	// laissée au-dessus de la fiche. ---
	type Spot = { x: number; y: number; zEnd: number };
	function place(): Spot {
		const o = root.getBoundingClientRect(), c = cardsEl.getBoundingClientRect();
		const W = planetsEl.offsetWidth, H = planetsEl.offsetHeight, m = 12;
		const R = Math.min(W, H) * 0.3; // rayon de la planète (project-planet.ts)
		const x = narrow.matches ? o.width / 2 : Math.max(o.width / 2, c.right - o.left + W * 0.4);
		const y = narrow.matches ? cl((c.top - o.top) / 2, H * 0.44 + m, c.top - o.top - H * 0.56) : o.height / 2;
		return { x, y, zEnd: Math.max(1, R / NODE_R) };
	}
	function setSpot(q: { x: number; y: number }) {
		planetsEl.style.transform = `translate(${f1(q.x - planetsEl.offsetWidth / 2)}px,${f1(q.y - planetsEl.offsetHeight * 0.44)}px)`;
	}

	/** État de la caméra à l'avancement e (0 = carte, 1 = planète) entre le nœud P et la cible Q. */
	function cameraAt(i: number, P: { x: number; y: number }, Q: Spot, e: number) {
		const Z = Math.pow(Q.zEnd, e);
		const cx = lerp(P.x, Q.x, e), cy = lerp(P.y, Q.y, e);
		// Calque de la carte (origine 0,0) : le nœud P doit tomber sur (cx, cy). Les étoiles suivent
		// en partie (parallaxe), zoomées autour de P.
		const Zs = Math.pow(Z, STARS_ZOOM), sx = P.x + (cx - P.x) * STARS_PAN, sy = P.y + (cy - P.y) * STARS_PAN;
		host.camera(
			`translate(${f1(cx - P.x * Z)}px,${f1(cy - P.y * Z)}px) scale(${Z.toFixed(4)})`,
			1 - smooth(2.5, 8, Z), // la carte s'efface une fois qu'on a plongé dans la nébuleuse
			`translate(${f1(sx - P.x * Zs)}px,${f1(sy - P.y * Zs)}px) scale(${Zs.toFixed(4)})`,
		);
		const box = boxes[i];
		box.style.transform = `translate(${f1(cx - Q.x)}px,${f1(cy - Q.y)}px) scale(${(Z / Q.zEnd).toFixed(4)})`;
		box.style.opacity = smooth(0.08, 0.35, e).toFixed(3);
		return { cx, cy, Z };
	}
	function showReticle(x: number, y: number, size: number, opacity: number, label?: string) {
		reticle.style.transform = `translate(${f1(x - size / 2)}px,${f1(y - size / 2)}px)`;
		reticle.style.width = reticle.style.height = f1(size) + 'px';
		reticle.style.opacity = opacity.toFixed(3);
		if (label !== undefined && reticleText.textContent !== label) reticleText.textContent = label;
	}

	// --- Fiche + mini diaporama ---
	let shotT = 0;
	function showCard(i: number, enter = 0) {
		cards.forEach((c, k) => {
			c.hidden = k !== i;
			c.removeAttribute('data-enter');
		});
		const card = cards[i];
		if (enter) card.setAttribute('data-enter', String(enter));
		const imgs = [...card.querySelectorAll<HTMLImageElement>('img[data-src]')];
		imgs.forEach((img) => { if (!img.getAttribute('src')) img.src = img.dataset.src!; });
		clearTimeout(shotT);
		let k = 0;
		const show = () => {
			imgs.forEach((img, n) => img.toggleAttribute('data-on', n === k));
			if (imgs.length < 2) return;
			shotT = window.setTimeout(() => { k = (k + 1) % imgs.length; show(); }, 'gif' in imgs[k].dataset ? SHOT_GIF : SHOT);
		};
		show();
		if (prevBtn) prevBtn.disabled = i === 0;
		if (nextBtn) nextBtn.disabled = i === host.count - 1;
	}

	function setIdx(i: number) {
		idx = i;
		live.clear();
		live.add(i);
		boxes.forEach((b, k) => {
			if (k !== i) b.hidden = true;
			// Seule la planète affichée glisse vers sa page projet (View Transitions, global.css)
			b.querySelector<HTMLElement>('[data-planet-scene]')!.style.viewTransitionName = k === i ? 'planet' : '';
		});
	}

	// --- Ouverture : verrouillage, puis approche ---
	// Ouvert au clavier : le focus va sur « View project » (Entrée), sinon sur la vue elle-même.
	function openAt(i: number, byKey = false) {
		if (open) return;
		open = true;
		root.hidden = false;
		root.removeAttribute('data-ready');
		host.lock(true);
		setIdx(i);
		planetOf(i);
		showCard(i);
		if (!loopRaf) loopRaf = requestAnimationFrame(loop);
		const P = host.nodePoint(i);
		const Q = place();
		setSpot(Q);
		const name = host.label(i);
		boxes[i].style.opacity = '0';
		chain([
			[LOCK, (t) => {
				const e = outC(t);
				showReticle(P.x, P.y, lerp(130, 34, e), Math.min(1, t * 3), t > 0.6 ? `${text.lock} · ${name}` : text.targeting);
			}],
			[DIVE, (t) => {
				const { cx, cy, Z } = cameraAt(i, P, Q, inOut(t));
				showReticle(cx, cy, Math.max(34, NODE_R * Z * 2.9), 1 - smooth(0.7, 1, t), `${text.lock} · ${name}`);
			}],
		], () => {
			root.setAttribute('data-ready', '');
			(byKey ? cards[i].querySelector<HTMLElement>('[data-zoom-link]') : root)?.focus({ preventScroll: true });
		});
	}

	// --- Retour à la carte : l'approche jouée à l'envers, sans viseur ---
	function close() {
		if (!open) return;
		skip();
		root.removeAttribute('data-ready');
		showReticle(0, 0, 0, 0);
		clearTimeout(shotT);
		const i = idx;
		const P = host.nodePoint(i);
		const Q = place();
		setSpot(Q);
		play(BACK, (t) => cameraAt(i, P, Q, inOut(1 - t)), () => {
			open = false;
			live.clear();
			host.camera('', 1, '');
			boxes[i].hidden = true;
			boxes[i].style.transform = '';
			cards[i].hidden = true;
			root.hidden = true;
			host.lock(false);
		});
	}

	// --- Planète voisine : l'une sort d'un côté, l'autre entre de l'autre ---
	function hop(d: number) {
		if (!open) return;
		skip();
		const from = idx, to = idx + d;
		if (to < 0 || to >= host.count) return;
		host.jumpTo(to); // la carte (invisible) suit, pour qu'Échap ramène au bon projet
		setIdx(to);
		live.add(from);
		boxes[from].hidden = false;
		planetOf(to);
		showCard(to, d);
		play(HOP, (t) => {
			const e = inOut(t);
			boxes[from].style.transform = `translateX(${f1(-d * 80 * e)}px) scale(${(1 - 0.2 * e).toFixed(3)})`;
			boxes[from].style.opacity = (1 - smooth(0, 0.6, t)).toFixed(3);
			boxes[to].style.transform = `translateX(${f1(d * 80 * (1 - e))}px) scale(${(0.8 + 0.2 * e).toFixed(3)})`;
			boxes[to].style.opacity = smooth(0.3, 1, t).toFixed(3);
		}, () => {
			live.delete(from);
			boxes[from].hidden = true;
			boxes[from].style.transform = '';
		});
	}

	// Taille d'écran changée : la planète reprend sa place (la carte, cachée, se recalera au retour)
	function relayout() {
		if (!open || anim) return;
		boxes[idx].style.transform = '';
		setSpot(place());
		planets[idx]?.resize();
	}

	// Un clic ou une touche pendant le zoom l'achève tout de suite
	root.addEventListener('pointerdown', skip, true);
	root.querySelector('[data-zoom-close]')?.addEventListener('click', close);
	prevBtn?.addEventListener('click', () => hop(-1));
	nextBtn?.addEventListener('click', () => hop(1));
	// Dialog : Tab boucle sur les contrôles visibles de la vue
	root.addEventListener('keydown', (e) => {
		if (e.key !== 'Tab') return;
		const items = [...root.querySelectorAll<HTMLElement>('a, button')].filter((el) => el.offsetParent && !(el as HTMLButtonElement).disabled);
		const first = items[0], last = items[items.length - 1];
		if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
		else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
	});

	return {
		get isOpen() { return open; },
		get index() { return idx; },
		get busy() { return anim !== null; },
		link: () => cards[idx].querySelector<HTMLAnchorElement>('[data-zoom-link]')?.href ?? '',
		skip,
		open: openAt,
		close,
		hop,
		relayout,
	};
}
