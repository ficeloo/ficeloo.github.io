// Vue rapprochée de la star map (MapZoom.astro) : au clic sur un projet, un viseur se referme
// sur son nœud (« LOCK »), puis la caméra zoome sur sa planète (satellites compris) : elle se
// déplace jusqu'à elle, tout le décor défile (la carte, et les étoiles plus lentement, elles sont
// loin), et la planète finit au centre de la place libre, la fiche à gauche (en bas sur écran étroit).
// Autour de la planète : on plonge dans la nébuleuse de la carte, qui laisse place à un fond qui
// remplit l'écran (l'intérieur de la nébuleuse du système). Des chemins en pointillés se tracent
// vers les planètes voisines. ← → (ou un clic sur leur nom) mènent à la voisine : la planète sort
// d'un côté, la voisine entre de l'autre. Échap ramène à la carte.
//
// La carte n'est pas recalculée pendant le zoom : ses calques sont déplacés et agrandis par un
// seul transform (le moteur de la carte l'applique via ZoomHost.camera), puis s'effacent.
import { createPlanet, type Planet } from './project-planet';

/** Ce que la carte fournit au zoom. Coordonnées en px, dans le repère de l'écran de la carte. */
export interface ZoomHost {
	count: number;
	nodePoint(i: number): { x: number; y: number }; // position actuelle du nœud du projet i
	label(i: number): string; // « 03 Scop » (texte du viseur)
	camera(map: string, opacity: number, nebula: number, stars: string): void; // calques carte, nébuleuses, étoiles ('' = au repos)
	interior(i: number): HTMLCanvasElement | null; // intérieur de la nébuleuse du système du projet i (si calculé)
	inSystem(i: number): { x: number; y: number }; // place du projet dans son système (écart au centre, en rayons)
	jumpTo(i: number): void; // cale la carte (cachée) sur le projet i
	neighbor(i: number, d: number): { dx: number; dy: number; label: string } | null; // projet voisin (d = ±1) : direction sur la carte, nom
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
const KEYS_H = 110; // bas de l'écran réservé aux raccourcis clavier (écran large)
const GROW = 500; // un chemin se trace en tant de ms
const BACK_OP = 0.9; // opacité du fond (intérieur de la nébuleuse) une fois arrivé : la fiche reste lisible
const BACK_PAN = 0.11; // décalage du fond par rayon de système, en part du plus grand côté de l'écran

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
	const backCvs = [...backdrop.querySelectorAll('canvas')];
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

	type Pt = { x: number; y: number };
	/** Caméra : le point A de la carte (position d'un nœud) est montré au point S de l'écran, zoom Z
	 *  (zEnd = zoom d'arrivée). Les étoiles suivent en partie (parallaxe). En approchant, la carte
	 *  s'efface, puis sa nébuleuse laisse place au fond (intérieur de la nébuleuse), qui grandit. */
	function setCamera(A: Pt, S: Pt, Z: number, zEnd: number) {
		const Zs = Math.pow(Z, STARS_ZOOM), sx = A.x + (S.x - A.x) * STARS_PAN, sy = A.y + (S.y - A.y) * STARS_PAN;
		const near = Math.log(Math.max(1, Z)) / Math.log(Math.max(1.01, zEnd)); // 0 = carte, 1 = arrivé
		const inside = smooth(0.45, 0.92, near);
		host.camera(
			`translate(${f1(S.x - A.x * Z)}px,${f1(S.y - A.y * Z)}px) scale(${Z.toFixed(4)})`,
			1 - smooth(2.5, 8, Z),
			1 - inside,
			`translate(${f1(sx - A.x * Zs)}px,${f1(sy - A.y * Zs)}px) scale(${Zs.toFixed(4)})`,
		);
		backdrop.style.opacity = (inside * BACK_OP).toFixed(3);
		backScale = lerp(1.35, 1, inside);
		moveBackdrop();
	}
	// Le fond glisse selon la place de la planète dans son système : d'une planète à l'autre, il
	// défile (impression de déplacement) ; il ne change qu'en passant dans un autre système.
	let backScale = 1;
	let backPos = { x: 0, y: 0 };
	function moveBackdrop() {
		const o = root.getBoundingClientRect(), k = Math.max(o.width, o.height) * BACK_PAN;
		const x = cl(-backPos.x, -1.2, 1.2) * k, y = cl(-backPos.y, -1.2, 1.2) * k;
		backdrop.style.setProperty('--bx', f1(x) + 'px');
		backdrop.style.setProperty('--by', f1(y) + 'px');
		backdrop.style.setProperty('--bs', backScale.toFixed(3));
	}
	// Fond : l'intérieur de la nébuleuse du système de i, en fondu depuis celui d'avant
	let backFor: HTMLCanvasElement | null = null;
	function showInterior(i: number) {
		const src = host.interior(i);
		if (src === backFor) return;
		backFor = src;
		const next = backCvs.find((cv) => !cv.hasAttribute('data-on')) ?? backCvs[0];
		if (src) {
			next.width = next.height = src.width;
			next.getContext('2d')!.drawImage(src, 0, 0);
		}
		backCvs.forEach((cv) => cv.toggleAttribute('data-on', cv === next && !!src));
	}
	/** Planète du projet i (nœud Pi) suivant la caméra : là où son nœud tombe, à la taille du zoom. */
	function placePlanet(i: number, Pi: Pt, A: Pt, S: Pt, Z: number, Q: Spot) {
		const x = S.x + (Pi.x - A.x) * Z, y = S.y + (Pi.y - A.y) * Z;
		boxes[i].style.transform = `translate(${f1(x - Q.x)}px,${f1(y - Q.y)}px) scale(${(Z / Q.zEnd).toFixed(4)})`;
		return { x, y };
	}

