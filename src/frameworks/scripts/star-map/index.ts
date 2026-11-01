// Moteur de la "star map" : la liste des projets devient une carte spatiale
// parcourue au scroll (systèmes par catégorie, sauts hyperspace entre systèmes,
// zoom sur la planète d'un projet, overlay « View all », clavier et drag).
import { createZoom } from './zoom';
import { attr, changed, css, txt } from './dom-writes';
import { layoutMap, type Pt } from './layout';
import { createScroller } from './scroller';
import { createStarfield } from './starfield';
import { createNebulas } from './nebulas';
import { mixRgb, rgbOf, tokenRgb } from './colors';
import { createProjectList } from './project-list';
import { clamp, hash, lerp } from '../../../domain/math';
import { f1, pad } from '../../../domain/format';
import { nebulaRgb, systemColor, systemKey, systemRgb } from '../../../adapters/system-colors';

type Raw = {
	slug: string;
	title: string;
	description: string;
	cat: string;
	tag: string;
	year: string;
	wip: boolean; // projet en cours : badge « In progress »
	img: string;
	alt: string;
	link: string; // page projet, dans la langue de la page
};
type Proj = Raw & { i: number; num: string };
// Textes de l'interface, traduits au build (StarMap.astro) : {name} et {n} y sont remplacés.
type Text = { entering: string; system: string; selected: string; project: string; projects: string; targeting: string; lock: string };

// Rythme du scroll dans la carte (réglages à affiner à l'usage ; un saut entre systèmes : LEG dans layout.ts) :
const STEP_K = 0.6; // distance de scroll entre deux projets, en hauteur d'écran
const SNAP_BIAS = 0.15; // dès 15 % de pas dans un sens, le snap finit vers le projet suivant
const EDGE_PX = 40; // idem aux bords de la carte (Hero ↔ carte ↔ About), en pixels

