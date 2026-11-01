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
// Ce fichier enchaîne les étapes ; les parties : anim.ts (étapes), camera.ts (caméra, fond),
// routes.ts (chemins vers les voisines), card.ts (fiche et diaporama).
import { createPlanet, type Planet } from '../../planet';
import { frameGap } from '../../frame-pace';
import { trapTab } from '../../focus-trap';
import { easeInOutCubic, easeOutCubic, lerp, smoothstep } from '../../../../domain/math';
import { f1 } from '../../../../domain/format';
import { createAnimator } from './anim';
import { NODE_R, createCamera } from './camera';
import { createRoutes } from './routes';
import { createCards } from './card';
import type { ZoomHost } from './types';

export type { ZoomHost } from './types';

// Durées (ms) : zoom ×1,5 par rapport à la maquette (demande de Théophile)
const LOCK = 450; // le viseur se referme
const DIVE = 1500; // approche
const BACK = 800; // retour à la carte
const HOP = 600; // planète voisine

export function createZoom(root: HTMLElement, host: ZoomHost, text: { targeting: string; lock: string }) {
	const boxes = [...root.querySelectorAll<HTMLElement>('[data-zoom-planet]')];
	const planets: (Planet | null)[] = boxes.map(() => null);
	const planetsEl = root.querySelector<HTMLElement>('[data-zoom-planets]')!;
	const cardsEl = root.querySelector<HTMLElement>('[data-zoom-scroll]')!;
	const narrow = matchMedia('(max-width: 700px), (orientation: portrait)'); // fiche en bas ou en haut (CSS)
	const tall = matchMedia('(orientation: portrait) and (min-width: 701px)'); // fiche en haut, planète dessous (CSS)
	const reticle = root.querySelector<HTMLElement>('[data-zoom-reticle]')!;
	const reticleText = root.querySelector<HTMLElement>('[data-zoom-reticle-text]')!;
	const backdrop = root.querySelector<HTMLElement>('[data-zoom-backdrop]')!;

	const anim = createAnimator();
	const cam = createCamera(host, { root, cardsEl, planetsEl, backdrop, boxes }, narrow, tall);
	const routes = createRoutes(root, cardsEl, host, cam.place, narrow, tall);
	const cards = createCards(root, host.count);

	let open = false;
	let idx = 0;
	const live = new Set<number>(); // planètes à animer (la courante, et l'ancienne pendant un bond)

	// --- Planètes : animées tant qu'elles sont affichées (30 images/s en tactile ou fenêtre inactive) ---
	let loopRaf = 0;
	let lastFrame = 0;
	const loop = (ms: number) => {
		if (!open) { loopRaf = 0; return; }
		if (ms - lastFrame > frameGap()) {
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

	function showReticle(x: number, y: number, size: number, opacity: number, label?: string) {
		reticle.style.transform = `translate(${f1(x - size / 2)}px,${f1(y - size / 2)}px)`;
		reticle.style.width = reticle.style.height = f1(size) + 'px';
		reticle.style.opacity = opacity.toFixed(3);
		if (label !== undefined && reticleText.textContent !== label) reticleText.textContent = label;
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
		cards.show(i);
		if (!loopRaf) loopRaf = requestAnimationFrame(loop);
		const P = host.nodePoint(i);
		const Q = cam.place();
		cam.setSpot(Q);
		const name = host.label(i);
		boxes[i].style.opacity = '0';
		cam.showInterior(i);
		cam.backPos = host.inSystem(i);
		routes.hide();
		anim.chain([
			[LOCK, (t) => {
				const e = easeOutCubic(t);
				showReticle(P.x, P.y, lerp(130, 34, e), Math.min(1, t * 3), t > 0.6 ? `${text.lock} · ${name}` : text.targeting);
			}],
			[DIVE, (t) => {
				const { cx, cy, Z } = cam.cameraAt(i, P, Q, easeInOutCubic(t));
				showReticle(cx, cy, Math.max(34, NODE_R * Z * 2.9), 1 - smoothstep(0.7, 1, t), `${text.lock} · ${name}`);
			}],
		], () => {
			root.setAttribute('data-ready', '');
			routes.draw(idx);
			(byKey ? cards.link(i) : root)?.focus({ preventScroll: true });
		});
	}

	// --- Retour à la carte : l'approche jouée à l'envers, sans viseur ---
	function close() {
		if (!open) return;
		anim.skip();
		root.removeAttribute('data-ready');
		routes.hide();
		showReticle(0, 0, 0, 0);
		cards.stop();
		const i = idx;
		const P = host.nodePoint(i);
		const Q = cam.place();
		cam.setSpot(Q);
		anim.play(BACK, (t) => cam.cameraAt(i, P, Q, easeInOutCubic(1 - t)), () => {
			open = false;
			live.clear();
			host.camera('', 1, 1, '');
			backdrop.style.opacity = '0';
			boxes[i].hidden = true;
			boxes[i].style.transform = '';
			cards.cards[i].hidden = true;
			root.hidden = true;
			host.lock(false);
		});
	}

	// --- Planète voisine : l'une sort d'un côté, l'autre entre de l'autre ---
	function hop(d: number) {
		if (!open) return;
		anim.skip();
		const from = idx, to = idx + d;
		if (to < 0 || to >= host.count) return;
		host.jumpTo(to); // la carte (cachée) se cale sur la voisine : Échap ramènera au bon projet…
		const Q = cam.place();
		cam.setCamera(host.nodePoint(to), Q, Q.zEnd, Q.zEnd); // … et la caméra reste sur elle
		setIdx(to);
		live.add(from);
		boxes[from].hidden = false;
		planetOf(to);
		cards.show(to, d);
		const same = host.interior(to) === host.interior(from);
		cam.showInterior(to);
		routes.hide();
		const p0 = cam.backPos, p1 = host.inSystem(to);
		if (!same) { cam.backPos = p1; cam.moveBackdrop(); } // autre système : nouveau fond, en fondu
		anim.play(HOP, (t) => {
			const e = easeInOutCubic(t);
			if (same) { cam.backPos = { x: lerp(p0.x, p1.x, e), y: lerp(p0.y, p1.y, e) }; cam.moveBackdrop(); } // même système : le fond défile
			boxes[from].style.transform = `translateX(${f1(-d * 80 * e)}px) scale(${(1 - 0.2 * e).toFixed(3)})`;
			boxes[from].style.opacity = (1 - smoothstep(0, 0.6, t)).toFixed(3);
			boxes[to].style.transform = `translateX(${f1(d * 80 * (1 - e))}px) scale(${(0.8 + 0.2 * e).toFixed(3)})`;
			boxes[to].style.opacity = smoothstep(0.3, 1, t).toFixed(3);
		}, () => {
			live.delete(from);
			boxes[from].hidden = true;
			boxes[from].style.transform = '';
			routes.draw(idx);
		});
	}

	// Taille d'écran changée : la planète reprend sa place (la carte, cachée, se recalera au retour)
	function relayout() {
		if (!open || anim.busy) return;
		boxes[idx].style.transform = '';
		const Q = cam.place();
		cam.setSpot(Q);
		cam.setCamera(host.nodePoint(idx), Q, Q.zEnd, Q.zEnd);
		routes.draw(idx);
		planets[idx]?.resize();
	}

	// Un clic ou une touche pendant le zoom l'achève tout de suite
	root.addEventListener('pointerdown', anim.skip, true);
	root.querySelector('[data-zoom-close]')?.addEventListener('click', close);
	cards.prevBtn?.addEventListener('click', () => hop(-1));
	routes.routes.forEach(({ d, label }) => label.addEventListener('click', () => hop(d)));
	cards.nextBtn?.addEventListener('click', () => hop(1));
	// Dialog : Tab boucle sur les contrôles visibles de la vue
	trapTab(root, () => [...root.querySelectorAll<HTMLElement>('a, button')].filter((el) => el.offsetParent && !(el as HTMLButtonElement).disabled));

	return {
		get isOpen() { return open; },
		get index() { return idx; },
		get busy() { return anim.busy; },
		link: () => cards.link(idx)?.href ?? '',
		skip: anim.skip,
		open: openAt,
		close,
		hop,
		relayout,
	};
}
