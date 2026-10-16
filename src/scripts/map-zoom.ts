// Vue rapprochée de la star map (MapZoom.astro) : au clic sur un projet, un viseur se referme
// sur son nœud (« LOCK »), puis la caméra zoome sur sa planète (satellites compris) : elle se
// déplace jusqu'à elle, tout le décor défile (la carte, et les étoiles plus lentement, elles sont
// loin), et la planète finit au centre de la place libre, la fiche à gauche (en bas sur écran étroit).
// Autour de la planète : la nébuleuse de son système (on est dedans) et des chemins en pointillés
// vers les planètes voisines. ← → (ou un clic sur leur nom) passent de l'une à l'autre sans
// repasser par la carte, Échap y ramène.
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
	neighbor(i: number, d: number): { dx: number; dy: number; label: string } | null; // projet voisin (d = ±1) : direction sur la carte, nom
	nebula(i: number): { key: number; layers: HTMLCanvasElement[] } | null; // textures de la nébuleuse du système (si prêtes)
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
const BACK_OP = 0.85; // opacité du fond de nébuleuse une fois arrivé
const BACK_SIZE = 1.6; // taille du fond, en plus grand côté de l'écran
const KEYS_H = 110; // bas de l'écran réservé aux raccourcis clavier (écran large)

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
	const backdrop = root.querySelector<HTMLElement>('[data-zoom-backdrop]')!;
	const backCv = backdrop.querySelector('canvas')!;
	const routes = [-1, 1].map((d) => ({
		d,
		path: root.querySelector<SVGPathElement>(`[data-zoom-route="${d}"]`)!,
		label: root.querySelector<HTMLButtonElement>(`[data-zoom-hop="${d}"]`)!,
	}));
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

	// --- Géométrie : où la caméra amène la planète. Au centre de la place laissée libre par la fiche
	// (à sa droite ; au-dessus sur écran étroit), pour que les chemins des deux côtés aient la place. ---
	type Spot = { x: number; y: number; zEnd: number };
	function place(): Spot {
		const o = root.getBoundingClientRect(), c = cardsEl.getBoundingClientRect();
		const W = planetsEl.offsetWidth, H = planetsEl.offsetHeight, m = 12;
		const R = Math.min(W, H) * 0.3; // rayon de la planète (project-planet.ts)
		const x = narrow.matches ? o.width / 2 : Math.max((c.right - o.left + o.width) / 2, c.right - o.left + W * 0.4);
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
		showBackdrop(Q, e, smooth(2.5, 8, Z)); // la nébuleuse de la carte s'efface, celle du fond prend le relais
		const box = boxes[i];
		box.style.transform = `translate(${f1(cx - Q.x)}px,${f1(cy - Q.y)}px) scale(${(Z / Q.zEnd).toFixed(4)})`;
		box.style.opacity = smooth(0.08, 0.35, e).toFixed(3);
		return { cx, cy, Z };
	}
	// --- Fond : la nébuleuse du système, recopiée de la carte, centrée sur la planète ---
	let backKey = -1;
	function paintBackdrop(i: number) {
		const neb = host.nebula(i);
		backdrop.hidden = !neb;
		if (!neb || neb.key === backKey) return;
		backKey = neb.key;
		const c = backCv.getContext('2d')!;
		c.clearRect(0, 0, backCv.width, backCv.height);
		neb.layers.forEach((l) => c.drawImage(l, 0, 0, backCv.width, backCv.height));
	}
	/** e : avancement du zoom (le fond grandit en même temps), k : part de son opacité finale. */
	function showBackdrop(Q: { x: number; y: number }, e: number, k: number) {
		const o = root.getBoundingClientRect(), S = Math.max(o.width, o.height) * BACK_SIZE;
		backdrop.style.width = backdrop.style.height = f1(S) + 'px';
		backdrop.style.transform = `translate(${f1(Q.x - S / 2)}px,${f1(Q.y - S / 2)}px) scale(${lerp(0.6, 1, e).toFixed(3)})`;
		backdrop.style.opacity = (k * BACK_OP).toFixed(3);
	}

	// --- Chemins vers les voisines : de la planète jusqu'au bord de la place libre, le nom au bout ---
	function drawRoutes() {
		const o = root.getBoundingClientRect(), c = cardsEl.getBoundingClientRect();
		const Q = place(), start = Q.zEnd * NODE_R * 1.35, m = 16;
		const box = {
			x0: narrow.matches ? m : c.right - o.left + m, x1: o.width - m,
			y0: m, y1: narrow.matches ? c.top - o.top - m : o.height - KEYS_H,
		};
		routes.forEach(({ d, path, label }) => {
			const nb = host.neighbor(idx, d), len = nb ? Math.hypot(nb.dx, nb.dy) : 0;
			label.hidden = !nb || !len;
			path.setAttribute('d', '');
			if (!nb || !len) return;
			const ux = nb.dx / len, uy = nb.dy / len;
			let t = Infinity; // jusqu'au premier bord rencontré
			if (ux > 0) t = Math.min(t, (box.x1 - Q.x) / ux);
			if (ux < 0) t = Math.min(t, (box.x0 - Q.x) / ux);
			if (uy > 0) t = Math.min(t, (box.y1 - Q.y) / uy);
			if (uy < 0) t = Math.min(t, (box.y0 - Q.y) / uy);
			const horiz = Math.abs(ux) >= Math.abs(uy);
			label.textContent = horiz ? (ux < 0 ? `← ${nb.label}` : `${nb.label} →`) : uy < 0 ? `↑ ${nb.label}` : `${nb.label} ↓`;
			const lw = label.offsetWidth, lh = label.offsetHeight;
			const x = Q.x + ux * t, y = Q.y + uy * t;
			// Le nom se range contre le bord atteint, le chemin s'arrête juste avant lui. Pas la place
			// (la fiche est de ce côté) : le chemin va jusqu'au bord et le nom se pose au-dessus de sa fin.
			const room = horiz ? lw + 8 : lh + 6, tEnd = t - room / Math.max(Math.abs(horiz ? ux : uy), 0.2);
			const inline = tEnd >= start + 30;
			const tLine = inline ? tEnd : t;
			if (tLine < start + 30) { label.hidden = true; return; }
			path.setAttribute('d', `M${f1(Q.x + ux * start)} ${f1(Q.y + uy * start)}L${f1(Q.x + ux * tLine)} ${f1(Q.y + uy * tLine)}`);
			const lx = !inline || !horiz ? cl(x - lw / 2, box.x0, box.x1 - lw) : ux < 0 ? x : x - lw;
			const ly = !inline ? cl(y - lh - 6, box.y0, box.y1 - lh) : horiz ? cl(y - lh / 2, box.y0, box.y1 - lh) : uy < 0 ? y : y - lh;
			label.style.transform = `translate(${f1(lx)}px,${f1(ly)}px)`;
		});
		root.setAttribute('data-routes', '');
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
		paintBackdrop(i);
		root.removeAttribute('data-routes');
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
			drawRoutes();
			(byKey ? cards[i].querySelector<HTMLElement>('[data-zoom-link]') : root)?.focus({ preventScroll: true });
		});
	}

	// --- Retour à la carte : l'approche jouée à l'envers, sans viseur ---
	function close() {
		if (!open) return;
		skip();
		root.removeAttribute('data-ready');
		root.removeAttribute('data-routes');
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
		root.removeAttribute('data-routes');
		const newSystem = host.nebula(to)?.key !== backKey;
		let painted = false;
		play(HOP, (t) => {
			const e = inOut(t);
			if (newSystem) { // autre système : le fond passe d'une nébuleuse à l'autre
				if (t >= 0.5 && !painted) { painted = true; paintBackdrop(to); }
				backdrop.style.opacity = (BACK_OP * (1 - 0.8 * Math.sin(Math.PI * t))).toFixed(3);
			}
			boxes[from].style.transform = `translateX(${f1(-d * 80 * e)}px) scale(${(1 - 0.2 * e).toFixed(3)})`;
			boxes[from].style.opacity = (1 - smooth(0, 0.6, t)).toFixed(3);
			boxes[to].style.transform = `translateX(${f1(d * 80 * (1 - e))}px) scale(${(0.8 + 0.2 * e).toFixed(3)})`;
			boxes[to].style.opacity = smooth(0.3, 1, t).toFixed(3);
		}, () => {
			live.delete(from);
			boxes[from].hidden = true;
			boxes[from].style.transform = '';
			drawRoutes();
		});
	}

	// Taille d'écran changée : la planète reprend sa place (la carte, cachée, se recalera au retour)
	function relayout() {
		if (!open || anim) return;
		boxes[idx].style.transform = '';
		const Q = place();
		setSpot(Q);
		showBackdrop(Q, 1, 1);
		drawRoutes();
		planets[idx]?.resize();
	}

	// Un clic ou une touche pendant le zoom l'achève tout de suite
	root.addEventListener('pointerdown', skip, true);
	root.querySelector('[data-zoom-close]')?.addEventListener('click', close);
	prevBtn?.addEventListener('click', () => hop(-1));
	routes.forEach(({ d, label }) => label.addEventListener('click', () => hop(d)));
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