// Couleurs du thème (tokens.css) pour les styles écrits par le moteur.
const ACCENT = 'var(--color-accent)';
const TEXT = 'var(--color-text)';
const TEXT_DIM = 'var(--color-text-dim)';

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
	const sysName = (c: string) => text.system.replace('{name}', c);
	if (!projects.length) return;

	// Reduced-motion : pas de carte animée ni de scroll-jacking.
	// On garde le Hero (statique) + la liste de repli sémantique.
	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
		root.setAttribute('data-reduced', '');
		return;
	}

	// Écran tactile : dans la carte, on navigue avec des boutons (voir « Tactile » plus bas).
	const coarse = window.matchMedia('(pointer: coarse)').matches;
	let vw = 1280;
	let vh = 800;
	let lastH = 0;
	// Écran en portrait : la carte se parcourt de haut en bas (même règle que le CSS).
	const portraitMq = window.matchMedia('(orientation: portrait)');
	let vertical = false;
	const readVp = () => {
		vw = window.innerWidth || 1280;
		lastH = window.innerHeight;
		vh = Math.round(clamp(Math.min(window.innerHeight || 800, (window.screen && screen.height) || 1200), 320, 1400));
		vertical = portraitMq.matches;
	};

	// --- Construction du DOM (une seule fois) ---
	// Étoiles de fond (scintillement, parallaxe, traînées des sauts).
	const stars = createStarfield(starsLayer, root, styles);

	const NS = 'http://www.w3.org/2000/svg';
	const svg = document.createElementNS(NS, 'svg');
	svg.setAttribute('class', styles.paths);
	const mkPath = (dash?: string, w = '1') => {
		const p = document.createElementNS(NS, 'path');
		p.setAttribute('fill', 'none');
		p.style.stroke = 'rgba(var(--rgb-secondary), 0.6)';
		p.setAttribute('stroke-width', w);
		p.setAttribute('vector-effect', 'non-scaling-stroke'); // trait constant malgré le zoom du <g>
		if (dash) {
			p.setAttribute('stroke-dasharray', dash);
			p.setAttribute('stroke-linecap', 'round');
		}
		return p;
	};
	const legPath = mkPath('2 7', '1.2');
	const sysPath = mkPath();
	const sysTPath = mkPath(undefined, '1.5');
	sysTPath.style.stroke = ACCENT;
	sysTPath.setAttribute('stroke-opacity', '0.75');
	const legTPath = mkPath('2 7', '1.2');
	legTPath.style.stroke = ACCENT;
	legTPath.setAttribute('stroke-opacity', '0.8');
	// Chemins en coordonnées "monde", construits une fois ; seul le <g> bouge (caméra).
	const pathsG = document.createElementNS(NS, 'g');
	pathsG.append(legPath, sysPath, sysTPath, legTPath);
	svg.appendChild(pathsG);
	mapLayer.appendChild(svg);

	const cats0 = [...new Set(projects.map((p) => p.cat))];
	// Nébuleuses : calque à part, sous la carte (nebulas.ts).
	const nebulas = createNebulas(mapUi, mapLayer, styles, cats0);
	// Systèmes : anneau et nom.
	const groupEls = cats0.map((c) => {
		const ring = document.createElement('div');
		ring.className = styles.ring;
		ring.style.borderColor = `rgba(${systemRgb(c)}, 0.35)`;
		const label = document.createElement('div');
		label.className = styles['sys-label'];
		mapLayer.appendChild(ring);
		mapLayer.appendChild(label);
		return { ring, label };
	});

	const nodeEls = projects.map((pr, idx) => {
		const dot = document.createElement('div');
		dot.className = styles.node;
		const label = document.createElement('div');
		label.className = styles['node-label'];
		const numSpan = document.createElement('span');
		numSpan.className = styles.num;
		numSpan.textContent = pr.num;
		label.append(numSpan, document.createTextNode('  ' + pr.title));
		const onClick = () => clickItem(idx);
		dot.addEventListener('click', onClick);
		label.addEventListener('click', onClick);
		mapLayer.appendChild(dot);
		mapLayer.appendChild(label);
		return { dot, label };
	});

	// Largeur réelle de chaque étiquette, pour 1 px de police (mesurée au canvas, sans relire la mise
	// en page) : l'étiquette se place du côté où elle tient, ou passe sur deux lignes.
	const ruler = document.createElement('canvas').getContext('2d')!;
	let labelEm: number[] = [];
	function measureLabels() {
		ruler.font = `100px ${getComputedStyle(nodeEls[0].label).fontFamily}`;
		labelEm = nodeEls.map(({ label }) => {
			const t = (label.textContent ?? '').replace(/\s+/g, ' ').toUpperCase();
			return (ruler.measureText(t).width + t.length * 14) / 100; // + letter-spacing 0.14em
		});
	}
	measureLabels();

	// Poussière (16 grains par système).
	// Taille/opacité fixes ; position monde (wx, wy) recalculée au relayout.
	const dustEls: { el: HTMLElement; g: number; d: number; o: number; sz: number; wx: number; wy: number }[] = [];
	for (let g = 0; g < cats0.length; g++) {
		for (let d = 0; d < 16; d++) {
			const el = document.createElement('div');
			el.className = styles.dust;
			const sz = hash(d * 11.3 + g) < 0.8 ? 2 : 3;
			el.style.width = sz + 'px';
			el.style.height = sz + 'px';
			el.style.background = `rgb(${nebulaRgb(cats0[g])})`;
			mapLayer.appendChild(el);
			dustEls.push({ el, g, d, o: 0.25 + hash(d * 7.9 + g * 3) * 0.45, sz, wx: 0, wy: 0 });
		}
	}

	// Teintes pastel des systèmes en nombres (pour les mélanger au blanc pendant un saut).
	const white = rgbOf('--rgb-text');
	const pastels = new Map(cats0.map((c) => [c, tokenRgb(`--rgb-nebula-${systemKey(c)}`)]));

	// Saut hyperspace : sonde, pulse d'arrivée, carte d'arrivée.
	const probeEl = document.createElement('div');
	probeEl.className = styles.probe;
	const pulseEl = document.createElement('div');
	pulseEl.className = styles.pulse;
	mapLayer.appendChild(probeEl);
	mapLayer.appendChild(pulseEl);

	const arrivalEl = document.createElement('div');
	arrivalEl.className = styles.arrival;
	const arrLabel = document.createElement('div');
	arrLabel.className = styles['arrival-label'];
	arrLabel.textContent = text.entering;
	const arrTitle = document.createElement('div');
	arrTitle.className = styles['arrival-title'];
	const arrNum = document.createElement('span');
	arrNum.className = styles.num;
	const arrName = document.createTextNode('');
	arrTitle.append(arrNum, arrName);
	const arrCount = document.createElement('div');
	arrCount.className = styles['arrival-count'];
	arrivalEl.append(arrLabel, arrTitle, arrCount);
	mapLayer.appendChild(arrivalEl);

	// Références du chrome (rendu côté serveur dans StarMap.astro).
	const counterEl = root.querySelector<HTMLElement>('[data-counter]');
	const hudEl = root.querySelector<HTMLElement>('[data-hud]');
	const hud = {
		cat: root.querySelector<HTMLElement>('[data-hud-cat]'),
		img: root.querySelector<HTMLImageElement>('[data-hud-img]'),
		title: root.querySelector<HTMLElement>('[data-hud-title]'),
		tag: root.querySelector<HTMLElement>('[data-hud-tag]'),
		year: root.querySelector<HTMLElement>('[data-hud-year]'),
		wip: root.querySelector<HTMLElement>('[data-hud-wip]'),
	};
	const navRows = Array.from(root.querySelectorAll<HTMLElement>('[data-nav-row]'));
	const navBars = navRows.map((r) => r.querySelector<HTMLElement>('[data-nav-bar]'));

	const keysEl = root.querySelector<HTMLElement>('[data-keys]');
	const keyEnds = [...root.querySelectorAll<HTMLButtonElement>('[data-keys] [data-key^="Arrow"]')];
	const goPrev = root.querySelector<HTMLButtonElement>('[data-go="prev"]');
	const goNext = root.querySelector<HTMLButtonElement>('[data-go="next"]');

	// Vue rapprochée : la carte lui donne la position des nœuds et déplace son calque pour elle.
	let zoomOn = false;
	const nodePos: Pt[] = []; // position écran des nœuds au dernier rendu (ordre de la carte)
	const zoom = createZoom(zoomEl, {
		count: projects.length,
		nodePoint: (i) => {
			render();
			return nodePos[L.ord.indexOf(i)] ?? { x: vw / 2, y: vh / 2 };
		},
		label: (i) => `${projects[i].num} ${projects[i].title}`,
		camera: (map, opacity, nebula, stars) => {
			css(mapLayer, 'transform', map);
			css(nebulas.layer, 'transform', map);
			css(mapLayer, 'opacity', opacity < 1 ? opacity.toFixed(3) : '');
			css(nebulas.layer, 'opacity', nebula < 1 ? nebula.toFixed(3) : '');
			css(starsLayer, 'transform', stars);
		},
		interior: (i) => nebulas.interior(L.W[L.ord.indexOf(i)]?.g ?? -1),
		inSystem: (i) => { // place du projet dans son système (écart au centre, en rayons du système)
			const w = L.W[L.ord.indexOf(i)], g0 = w && L.G[w.g];
			return g0 ? { x: (w.x - w.gx) / g0.Rc, y: (w.y - w.gy) / g0.Rc } : { x: 0, y: 0 };
		},
		jumpTo: (i) => goTo(i, true),
		neighbor: (i, d) => {
			const q = L.ord.indexOf(i), n = q + d;
			if (q < 0 || n < 0 || n >= L.N) return null;
			return { dx: L.W[n].x - L.W[q].x, dy: L.W[n].y - L.W[q].y, label: `${projects[L.ord[n]].num} ${projects[L.ord[n]].title}` };
		},
		lock: (on) => {
			zoomOn = on;
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

	const layout = () => layoutMap(projects, { vw, vh, vertical });

	// --- Cache de disposition ---
	// Perf : tout ce qui ne dépend que de la taille d'écran est calculé au relayout
	// (init, resize, load) et plus à chaque frame de scroll.
	let L: ReturnType<typeof layout>;
	let stageTop = 0;
	let stageEnd = 0;
	let T = 0;
	let STEP = 0;
	let Utot = 0;
	let legPts: (Pt[] | null)[] = []; // points échantillonnés des sauts (monde)
	const D = (arr: Pt[]) => (arr.length ? 'M' + arr.map((s) => f1(s.x) + ' ' + f1(s.y)).join(' L') + ' ' : '');
	const lp = (q: number, t: number): Pt => {
		const W = L.W;
		return { x: W[q].x + (W[q + 1].x - W[q].x) * t, y: W[q].y + (W[q + 1].y - W[q].y) * t };
	};

	function relayout() {
		L = layout();
		const { W, G, N } = L;
		stars.place(vertical);
		T = vh * 0.9;
		STEP = vh * STEP_K;
		Utot = L.U[N - 1] || 0;
		const h = vh + T + Utot * STEP;
		root!.style.height = h + 'px';
		if (workAnchor) workAnchor.style.top = T + 'px';
		stageTop = root!.getBoundingClientRect().top + window.scrollY;
		stageEnd = stageTop + h;

		// Chemins de base (statiques en coordonnées monde).
		let sysD = '';
		let legD = '';
		legPts = [];
		for (let q = 0; q < N - 1; q++) {
			if (W[q + 1].g !== W[q].g) {
				legPts[q] = Array.from({ length: 49 }, (_, s) => lp(q, s / 48));
				legD += D(legPts[q]!);
			} else {
				legPts[q] = null;
				sysD += D([W[q], W[q + 1]]);
			}
		}
		sysPath.setAttribute('d', sysD);
		legPath.setAttribute('d', legD);
		attr(svg, 'width', String(vw));
		attr(svg, 'height', String(vh));

		// Poussière : position monde autour de son système.
		dustEls.forEach((du) => {
			const g0 = G[du.g];
			const a = hash(g0.g * 97 + du.d * 3.1) * Math.PI * 2;
			const rr = Math.sqrt(hash(g0.g * 53 + du.d * 5.7)) * g0.Rc * 1.15;
			du.wx = g0.gx + Math.cos(a) * rr * (vertical ? 0.8 : 1.1);
			du.wy = g0.gy + Math.sin(a) * rr * (vertical ? 1.1 : 0.8);
		});

		G.forEach((g0, gi) => txt(groupEls[gi].label, pad(g0.g + 1) + ' · ' + sysName(g0.c)));
	}

	type Metrics = ReturnType<typeof layout> & {
		stageTop: number; T: number; STEP: number; Utot: number; local: number; u: number; p: number; kN: number;
	};
	function metrics(): Metrics {
		const local = window.scrollY - stageTop;
		const u = clamp((local - T) / STEP, 0, Utot);
		const p = clamp(local / T, 0, 1);
		let kN = 0;
		L.U.forEach((v, k) => {
			if (Math.abs(v - u) < Math.abs(L.U[kN] - u)) kN = k;
		});
		return { ...L, stageTop, T, STEP, Utot, local, u, p, kN };
	}

	// --- État navigation ---
	let moved = false; // le geste en cours est un drag (pas un clic)
	let dragging = false;
	let navK: number | null = null; // projet visé par les flèches pendant l'animation
	let scrollDir = 1; // sens du dernier scroll (1 = vers le bas)
	let touching = false; // doigt posé : pas de snap avant qu'il soit levé
	// Retour depuis une page projet (« ← Back ») : /#project-<slug> → carte calée sur ce projet.
	const hashSlug = /^#project-(.+)$/.exec(decodeURIComponent(location.hash))?.[1];
	let hashIdx = hashSlug ? projects.findIndex((p) => p.slug === hashSlug) : -1;

	// Direction du scroll (pour l'affichage inter-systèmes).
	let lastU = 0;
	let dir = 1;

	// --- Scroll animé (snap, flèches, boutons) ---
	const scroller = createScroller(() => STEP);

	// Haut de About, borné au bas de page (About + footer peuvent être plus courts que l'écran).
	const aboutTop = () =>
		Math.min(aboutEl!.getBoundingClientRect().top + window.scrollY, document.documentElement.scrollHeight - window.innerHeight);

	// Snap directionnel : on termine le mouvement dans le sens du scroll plutôt que de
	// revenir au plus proche (sinon 1-2 crans de molette sont annulés).
	function snap() {
		if (scroller.animating || dragging || touching) return;
		const m = metrics();
		const y = window.scrollY;
		const mapStart = m.stageTop + m.T;
		// Avant la carte : tout en haut, rien à faire ; entre le Hero et le 1er système,
		// jamais d'entre-deux.
		if (y < mapStart - 2) {
			if (y <= 0) return;
			// Un petit mouvement suffit (intention claire).
			const toMap = scrollDir > 0 ? y > EDGE_PX : y > mapStart - EDGE_PX;
			scroller.to(toMap ? mapStart : 0);
			return;
		}
		// Après le dernier projet : entre la carte et la section About, jamais d'entre-deux.
		const mapEnd = mapStart + m.Utot * m.STEP;
		if (y > mapEnd + 2) {
			if (!aboutEl) return;
			const aboutY = aboutTop();
			if (y >= aboutY - 2) return;
			const toAbout = scrollDir > 0 ? y > mapEnd + EDGE_PX : y > aboutY - EDGE_PX;
			scroller.to(toAbout ? aboutY : mapEnd);
			return;
		}
		const { U, u } = m;
		let k = 0;
		if (scrollDir > 0) {
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
		if (moved) return;
		const m = metrics();
		const k = m.ord.indexOf(i);
		if (Math.abs(m.u - m.U[k]) < 0.08) zoom.open(i);
		else goTo(i);
	}

	// Projet précédent (-1) ou suivant (+1) : flèches du clavier et boutons tactiles.
	function navigate(d: number, fast = false) {
		const m = metrics();
		const base = scroller.animating && navK != null ? navK : m.kN;
		const nk = clamp(base + d, 0, m.N - 1);
		if (nk === base) return;
		navK = nk;
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
		if (e.button !== 0 || vertical || coarse) return; // vertical : scroll natif ; tactile : boutons
		const startX = e.clientX;
		const startS = window.scrollY;
		const px = STEP / 150; // 150px de drag = un projet
		moved = false;
		dragging = true;
		const mv = (ev: PointerEvent) => {
			const dx = ev.clientX - startX;
			if (Math.abs(dx) > 6) moved = true;
			if (moved) window.scrollTo({ top: startS - dx * px, behavior: 'instant' });
		};
		const up = () => {
			window.removeEventListener('pointermove', mv);
			window.removeEventListener('pointerup', up);
			dragging = false;
			snap();
			setTimeout(() => {
				moved = false;
			}, 0);
		};
		window.addEventListener('pointermove', mv);
		window.addEventListener('pointerup', up);
	}


	// --- Rendu : une image de la carte pour la position de scroll actuelle ---
	// frame() calcule l'image (avancement, caméra, saut en cours) ; chaque partie de la carte se
	// dessine ensuite à partir d'elle.
	type Frame = {
		m: Metrics;
		u: number; // avancement dans la carte, en pas
		p: number; // passage Hero → carte (0 → 1)
		ease: number; // p adouci
		j: number; // dernier projet atteint (ordre de la carte)
		f: number; // avancement vers le suivant (0 → 1)
		leg: boolean; // en plein saut hyperspace (le suivant est dans un autre système)
		cam: Pt; // caméra (coordonnées monde)
		wave: number; // 0 → 1 → 0 pendant un saut
		z: number; // zoom de la caméra (elle recule pendant un saut)
		ox: number; // point de l'écran où se trouve la caméra
		oy: number;
		navW: number; // largeur réservée à la nav des systèmes, à droite
		S: (q: Pt) => Pt; // monde → écran
		curG: number; // système du projet le plus proche (stable au retour)
		rot: number; // direction du saut (degrés)
		fArr: number; // avancement du saut dans le sens du voyage (f en avant, 1-f en arrière)
		arrOp: number; // opacité de la carte d'arrivée dans un système
		dim: number; // atténuation de la carte pendant cette arrivée
	};
	const at = (x: number, y: number) => `translate(${f1(x)}px,${f1(y)}px)`;

	function render() {
		const fr = frame();
		renderHeroTransition(fr);
		renderPaths(fr);
		stars.render({ vw, vh, vertical }, fr.cam, fr.wave, fr.rot);
		renderWarp(fr);
		renderSystems(fr);
		renderNodes(fr);
		renderDust(fr);
		renderHyperspace(fr);
		renderHud(fr);
	}

	function frame(): Frame {
		const m = metrics();
		const { W, U, N } = m;
		const u = m.u;
		const p = m.p;
		if (u > lastU) dir = 1;
		else if (u < lastU) dir = -1;
		lastU = u;
		const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

		let j = 0;
		while (j < N - 1 && U[j + 1] <= u) j++;
		const last = j >= N - 1;
		const f = last ? 0 : (u - U[j]) / (U[j + 1] - U[j]);
		const leg = !last && W[j + 1].g !== W[j].g;
		// Caméra : suit le nœud dans le sens du parcours, le centre du système en travers.
		const camF = (q: number): Pt =>
			vertical
				? { x: W[q].x * 0.45 + W[q].gx * 0.55, y: W[q].y * 0.7 + W[q].gy * 0.3 }
				: { x: W[q].x * 0.7 + W[q].gx * 0.3, y: W[q].y * 0.45 + W[q].gy * 0.55 };
		let cam: Pt;
		if (last) cam = camF(N - 1);
		else if (!leg) {
			const a = camF(j);
			const b = camF(j + 1);
			cam = { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) };
		} else {
			const q = lp(j, f);
			const a = camF(j);
			const b = camF(j + 1);
			cam = { x: q.x + (1 - f) * (a.x - W[j].x) + f * (b.x - W[j + 1].x), y: q.y + (1 - f) * (a.y - W[j].y) + f * (b.y - W[j + 1].y) };
		}
		const wave = leg ? Math.sin(Math.PI * f) : 0;
		const z = 1 - wave * 0.5;
		const hudW = Math.min(300, vw * 0.3);
		// Vertical : carte un peu à gauche (labels à droite des nœuds), un peu plus haut
		// (bandeau HUD en bas), pas de nav systèmes.
		const ox = vertical ? vw * 0.36 : vw >= 1200 ? vw / 2 + hudW * 0.3 - 60 : vw / 2;
		const navW = vertical ? 0 : vw >= 1200 ? 280 : 120;
		const oy = vh * (vertical ? 0.42 : 0.45) + (1 - ease) * vh * 0.9;
		const S = (q: Pt): Pt => ({ x: ox + (q.x - cam.x) * z, y: oy + (q.y - cam.y) * z });

		const curG = W[m.kN].g;
		const rot = leg ? (Math.atan2(W[j + 1].y - W[j].y, W[j + 1].x - W[j].x) * 180) / Math.PI : 0;
		const fArr = dir >= 0 ? f : 1 - f;
		// Carte système en plateau : apparaît tôt (dès 5% du saut), pleine opacité
		// de 20% à 78%, puis fond — laisse le temps de lire le nom du système.
		const arrOp = leg ? Math.min(clamp((fArr - 0.05) / 0.15, 0, 1), clamp((0.88 - fArr) / 0.1, 0, 1)) : 0;
		const dim = 1 - arrOp * 0.9;
		return { m, u, p, ease, j, f, leg, cam, wave, z, ox, oy, navW, S, curG, rot, fArr, arrOp, dim };
	}

	/** Transition Hero → carte, et apparition de la carte et de la barre de touches. */
	function renderHeroTransition({ p, ease }: Frame) {
		if (heroWrap) {
			css(heroWrap, 'transform', `translateY(${f1(-ease * vh * 0.35)}px) scale(${(1 - ease * 0.12).toFixed(3)})`);
			const heroOp = clamp(1 - p * 1.6, 0, 1);
			css(heroWrap, 'opacity', heroOp.toFixed(3));
			// Hero invisible : ses animations (canvas, shimmer) se mettent en pause.
			if (changed(heroWrap, '#hidden', String(heroOp === 0))) heroWrap.toggleAttribute('data-hidden', heroOp === 0);
			css(heroWrap, 'pointer-events', p < 0.3 ? 'auto' : 'none');
		}
		const wheelOp = clamp((p - 0.35) / 0.5, 0, 1);
		css(mapUi!, 'opacity', wheelOp.toFixed(3));
		css(mapUi!, 'pointer-events', p > 0.8 ? 'auto' : 'none');
		if (keysEl) {
			css(keysEl, 'opacity', wheelOp.toFixed(3));
			if (changed(keysEl, '#zoom', String(zoomOn))) keysEl.toggleAttribute('data-zoom', zoomOn);
		}
	}

	/** Chemins : la base est statique (relayout), seul le <g> suit la caméra ; portions parcourues en orange. */
	function renderPaths({ m, u, cam, z, ox, oy }: Frame) {
		const { W, U, N } = m;
		// S(q) = (ox - cam·z, oy - cam·z) + q·z  →  translate + scale.
		attr(pathsG, 'transform', `translate(${f1(ox - cam.x * z)} ${f1(oy - cam.y * z)}) scale(${z.toFixed(3)})`);
		// U croissant : on s'arrête au premier projet non atteint.
		let sysT = '';
		let legT = '';
		for (let q = 0; q < N - 1 && u > U[q]; q++) {
			const ff = clamp((u - U[q]) / (U[q + 1] - U[q]), 0, 1);
			const pts = legPts[q];
			if (pts) legT += D(pts.slice(0, Math.max(1, Math.round(ff * 48)) + 1));
			else sysT += D([W[q], lp(q, ff)]);
		}
		attr(sysTPath, 'd', sysT);
		attr(legTPath, 'd', legT);
	}

	/** Pendant un saut, les traînées prennent la teinte du système quitté, passent au blanc,
	 *  puis prennent celle du système d'arrivée (dans le sens du trajet). Une seule variable
	 *  sur le calque, arrondie au 20e pour ne réécrire que quand la teinte change vraiment. */
	function renderWarp({ m, j, leg, fArr }: Frame) {
		const { G, W } = m;
		let warp = '';
		if (leg) {
			const from = G[dir >= 0 ? W[j].g : W[j + 1].g];
			const to = G[dir >= 0 ? W[j + 1].g : W[j].g];
			const kFrom = Math.min(clamp(fArr / 0.1, 0, 1), clamp((0.4 - fArr) / 0.3, 0, 1));
			const kTo = Math.min(clamp((fArr - 0.6) / 0.3, 0, 1), clamp((1 - fArr) / 0.1, 0, 1));
			const k = Math.round(Math.max(kFrom, kTo) * 20) / 20;
			if (k > 0) warp = mixRgb(white, pastels.get(kFrom > kTo ? from.c : to.c)!, k);
		}
		css(starsLayer!, '--warp', warp);
	}

	/** Systèmes : anneau, nébuleuse et nom. */
	function renderSystems({ m, S, z, curG, dim }: Frame) {
		m.G.forEach((g0, gi) => {
			const s = S({ x: g0.gx, y: g0.gy });
			const R = (g0.Rc + 46) * z;
			const { ring, label } = groupEls[gi];
			// Taille : ne change que pendant un saut (z) ; position : transform.
			css(ring, 'width', f1(R * 2) + 'px');
			css(ring, 'height', f1(R * 2) + 'px');
			css(ring, 'transform', at(s.x - R, s.y - R));
			nebulas.render(gi, s, R, zoomOn, { vw, vh, vertical });
			// Vertical : toujours au-dessus de l'anneau (dessous = chemin vers le suivant).
			// En vertical, seul le système courant reste calé sous la barre du haut
			// (sinon les labels de deux systèmes se superposent).
			const ly = vertical
				? g0.g === curG ? Math.max(110, s.y - R - 28) : s.y - R - 28
				: g0.g % 2 ? Math.max(110, s.y - R - 28) : s.y + R + 12;
			css(label, 'transform', at(s.x, ly) + ' translateX(-50%)');
			css(label, 'color', g0.g === curG ? systemColor(g0.c) : `rgba(${systemRgb(g0.c)}, 0.55)`);
			css(label, 'opacity', dim.toFixed(3));
		});
	}

	/** Nœuds des projets et leurs étiquettes (hors écran : masqués, on n'écrit rien d'autre). */
	function renderNodes({ m, u, S, navW, dim }: Frame) {
		const { ord, W, U } = m;
		ord.forEach((_, q) => {
			const s = S(W[q]);
			nodePos[q] = s;
			const { dot, label } = nodeEls[q];
			const on = s.x > -240 && s.x < vw + 240 && s.y > -120 && s.y < vh + 120;
			css(dot, 'display', on ? 'block' : 'none');
			css(label, 'display', on ? 'block' : 'none');
			if (!on) return;
			const act = Math.max(0, 1 - Math.abs(u - U[q]) * 1.4);
			const hi = act > 0.5;
			const w = 8 + 8 * act; // diamètre : 16px de base (CSS) mis à l'échelle
			const op = clamp(1.25 - Math.hypot(s.x - vw / 2, s.y - vh / 2) / (Math.max(vw, vh) * 0.6), 0.15, 1) * dim;
			css(dot, 'transform', `${at(s.x, s.y)} translate(-50%,-50%) scale(${(w / 16).toFixed(3)})`);
			css(dot, 'background', hi ? ACCENT : TEXT);
			css(dot, 'box-shadow', hi ? '0 0 0 6px rgba(var(--rgb-accent), 0.18), 0 0 24px rgba(var(--rgb-accent), 0.5)' : 'none');
			css(dot, 'opacity', op.toFixed(3));
			css(dot, 'z-index', hi ? '5' : '2');
			// Côté de l'étiquette : celui du nœud dans son système, sauf si elle n'y tient pas ;
			// si elle ne tient d'aucun côté (titre long sur téléphone), deux lignes du côté le plus large.
			const lw = labelEm[q] * (hi ? 15 : 12), gap = 16 + 6 * act;
			const roomR = vw - navW - 16 - (s.x + gap), roomL = s.x - gap - 16;
			const wrap = lw > roomR && lw > roomL;
			const flip = wrap ? roomL > roomR : W[q].x < W[q].gx - 1 ? lw <= roomL || lw > roomR : lw > roomR;
			const lx = flip ? s.x - gap : s.x + gap;
			css(label, 'transform', at(lx, s.y - 9) + (flip ? ' translateX(-100%)' : ''));
			css(label, 'white-space', wrap ? 'normal' : 'nowrap');
			css(label, 'max-width', wrap ? `${Math.floor(Math.max(roomL, roomR))}px` : 'none');
			css(label, 'text-align', flip ? 'right' : 'left');
			css(label, 'opacity', op.toFixed(3));
			css(label, 'z-index', hi ? '5' : '2');
			css(label, 'font-size', (hi ? 15 : 12) + 'px');
			css(label, 'color', hi ? ACCENT : TEXT_DIM);
		});
	}

	/** Poussière des systèmes, calée au pixel entier. */
	function renderDust({ S, dim }: Frame) {
		dustEls.forEach(({ el, o, sz, wx, wy }) => {
			const s = S({ x: wx, y: wy });
			const on = s.x > -20 && s.x < vw + 20 && s.y > -20 && s.y < vh + 20;
			css(el, 'display', on ? 'block' : 'none');
			if (!on) return;
			css(el, 'transform', `translate(${Math.round(s.x - sz / 2)}px,${Math.round(s.y - sz / 2)}px)`); // pixel entier
			css(el, 'opacity', (o * dim).toFixed(3));
		});
	}

	/** Saut hyperspace : sonde sur le trajet, pulse et carte d'arrivée (système de destination selon la direction). */
	function renderHyperspace({ m, j, f, leg, S, z, fArr, arrOp }: Frame) {
		const { G, W } = m;
		const pq = leg ? S(lp(j, f)) : { x: -99, y: -99 };
		css(probeEl, 'transform', `${at(pq.x, pq.y)} translate(-50%,-50%)`);
		css(probeEl, 'opacity', (leg ? clamp(Math.min(f, 1 - f) * 10, 0, 1) : 0).toFixed(3));
		if (leg) {
			const dg = G[dir >= 0 ? W[j + 1].g : W[j].g];
			const ds = S({ x: dg.gx, y: dg.gy });
			const qp = clamp((fArr - 0.72) / 0.28, 0, 1);
			const pr = (dg.Rc + 20 + qp * 160) * z;
			css(pulseEl, 'width', f1(pr * 2) + 'px');
			css(pulseEl, 'height', f1(pr * 2) + 'px');
			css(pulseEl, 'transform', at(ds.x - pr, ds.y - pr));
			css(pulseEl, 'opacity', (qp > 0 ? (1 - qp) * 0.8 : 0).toFixed(3));
			txt(arrNum, pad(dg.g + 1));
			txt(arrName, ' ' + sysName(dg.c));
			css(arrTitle, 'color', systemColor(dg.c));
			txt(arrCount, (dg.mem.length > 1 ? text.projects : text.project).replace('{n}', pad(dg.mem.length)));
			css(arrivalEl, 'opacity', arrOp.toFixed(3));
		} else {
			css(pulseEl, 'opacity', '0');
			css(arrivalEl, 'opacity', '0');
		}
	}

	/** Compteur, boutons, HUD du projet courant et nav des systèmes (textes réécrits seulement quand le projet change). */
	function renderHud({ m, u, p, curG }: Frame) {
		const { P, ord, U, N, kN } = m;
		txt(counterEl, pad(kN + 1) + ' / ' + pad(N));
		if (goPrev && changed(goPrev, '#disabled', String(kN === 0))) goPrev.disabled = kN === 0;
		if (goNext && changed(goNext, '#disabled', String(kN === N - 1))) goNext.disabled = kN === N - 1;
		// Barre de touches : ← ou → grisée au premier / dernier projet (carte et vue rapprochée)
		keyEnds.forEach((b) => { const off = b.dataset.key === 'ArrowLeft' ? kN === 0 : kN === N - 1; if (changed(b, '#disabled', String(off))) b.disabled = off; });
		const inWheel = p > 0.96;
		const hudOp = inWheel && !zoomOn ? clamp(1 - Math.abs(u - U[kN]) * 3, 0, 1) : 0;
		if (hudEl) css(hudEl, 'opacity', hudOp.toFixed(3));
		const cur = P[ord[kN]];
		txt(hud.cat, text.selected + ' · ' + cur.num + ' · ' + cur.cat);
		if (hud.img && hud.img.getAttribute('src') !== cur.img) hud.img.src = cur.img;
		txt(hud.title, cur.title);
		txt(hud.tag, cur.tag);
		txt(hud.year, cur.year);
		if (hud.wip && changed(hud.wip, '#hidden', String(!cur.wip))) hud.wip.hidden = !cur.wip;
		navRows.forEach((rowEl, gi) => {
			const on = gi === curG;
			css(rowEl, 'color', on ? TEXT : TEXT_DIM);
			const bar = navBars[gi];
			if (bar) {
				css(bar, 'width', (on ? 28 : 12) + 'px');
				css(bar, 'background', on ? ACCENT : 'rgba(var(--rgb-secondary), 0.5)');
			}
		});
	}

	// Nav : clic → voyage vers le premier projet du système.
	navRows.forEach((rowEl, gi) => {
		rowEl.addEventListener('click', () => {
			const g0 = L.G[gi];
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
	const mapRange = () => [stageTop + T, stageTop + T + Utot * STEP];
	const onScroll = () => {
		const y = window.scrollY;
		// Tactile : un swipe lancé hors de la carte s'arrête à son bord,
		// on y entre toujours par le premier ou le dernier projet.
		if (coarse && !scroller.animating && (touching || performance.now() - touchEndAt < 1500)) {
			const [a, b] = mapRange();
			const edge = lastY <= a && y > a ? a : lastY >= b && y < b ? b : null;
			if (edge !== null) {
				window.scrollTo({ top: edge, behavior: 'instant' });
				lastY = edge;
				return;
			}
		}
		if (y !== lastY) scrollDir = y > lastY ? 1 : -1;
		lastY = y;
		if (!raf) raf = requestAnimationFrame(() => {
			raf = 0;
			// Carte sortie de l'écran (About, footer…) : un dernier rendu puis plus rien,
			// et on met le scintillement en pause.
			const out = window.scrollY > stageEnd;
			if (out !== wasOut) root.toggleAttribute('data-off', out);
			if (out && wasOut) return;
			wasOut = out;
			render();
		});
		clearTimeout(snapT);
		snapT = window.setTimeout(snap, 170);
	};
	const onWheel = () => {
		navK = null;
		hashIdx = -1; // l'utilisateur a pris la main : plus de recalage sur le hash
		if (scroller.animating) scroller.stop();
	};
	// Mobile : la barre d'adresse qui apparaît/disparaît au scroll déclenche un resize
	// (hauteur seule, ~60-120px). On l'ignore, sinon la carte se recalcule et saute.
	const onResize = () => {
		if (coarse && window.innerWidth === vw && Math.abs(window.innerHeight - lastH) < 160) return;
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
		touching = true;
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
		touching = false;
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
		if (hashIdx >= 0) goTo(hashIdx, true); // recale sur le projet du hash avec la mesure finale
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
		if (moved) return;
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
	if (hashIdx >= 0) goTo(hashIdx, true);
	render();
	root.setAttribute('data-ready', '');
}
