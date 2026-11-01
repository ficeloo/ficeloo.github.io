// Moteur de la "star map" : la liste des projets devient une carte spatiale parcourue au scroll
// (systèmes par catégorie, sauts hyperspace entre systèmes, zoom sur la planète d'un projet,
// overlay « View all », clavier, drag et tactile). Ce fichier assemble les parties :
//   state.ts      état partagé, taille d'écran, scène     layout.ts     disposition (calcul pur)
//   dom.ts        éléments de la carte                    frame.ts      une image : caméra, saut (calcul pur)
//   render.ts     dessin de la carte                      hud.ts        Hero → carte, compteur, HUD
//   starfield.ts  étoiles                                 nebulas.ts    nébuleuses (+ worker)
//   navigation.ts snap, aller à un projet                 scroller.ts   scroll animé
//   input.ts      clavier, souris, boutons                scroll-loop.ts scroll, tactile, resize
//   zoom.ts       vue rapprochée                          project-list.ts liste « View all »
import { createZoom } from './zoom';
import { css } from './dom-writes';
import { createState, layoutStage, metrics, readViewport } from './state';
import { createStarfield } from './starfield';
import { createNebulas } from './nebulas';
import { buildMap } from './dom';
import { createHud } from './hud';
import { createRenderer } from './render';
import { createScroller } from './scroller';
import { createNavigation } from './navigation';
import { createProjectList } from './project-list';
import { bindInput } from './input';
import { bindScrollLoop } from './scroll-loop';
import { rgbOf, tokenRgb } from './colors';
import type { Proj, Raw, Text } from './types';
import { pad } from '../../../domain/format';
import { systemKey } from '../../../adapters/system-colors';

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

	// Écran tactile : dans la carte, on navigue avec des boutons (scroll-loop.ts).
	const coarse = window.matchMedia('(pointer: coarse)').matches;
	const st = createState(projects); // état partagé (state.ts)

	// --- Construction du DOM (une seule fois) ---
	// Étoiles de fond (scintillement, parallaxe, traînées des sauts).
	const stars = createStarfield(starsLayer, root, styles);

	const cats0 = [...new Set(projects.map((p) => p.cat))];
	// Nébuleuses : calque à part, sous la carte (nebulas.ts).
	const nebulas = createNebulas(mapUi, mapLayer, styles, cats0);
	// Éléments de la carte (dom.ts).
	const els = buildMap(root, mapLayer, styles, projects, cats0, text, (i) => input.clickItem(i));

	// Teintes pastel des systèmes en nombres (pour les mélanger au blanc pendant un saut).
	const white = rgbOf('--rgb-text');
	const pastels = new Map(cats0.map((c) => [c, tokenRgb(`--rgb-nebula-${systemKey(c)}`)]));

	// Rendu de la carte (render.ts) et de son chrome (hud.ts).
	const chrome = createHud(st, els, heroWrap, mapUi, text);
	const renderer = createRenderer({ st, els, stars, nebulas, hud: chrome, starsLayer, text, white, pastels });
	const render = () => renderer.render();
	// Taille d'écran changée : disposition, scène, puis ce qui en dépend à l'écran.
	function relayout() {
		layoutStage(st, projects, root!, workAnchor);
		renderer.relayout();
	}

	// Scroll animé ; snap, aller à un projet, précédent / suivant (navigation.ts).
	const scroller = createScroller(() => st.STEP);
	const nav = createNavigation(st, scroller, aboutEl);
	const { goTo } = nav;

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
			const m = metrics(st);
			return m.ord[m.kN];
		},
		choose: (i) => {
			goTo(i, true);
			zoom.open(i);
		},
	});

	// Entrées (input.ts) et boucle de scroll (scroll-loop.ts).
	const ctx = { st, root, mapUi, coarse, els, scroller, nav, zoom, list, render, relayout };
	const input = bindInput(ctx);
	bindScrollLoop(ctx);

	readViewport(st);
	relayout();
	if (st.hashIdx >= 0) goTo(st.hashIdx, true);
	render();
	root.setAttribute('data-ready', '');
}
