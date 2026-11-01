// Moteur de la "star map" : la liste des projets devient une carte spatiale
// parcourue au scroll (systèmes par catégorie, sauts hyperspace entre systèmes,
// zoom sur la planète d'un projet, overlay « View all », clavier et drag).
import { createZoom } from './zoom';
import { css } from './dom-writes';
import { createState, layoutStage, metrics as measure } from './state';
import { createStarfield } from './starfield';
import { createNebulas } from './nebulas';
import { buildMap } from './dom';
import { createHud } from './hud';
import { createRenderer } from './render';
import { createScroller } from './scroller';
import { createProjectList } from './project-list';
import { rgbOf, tokenRgb } from './colors';
import type { Proj, Raw, Text } from './types';
import { clamp } from '../../../domain/math';
import { pad } from '../../../domain/format';
import { systemKey } from '../../../adapters/system-colors';

// Rythme du scroll dans la carte (réglages à affiner à l'usage ; un pas : STEP_K dans state.ts, un saut entre systèmes : LEG dans layout.ts) :
const SNAP_BIAS = 0.15; // dès 15 % de pas dans un sens, le snap finit vers le projet suivant
const EDGE_PX = 40; // idem aux bords de la carte (Hero ↔ carte ↔ About), en pixels

export function initStarMap(styles: Record<string, string>) {
	const root = document.querySelector<HTMLElement>('[data-starmap]');
	const dataEl = document.getElementById('starmap-data');
	const starsLayer = root?.querySelector<HTMLElement>('[data-stars]');
	const mapLayer = root?.querySelector<HTMLElement>('[data-map]');
	const heroWrap = root?.querySelector<HTMLElement>('[data-hero-wrap]');
	const mapUi = root?.querySelector<HTMLElement>('[data-map-ui]');
	const workAnchor = root?.querySelector<HTMLElement>('[data-work-anchor]');
	const aboutEl = document.getElementById('about'); // section qui suit la carte
	const zoomEl = root?.querySelector<HTMLElement>('[data-zoom]'); // vue rapprochée (MapZoom.astro)
	if (!root || !dataEl || !starsLayer || !mapLayer || !mapUi || !zoomEl) return;

	const raw = JSON.parse(dataEl.textContent || '[]') as Raw[];
	const projects: Proj[] = raw.map((p, i) => ({
		...p,
		i,
		num: pad(i + 1),
	}));
	const text = JSON.parse(document.getElementById('starmap-text')?.textContent || '{}') as Text;
	if (!projects.length) return;

	// Reduced-motion : pas de carte animée ni de scroll-jacking.
	// On garde le Hero (statique) + la liste de repli sémantique.
	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
		root.setAttribute('data-reduced', '');
		return;
	}

	// Écran tactile : dans la carte, on navigue avec des boutons (voir « Tactile » plus bas).
	const coarse = window.matchMedia('(pointer: coarse)').matches;
	const st = createState(projects); // état partagé (state.ts)
	// Écran en portrait : la carte se parcourt de haut en bas (même règle que le CSS).
	const portraitMq = window.matchMedia('(orientation: portrait)');
	const readVp = () => {
		st.vw = window.innerWidth || 1280;
		st.screenH = window.innerHeight;
		st.vh = Math.round(clamp(Math.min(window.innerHeight || 800, (window.screen && screen.height) || 1200), 320, 1400));
		st.vertical = portraitMq.matches;
	};

	// --- Construction du DOM (une seule fois) ---
	// Étoiles de fond (scintillement, parallaxe, traînées des sauts).
	const stars = createStarfield(starsLayer, root, styles);

	const cats0 = [...new Set(projects.map((p) => p.cat))];
	// Nébuleuses : calque à part, sous la carte (nebulas.ts).
	const nebulas = createNebulas(mapUi, mapLayer, styles, cats0);
	// Éléments de la carte (dom.ts).
	const els = buildMap(root, mapLayer, styles, projects, cats0, text, (i) => clickItem(i));
	const { measureLabels, hudEl, navRows, keysEl } = els;

	// Teintes pastel des systèmes en nombres (pour les mélanger au blanc pendant un saut).
	const white = rgbOf('--rgb-text');
	const pastels = new Map(cats0.map((c) => [c, tokenRgb(`--rgb-nebula-${systemKey(c)}`)]));

	// Rendu de la carte (render.ts) et de son chrome (hud.ts).
	const chrome = createHud(st, els, heroWrap, mapUi, text);
	const renderer = createRenderer({ st, els, stars, nebulas, hud: chrome, starsLayer, text, white, pastels });


	// Vue rapprochée : la carte lui donne la position des nœuds et déplace son calque pour elle.
	const zoom = createZoom(zoomEl, {
		count: projects.length,
		nodePoint: (i) => {
			render();
			return renderer.nodePos[st.L.ord.indexOf(i)] ?? { x: st.vw / 2, y: st.vh / 2 };
		},
		label: (i) => `${projects[i].num} ${projects[i].title}`,
		camera: (map, opacity, nebula, stars) => {
			css(mapLayer, 'transform', map);
			css(nebulas.layer, 'transform', map);
			css(mapLayer, 'opacity', opacity < 1 ? opacity.toFixed(3) : '');
			css(nebulas.layer, 'opacity', nebula < 1 ? nebula.toFixed(3) : '');
			css(starsLayer, 'transform', stars);
		},
		interior: (i) => nebulas.interior(st.L.W[st.L.ord.indexOf(i)]?.g ?? -1),
		inSystem: (i) => { // place du projet dans son système (écart au centre, en rayons du système)
			const w = st.L.W[st.L.ord.indexOf(i)], g0 = w && st.L.G[w.g];
			return g0 ? { x: (w.x - w.gx) / g0.Rc, y: (w.y - w.gy) / g0.Rc } : { x: 0, y: 0 };
		},
		jumpTo: (i) => goTo(i, true),
		neighbor: (i, d) => {
			const q = st.L.ord.indexOf(i), n = q + d;
			if (q < 0 || n < 0 || n >= st.L.N) return null;
			return { dx: st.L.W[n].x - st.L.W[q].x, dy: st.L.W[n].y - st.L.W[q].y, label: `${projects[st.L.ord[n]].num} ${projects[st.L.ord[n]].title}` };
		},
		lock: (on) => {
			st.zoomOn = on;
			document.body.style.overflow = on ? 'hidden' : '';
			mapUi.toggleAttribute('data-zoom', on);
			document.documentElement.toggleAttribute('data-map-zoom', on); // la vue rapprochée couvre la page (About en pause)
			render();
		},
	}, text);

	// Liste « View all » : un projet choisi → la carte se cale dessus et zoome sur sa planète.
	const list = createProjectList(root, projects, {
		current: () => {
			const m = metrics();
			return m.ord[m.kN];
		},
		choose: (i) => {
			goTo(i, true);
			zoom.open(i);
		},
	});


	// Taille d'écran changée : disposition, scène, puis ce qui en dépend à l'écran.
	function relayout() {
		layoutStage(st, projects, root!, workAnchor);
		renderer.relayout();
	}
	const render = () => renderer.render();

	const metrics = () => measure(st);

	// --- Scroll animé (snap, flèches, boutons) ---
	const scroller = createScroller(() => st.STEP);

	// Haut de About, borné au bas de page (About + footer peuvent être plus courts que l'écran).
	const aboutTop = () =>
		Math.min(aboutEl!.getBoundingClientRect().top + window.scrollY, document.documentElement.scrollHeight - window.innerHeight);

	// Snap directionnel : on termine le mouvement dans le sens du scroll plutôt que de
	// revenir au plus proche (sinon 1-2 crans de molette sont annulés).
	function snap() {
		if (scroller.animating || st.dragging || st.touching) return;
		const m = metrics();
		const y = window.scrollY;
		const mapStart = m.stageTop + m.T;
		// Avant la carte : tout en haut, rien à faire ; entre le Hero et le 1er système,
		// jamais d'entre-deux.
		if (y < mapStart - 2) {
			if (y <= 0) return;
			// Un petit mouvement suffit (intention claire).
			const toMap = st.scrollDir > 0 ? y > EDGE_PX : y > mapStart - EDGE_PX;
			scroller.to(toMap ? mapStart : 0);
			return;
		}
		// Après le dernier projet : entre la carte et la section About, jamais d'entre-deux.
		const mapEnd = mapStart + m.Utot * m.STEP;
		if (y > mapEnd + 2) {
			if (!aboutEl) return;
			const aboutY = aboutTop();
			if (y >= aboutY - 2) return;
			const toAbout = st.scrollDir > 0 ? y > mapEnd + EDGE_PX : y > aboutY - EDGE_PX;
			scroller.to(toAbout ? aboutY : mapEnd);
			return;
		}
		const { U, u } = m;
		let k = 0;
		if (st.scrollDir > 0) {
			k = U.findIndex((v) => v >= u - SNAP_BIAS);
		} else {
			for (let q = 0; q < U.length; q++) if (U[q] <= u + SNAP_BIAS) k = q;
		}
		const target = mapStart + U[k] * m.STEP;
		if (Math.abs(target - y) > 2) scroller.to(target);
	}

	function goTo(i: number, instant = false) {
		const m = metrics();
		const k = Math.max(0, m.ord.indexOf(i));
		const target = m.stageTop + m.T + m.U[k] * m.STEP;
		if (instant) window.scrollTo({ top: target, behavior: 'instant' });
		else scroller.to(target);
	}

	function clickItem(i: number) {
		if (st.moved) return;
		const m = metrics();
		const k = m.ord.indexOf(i);
		if (Math.abs(m.u - m.U[k]) < 0.08) zoom.open(i);
		else goTo(i);
	}

	// Projet précédent (-1) ou suivant (+1) : flèches du clavier et boutons tactiles.
	function navigate(d: number, fast = false) {
		const m = metrics();
		const base = scroller.animating && st.navK != null ? st.navK : m.kN;
		const nk = clamp(base + d, 0, m.N - 1);
		if (nk === base) return;
		st.navK = nk;
		scroller.to(m.stageTop + m.T + m.U[nk] * m.STEP, fast);
	}

	function onKey(e: KeyboardEvent) {
		// Entrée sur un bouton ou un lien focalisé : on laisse le navigateur faire.
		if (e.key === 'Enter' && (e.repeat || (e.target as Element).closest?.('a, button'))) return;
		if (press(e.key, e.repeat, true) && e.key.startsWith('Arrow')) e.preventDefault();
	}
	/** Action d'une touche, au clavier ou au clic sur la barre de touches ; true si elle a servi. */
	function press(key: string, repeat = false, byKey = false): boolean {
		if (key === 'Escape') {
			zoom.close();
			list.close();
			return true;
		}
		// Vue rapprochée : ← → de planète en planète, Entrée ouvre la page du projet
		if (zoom.isOpen) {
			if (key === 'ArrowRight' || key === 'ArrowLeft') {
				if (!repeat || !zoom.busy) zoom.hop(key === 'ArrowRight' ? 1 : -1);
				return true;
			}
			if (key === 'Enter') location.href = zoom.link();
			return key === 'Enter';
		}
		if (list.isOpen) return false;
		const m = metrics();
		if (m.local < m.T * 0.9 || m.local > m.T + m.Utot * m.STEP + m.STEP) return false;
		if (key === 'ArrowRight' || key === 'ArrowLeft') {
			if (!(repeat && scroller.animating && scroller.end - performance.now() > 90)) navigate(key === 'ArrowRight' ? 1 : -1, repeat);
			return true;
		}
		if (key === 'Enter') {
			// 1er appui : zoom sur la planète du projet courant ; 2e appui (vue rapprochée) : sa page.
			if (Math.abs(m.u - m.U[m.kN]) < 0.1) zoom.open(m.ord[m.kN], byKey);
			return true;
		}
		return false;
	}

	function onDown(e: PointerEvent) {
		if (e.button !== 0 || st.vertical || coarse) return; // vertical : scroll natif ; tactile : boutons
		const startX = e.clientX;
		const startS = window.scrollY;
		const px = st.STEP / 150; // 150px de drag = un projet
		st.moved = false;
		st.dragging = true;
		const mv = (ev: PointerEvent) => {
			const dx = ev.clientX - startX;
			if (Math.abs(dx) > 6) st.moved = true;
			if (st.moved) window.scrollTo({ top: startS - dx * px, behavior: 'instant' });
		};
		const up = () => {
			window.removeEventListener('pointermove', mv);
			window.removeEventListener('pointerup', up);
			st.dragging = false;
			snap();
			setTimeout(() => {
				st.moved = false;
			}, 0);
		};
		window.addEventListener('pointermove', mv);
		window.addEventListener('pointerup', up);
	}


	// Nav : clic → voyage vers le premier projet du système.
	navRows.forEach((rowEl, gi) => {
		rowEl.addEventListener('click', () => {
			const g0 = st.L.G[gi];
			if (g0) goTo(g0.mem[0]);
		});
	});

	// --- Boucle de scroll ---
	let raf = 0;
	let snapT = 0;
	let wasOut = false;
	let lastY = window.scrollY;
	let touchEndAt = -Infinity; // aucun geste encore (sinon le chargement de la page compterait)
	let swipeY: number | null = null; // début d'un geste commencé dans la carte (tactile)
	const mapRange = () => [st.stageTop + st.T, st.stageTop + st.T + st.Utot * st.STEP];
	const onScroll = () => {
		const y = window.scrollY;
		// Tactile : un swipe lancé hors de la carte s'arrête à son bord,
		// on y entre toujours par le premier ou le dernier projet.
		if (coarse && !scroller.animating && (st.touching || performance.now() - touchEndAt < 1500)) {
			const [a, b] = mapRange();
			const edge = lastY <= a && y > a ? a : lastY >= b && y < b ? b : null;
			if (edge !== null) {
				window.scrollTo({ top: edge, behavior: 'instant' });
				lastY = edge;
				return;
			}
		}
		if (y !== lastY) st.scrollDir = y > lastY ? 1 : -1;
		lastY = y;
		if (!raf) raf = requestAnimationFrame(() => {
			raf = 0;
			// Carte sortie de l'écran (About, footer…) : un dernier rendu puis plus rien,
			// et on met le scintillement en pause.
			const out = window.scrollY > st.stageEnd;
			if (out !== wasOut) root.toggleAttribute('data-off', out);
			if (out && wasOut) return;
			wasOut = out;
			render();
		});
		clearTimeout(snapT);
		snapT = window.setTimeout(snap, 170);
	};
	const onWheel = () => {
		st.navK = null;
		st.hashIdx = -1; // l'utilisateur a pris la main : plus de recalage sur le hash
		if (scroller.animating) scroller.stop();
	};
	// Mobile : la barre d'adresse qui apparaît/disparaît au scroll déclenche un resize
	// (hauteur seule, ~60-120px). On l'ignore, sinon la carte se recalcule et saute.
	const onResize = () => {
		if (coarse && window.innerWidth === st.vw && Math.abs(window.innerHeight - st.screenH) < 160) return;
		readVp();
		relayout();
		render();
		zoom.relayout();
	};

	window.addEventListener('scroll', onScroll, { passive: true });
	window.addEventListener('wheel', onWheel, { passive: true });

	// --- Tactile : dans la carte, navigation par boutons uniquement ---
	// Le swipe ne fait pas défiler les projets ; il sert seulement à sortir de la carte
	// (vers le Hero depuis le premier projet, vers About depuis le dernier).
	function exitMap(d: number) {
		const m = metrics();
		if (d > 0 && m.kN === m.N - 1 && aboutEl) scroller.to(aboutTop());
		else if (d < 0 && m.kN === 0) scroller.to(0);
	}
	window.addEventListener('touchstart', (e) => {
		st.touching = true;
		onWheel();
		const [a, b] = mapRange();
		const y = window.scrollY;
		swipeY = coarse && !list.isOpen && !zoom.isOpen && y > a - 2 && y < b + 2 ? e.touches[0].clientY : null;
	}, { passive: true });
	window.addEventListener('touchmove', (e) => {
		if (!e.cancelable) return;
		// Vue rapprochée : la page ne défile pas, seule sa colonne (si elle déborde) le peut.
		if (zoom.isOpen) {
			if (!(e.target as Element).closest?.('[data-zoom-scroll]')) e.preventDefault();
		} else if (swipeY !== null) e.preventDefault();
	}, { passive: false });
	const onTouchEnd = (e: TouchEvent) => {
		st.touching = false;
		touchEndAt = performance.now();
		if (swipeY !== null) {
			const dy = swipeY - (e.changedTouches[0]?.clientY ?? swipeY);
			swipeY = null;
			if (Math.abs(dy) > 50) exitMap(dy > 0 ? 1 : -1);
		}
		clearTimeout(snapT);
		snapT = window.setTimeout(snap, 170);
	};
	window.addEventListener('touchend', onTouchEnd, { passive: true });
	window.addEventListener('touchcancel', onTouchEnd, { passive: true });
	window.addEventListener('resize', onResize);
	// Polices/images chargées : ce qui précède la carte a pu bouger → on remesure.
	window.addEventListener('load', () => {
		measureLabels();
		relayout();
		if (st.hashIdx >= 0) goTo(st.hashIdx, true); // recale sur le projet du hash avec la mesure finale
		render();
	});
	window.addEventListener('keydown', onKey);
	// Barre de touches (grand écran) : un clic sur une touche fait la même chose que la touche.
	keysEl?.addEventListener('click', (e) => {
		const key = (e.target as Element).closest<HTMLElement>('[data-key]')?.dataset.key;
		if (key) press(key);
	});
	mapUi.addEventListener('pointerdown', onDown);
	hudEl?.addEventListener('click', () => {
		if (st.moved) return;
		const m = metrics();
		zoom.open(m.ord[m.kN]);
	});

	// Boutons tactiles : haut de page, projet précédent / suivant, bas de page.
	root.querySelectorAll<HTMLElement>('[data-go]').forEach((btn) => {
		btn.addEventListener('click', () => {
			const go = btn.dataset.go;
			if (go === 'prev' || go === 'next') navigate(go === 'next' ? 1 : -1);
			else scroller.to(go === 'top' ? 0 : document.documentElement.scrollHeight - window.innerHeight, true);
		});
	});

	readVp();
	relayout();
	if (st.hashIdx >= 0) goTo(st.hashIdx, true);
	render();
	root.setAttribute('data-ready', '');
}