	/** Plongée à l'avancement e (0 = carte, 1 = planète) : le nœud P glisse vers la cible Q en grossissant. */
	function cameraAt(i: number, P: Pt, Q: Spot, e: number) {
		const Z = Math.pow(Q.zEnd, e), S = { x: lerp(P.x, Q.x, e), y: lerp(P.y, Q.y, e) };
		setCamera(P, S, Z, Q.zEnd);
		placePlanet(i, P, P, S, Z, Q);
		boxes[i].style.opacity = smooth(0.08, 0.35, e).toFixed(3);
		return { cx: S.x, cy: S.y, Z };
	}

	// --- Chemins vers les voisines : de la planète jusqu'au bord de la place libre, le nom au bout.
	// Ils se tracent progressivement depuis la planète ; celui vers la précédente est orange (parcouru). ---
	let growRaf = 0;
	function drawRoutes() {
		cancelAnimationFrame(growRaf);
		const segs: { path: SVGPathElement; x0: number; y0: number; x1: number; y1: number }[] = [];
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
			path.toggleAttribute('data-done', d < 0);
			segs.push({ path, x0: Q.x + ux * start, y0: Q.y + uy * start, x1: Q.x + ux * tLine, y1: Q.y + uy * tLine });
			const lx = !inline || !horiz ? cl(x - lw / 2, box.x0, box.x1 - lw) : ux < 0 ? x : x - lw;
			const ly = !inline ? cl(y - lh - 6, box.y0, box.y1 - lh) : horiz ? cl(y - lh / 2, box.y0, box.y1 - lh) : uy < 0 ? y : y - lh;
			label.style.transform = `translate(${f1(lx)}px,${f1(ly)}px)`;
		});
		root.setAttribute('data-routes', '');
		const t0 = performance.now();
		const grow = (now: number) => {
			const k = outC(Math.min(1, (now - t0) / GROW));
			segs.forEach((g) => g.path.setAttribute('d', `M${f1(g.x0)} ${f1(g.y0)}L${f1(lerp(g.x0, g.x1, k))} ${f1(lerp(g.y0, g.y1, k))}`));
			if (k < 1) growRaf = requestAnimationFrame(grow);
		};
		growRaf = requestAnimationFrame(grow);
	}
	function hideRoutes() {
		cancelAnimationFrame(growRaf);
		root.removeAttribute('data-routes');
		routes.forEach(({ path }) => path.setAttribute('d', ''));
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
		showInterior(i);
		backPos = host.inSystem(i);
		hideRoutes();
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
		hideRoutes();
		showReticle(0, 0, 0, 0);
		clearTimeout(shotT);
		const i = idx;
		const P = host.nodePoint(i);
		const Q = place();
		setSpot(Q);
		play(BACK, (t) => cameraAt(i, P, Q, inOut(1 - t)), () => {
			open = false;
			live.clear();
			host.camera('', 1, 1, '');
			backdrop.style.opacity = '0';
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
		host.jumpTo(to); // la carte (cachée) se cale sur la voisine : Échap ramènera au bon projet…
		const Q = place();
		setCamera(host.nodePoint(to), Q, Q.zEnd, Q.zEnd); // … et la caméra reste sur elle
		setIdx(to);
		live.add(from);
		boxes[from].hidden = false;
		planetOf(to);
		showCard(to, d);
		const same = host.interior(to) === host.interior(from);
		showInterior(to);
		hideRoutes();
		const p0 = backPos, p1 = host.inSystem(to);
		if (!same) { backPos = p1; moveBackdrop(); } // autre système : nouveau fond, en fondu
		play(HOP, (t) => {
			const e = inOut(t);
			if (same) { backPos = { x: lerp(p0.x, p1.x, e), y: lerp(p0.y, p1.y, e) }; moveBackdrop(); } // même système : le fond défile
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
		setCamera(host.nodePoint(idx), Q, Q.zEnd, Q.zEnd);
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
