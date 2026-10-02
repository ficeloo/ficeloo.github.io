// Moteur de la "star map" : la liste des projets devient une carte spatiale
// parcourue au scroll (systèmes par catégorie, sauts hyperspace entre systèmes,
// popup projetée, overlay « View all », clavier et drag).

type Raw = {
	slug: string;
	title: string;
	description: string;
	cat: string;
	tag: string;
	year: string;
	img: string;
	alt: string;
};
type Proj = Raw & { i: number; num: string; link: string };
type Pt = { x: number; y: number };
type Node = Pt & { g: number; gx: number; gy: number };
type Group = { c: string; g: number; mem: number[]; gx: number; gy: number; Rc: number; pos: Pt[] | null };

const cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const hash = (n: number) => {
	const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
	return s - Math.floor(s);
};
const pad = (n: number) => String(n).padStart(2, '0');
// Rythme du scroll dans la carte (réglages à affiner à l'usage) :
const STEP_K = 0.6; // distance de scroll entre deux projets, en hauteur d'écran
const LEG = 2.5; // un saut inter-systèmes vaut LEG pas
const SNAP_BIAS = 0.15; // dès 15 % de pas dans un sens, le snap finit vers le projet suivant
const EDGE_PX = 40; // idem aux bords de la carte (Hero ↔ carte ↔ About), en pixels

// Perf : on mémorise la dernière valeur écrite par élément et on ne touche au DOM
// que si elle change — chaque écriture peut relancer un recalcul côté navigateur.
const written = new WeakMap<object, Map<string, string>>();
const changed = (el: object, key: string, v: string) => {
	let m = written.get(el);
	if (!m) written.set(el, (m = new Map()));
	if (m.get(key) === v) return false;
	m.set(key, v);
	return true;
};
const css = (el: HTMLElement | SVGElement, prop: string, v: string) => {
	if (changed(el, prop, v)) el.style.setProperty(prop, v);
};
const attr = (el: Element, name: string, v: string) => {
	if (changed(el, '@' + name, v)) el.setAttribute(name, v);
};
const txt = (el: { textContent: string | null } | null, v: string) => {
	if (el && changed(el, '#text', v)) el.textContent = v;
};
const f1 = (v: number) => v.toFixed(1);

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
	if (!root || !dataEl || !starsLayer || !mapLayer || !mapUi) return;

	const raw = JSON.parse(dataEl.textContent || '[]') as Raw[];
	const projects: Proj[] = raw.map((p, i) => ({
		...p,
		i,
		num: pad(i + 1),
		link: `/projects/${p.slug}`,
	}));
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
		vh = Math.round(cl(Math.min(window.innerHeight || 800, (window.screen && screen.height) || 1200), 320, 1400));
		vertical = portraitMq.matches;
	};

	// Étoiles de fond déterministes (140).
	const starBase = (() => {
		let s = 7;
		const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
		return Array.from({ length: 140 }, () => {
			const q = r();
			return {
				x: r() * 100,
				y: r() * 100,
				d: r() < 0.85 ? 1 : 2,
				o: +(0.2 + r() * 0.6).toFixed(2),
				z: [0.3, 0.6, 1][Math.floor(r() * 3)],
				c: q < 0.05 ? 'accent' : q < 0.16 ? 'secondary' : 'text', // token --rgb-* (alpha = o)
			};
		});
	})();

	// --- Construction du DOM (une seule fois) ---
	// Scintillement par groupes : 8 calques animés au lieu de 140 étoiles (perf mobile).
	// Chaque groupe a son rythme ; ses étoiles sont dispersées sur tout l'écran.
	const TWINKLE_GROUPS = 8;
	const starGroups = Array.from({ length: TWINKLE_GROUPS }, () => {
		const g = document.createElement('div');
		g.className = styles['star-group'];
		g.style.animationDuration = (2 + Math.random() * 3).toFixed(2) + 's';
		g.style.animationDelay = (-Math.random() * 5).toFixed(2) + 's';
		starsLayer.appendChild(g);
		return g;
	});
	const starEls = starBase.map((s, idx) => {
		const d = document.createElement('div');
		d.className = styles.star;
		// Opacité propre portée par la couleur (le groupe anime sa propre opacité par-dessus).
		d.style.background = `rgba(var(--rgb-${s.c}), ${s.o})`;
		d.style.width = s.d + 'px';
		d.style.height = s.d + 'px';
		starGroups[idx % TWINKLE_GROUPS].appendChild(d);
		return d;
	});

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
	const groupEls = cats0.map(() => {
		const ring = document.createElement('div');
		ring.className = styles.ring;
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
			mapLayer.appendChild(el);
			dustEls.push({ el, g, d, o: 0.25 + hash(d * 7.9 + g * 3) * 0.45, sz, wx: 0, wy: 0 });
		}
	}

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
	arrLabel.textContent = 'Entering system';
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
	};
	const navRows = Array.from(root.querySelectorAll<HTMLElement>('[data-nav-row]'));
	const navBars = navRows.map((r) => r.querySelector<HTMLElement>('[data-nav-bar]'));

	// Popup
	const backdropEl = root.querySelector<HTMLElement>('[data-backdrop]');
	const beamSvg = root.querySelector<SVGSVGElement>('[data-beam]');
	const beamPoly = root.querySelector<SVGPolygonElement>('[data-beam-poly]');
	const popupEl = root.querySelector<HTMLElement>('[data-popup]');
	const popImg = root.querySelector<HTMLImageElement>('[data-popup-img]');
	const popMeta = root.querySelector<HTMLElement>('[data-popup-meta]');
	const popTitle = root.querySelector<HTMLElement>('[data-popup-title]');
	const popDesc = root.querySelector<HTMLElement>('[data-popup-desc]');
	const popTag = root.querySelector<HTMLElement>('[data-popup-tag]');
	const popYear = root.querySelector<HTMLElement>('[data-popup-year]');
	const popLink = root.querySelector<HTMLAnchorElement>('[data-popup-link]');
	const popClose = root.querySelector<HTMLElement>('[data-popup-close]');
	const keysEl = root.querySelector<HTMLElement>('[data-keys]');

	// Overlay "Tout voir"
	const overlayEl = root.querySelector<HTMLElement>('[data-overlay]');
	const seeAllBtn = root.querySelector<HTMLElement>('[data-see-all]');
	const listClose = root.querySelector<HTMLElement>('[data-list-close]');
	const chips = Array.from(root.querySelectorAll<HTMLElement>('[data-filter]'));
	const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-row-idx]'));
	const previewImg = root.querySelector<HTMLImageElement>('[data-preview-img]');
	const previewDesc = root.querySelector<HTMLElement>('[data-preview-desc]');

	function layout() {
		const P = projects;
		const cats = [...new Set(P.map((p) => p.cat))];
		const ord = cats.flatMap((c) => P.filter((p) => p.cat === c).map((p) => p.i));
		// Calcul sur un axe principal (sens du parcours) et un axe transverse ;
		// en vertical on permute les deux à la fin.
		const main = vertical ? vh : vw;
		const cross = vertical ? vw : vh;
		const Dx = cl(main * 1.15, 1000, 1650);
		const G: Group[] = cats.map((c, g) => {
			const mem = ord.filter((q) => P[q].cat === c);
			return { c, g, mem, gx: g * Dx, gy: (g % 2 ? -1 : 1) * cross * 0.06, Rc: 110 + mem.length * 26, pos: null };
		});
		const W: Node[] = ord.map((pi) => {
			const g0 = G.find((x) => x.c === P[pi].cat)!;
			const n = g0.mem.length;
			const j = g0.mem.indexOf(pi);
			if (!g0.pos) {
				const amp = Math.min(g0.Rc * 0.8, cross * 0.24);
				const wts = Array.from({ length: Math.max(0, n - 1) }, (_, q) => 0.4 + hash(g0.g * 41 + q * 9.3) * 1.2);
				const tot = wts.reduce((a, b) => a + b, 0) || 1;
				let acc = 0;
				let prev: number | null = null;
				g0.pos = Array.from({ length: n }, (_, q) => {
					if (q > 0) acc += wts[q - 1];
					let v = n === 1 ? 0 : hash(g0.g * 19 + q * 5.1 + 2) * 2 - 1;
					if (prev !== null && Math.abs(v - prev) * amp < 64) v = prev > 0 ? prev - 64 / amp - 0.2 : prev + 64 / amp + 0.2;
					v = cl(v, -1, 1);
					prev = v;
					return { x: g0.gx - g0.Rc * 0.9 + g0.Rc * 1.8 * (n > 1 ? acc / tot : 0.5), y: g0.gy + v * amp };
				});
			}
			return { x: g0.pos[j].x, y: g0.pos[j].y, g: g0.g, gx: g0.gx, gy: g0.gy };
		});
		if (vertical) {
			G.forEach((g0) => ([g0.gx, g0.gy] = [g0.gy, g0.gx]));
			W.forEach((w) => {
				[w.x, w.y] = [w.y, w.x];
				[w.gx, w.gy] = [w.gy, w.gx];
			});
		}
		const U = [0];
		for (let k = 1; k < W.length; k++) U.push(U[k - 1] + (W[k].g === W[k - 1].g ? 1 : LEG));
		return { P, cats, ord, G, W, U, N: ord.length };
	}

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
		measurePop = true; // la taille d'écran a pu changer la hauteur de la popup
		starEls.forEach((d, i) => (d.style.top = vertical ? '0' : starBase[i].y.toFixed(2) + '%'));
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

		G.forEach((g0, gi) => txt(groupEls[gi].label, pad(g0.g + 1) + ' · ' + g0.c + ' system'));
	}

	type Metrics = ReturnType<typeof layout> & {
		stageTop: number; T: number; STEP: number; Utot: number; local: number; u: number; p: number; kN: number;
	};
	function metrics(): Metrics {
		const local = window.scrollY - stageTop;
		const u = cl((local - T) / STEP, 0, Utot);
		const p = cl(local / T, 0, 1);
		let kN = 0;
		L.U.forEach((v, k) => {
			if (Math.abs(v - u) < Math.abs(L.U[kN] - u)) kN = k;
		});
		return { ...L, stageTop, T, STEP, Utot, local, u, p, kN };
	}

	// --- État popup / navigation ---
	let isOpen = false;
	let popH = 0; // hauteur de la popup ouverte
	let measurePop = false; // à mesurer au prochain rendu (une fois sa largeur appliquée)
	let openIdx = 0;
	let kVal = 0;
	let kRaf = 0;
	let moved = false;
	let dragging = false;
	let animEnd = 0;
	let navK: number | null = null;

	// --- État overlay "Tout voir" ---
	let listOpen = false;
	let filter = 'All';
	let hovIdx = 0;

	// Direction du scroll (pour l'affichage inter-systèmes).
	let lastU = 0;
	let dir = 1;

	// --- Scroll animé + snap ---
	let animating = false;
	let sRaf = 0;
	function animScroll(target: number, fast = false) {
		cancelAnimationFrame(sRaf);
		const from = window.scrollY;
		const d = target - from;
		if (Math.abs(d) < 2) {
			animating = false;
			return;
		}
		const units = Math.abs(d) / STEP; // durée proportionnelle au nombre de pas
		const dur = fast ? cl(160 + units * 170, 160, 1400) : cl(450 + units * 300, 450, 3600);
		const t0 = performance.now();
		animating = true;
		animEnd = t0 + dur;
		const step = (t: number) => {
			const q = cl((t - t0) / dur, 0, 1);
			const e = fast ? 1 - Math.pow(1 - q, 2) : q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
			window.scrollTo({ top: from + d * e, behavior: 'instant' as ScrollBehavior });
			if (q < 1) sRaf = requestAnimationFrame(step);
			else animating = false;
		};
		sRaf = requestAnimationFrame(step);
	}

	// Haut de About, borné au bas de page (About + footer peuvent être plus courts que l'écran).
	const aboutTop = () =>
		Math.min(aboutEl!.getBoundingClientRect().top + window.scrollY, document.documentElement.scrollHeight - window.innerHeight);

	// Snap directionnel : on termine le mouvement dans le sens du scroll plutôt que de
	// revenir au plus proche (sinon 1-2 crans de molette sont annulés).
	function snap() {
		if (animating || dragging || touching) return;
		const m = metrics();
		const y = window.scrollY;
		const mapStart = m.stageTop + m.T;
		// Avant la carte : tout en haut, rien à faire ; entre le Hero et le 1er système,
		// jamais d'entre-deux.
		if (y < mapStart - 2) {
			if (y <= 0) return;
			// Un petit mouvement suffit (intention claire).
			const toMap = scrollDir > 0 ? y > EDGE_PX : y > mapStart - EDGE_PX;
			animScroll(toMap ? mapStart : 0);
			return;
		}
		// Après le dernier projet : entre la carte et la section About, jamais d'entre-deux.
		const mapEnd = mapStart + m.Utot * m.STEP;
		if (y > mapEnd + 2) {
			if (!aboutEl) return;
			const aboutY = aboutTop();
			if (y >= aboutY - 2) return;
			const toAbout = scrollDir > 0 ? y > mapEnd + EDGE_PX : y > aboutY - EDGE_PX;
			animScroll(toAbout ? aboutY : mapEnd);
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
		if (Math.abs(target - y) > 2) animScroll(target);
	}

	function goTo(i: number, instant = false) {
		const m = metrics();
		const k = Math.max(0, m.ord.indexOf(i));
		const target = m.stageTop + m.T + m.U[k] * m.STEP;
		if (instant) window.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior });
		else animScroll(target);
	}

	function fillPopup(idx: number) {
		const pr = projects[idx];
		if (popMeta) popMeta.textContent = pr.num + ' / ' + pad(projects.length) + ' · ' + pr.cat;
		if (popTitle) popTitle.textContent = pr.title;
		if (popDesc) popDesc.textContent = pr.description;
		if (popTag) popTag.textContent = pr.tag;
		if (popYear) popYear.textContent = pr.year;
		if (popLink) popLink.setAttribute('href', pr.link);
		if (popImg) {
			popImg.src = pr.img;
			popImg.alt = pr.alt;
		}
	}

	function setOpen(o: boolean, idx?: number) {
		if (o === isOpen) return;
		isOpen = o;
		if (idx != null) openIdx = idx;
		if (o) {
			fillPopup(openIdx);
			measurePop = true;
		}
		const from = kVal;
		const to = o ? 1 : 0;
		const t0 = performance.now();
		const dur = o ? 520 : 320;
		cancelAnimationFrame(kRaf);
		const step = (t: number) => {
			const q = cl((t - t0) / dur, 0, 1);
			kVal = from + (to - from) * (1 - Math.pow(1 - q, 3));
			render();
			if (q < 1) kRaf = requestAnimationFrame(step);
		};
		kRaf = requestAnimationFrame(step);
	}

	function clickItem(i: number) {
		if (moved) return;
		const m = metrics();
		const k = m.ord.indexOf(i);
		if (Math.abs(m.u - m.U[k]) < 0.08) setOpen(true, i);
		else goTo(i);
	}

	// Projet précédent (-1) ou suivant (+1) : flèches du clavier et boutons tactiles.
	function navigate(d: number, fast = false) {
		const m = metrics();
		const base = animating && navK != null ? navK : m.kN;
		const nk = cl(base + d, 0, m.N - 1);
		if (nk === base) return;
		navK = nk;
		setOpen(false);
		animScroll(m.stageTop + m.T + m.U[nk] * m.STEP, fast);
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			setOpen(false);
			closeList();
			return;
		}
		if (listOpen) return;
		const m = metrics();
		if (m.local < m.T * 0.9 || m.local > m.T + m.Utot * m.STEP + m.STEP) return;
		if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
			e.preventDefault();
			if (e.repeat && animating && animEnd - performance.now() > 90) return;
			navigate(e.key === 'ArrowRight' ? 1 : -1, e.repeat);
		} else if (e.key === 'Enter' && !e.repeat) {
			// Entrée sur un bouton ou un lien focalisé : on laisse le navigateur faire.
			if ((e.target as Element).closest('a, button')) return;
			// 1er appui : ouvre la popup du projet courant ; 2e appui : va sur sa page.
			if (isOpen) location.href = projects[openIdx].link;
			else if (Math.abs(m.u - m.U[m.kN]) < 0.1) setOpen(true, m.ord[m.kN]);
		}
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
			if (moved) window.scrollTo({ top: startS - dx * px, behavior: 'instant' as ScrollBehavior });
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

	function applyFilter() {
		chips.forEach((ch) => ch.toggleAttribute('data-active', ch.dataset.filter === filter));
		rows.forEach((r) => (r.hidden = filter !== 'All' && r.dataset.cat !== filter));
	}
	function applyHover() {
		rows.forEach((r) => r.toggleAttribute('data-hover', Number(r.dataset.rowIdx) === hovIdx));
		const pr = projects[hovIdx] || projects[0];
		if (previewImg && previewImg.getAttribute('src') !== pr.img) {
			previewImg.src = pr.img;
			previewImg.alt = pr.alt;
		}
		if (previewDesc) previewDesc.textContent = pr.description;
	}
	function openList() {
		setOpen(false);
		const m = metrics();
		hovIdx = m.ord[m.kN];
		filter = 'All';
		listOpen = true;
		document.body.style.overflow = 'hidden';
		if (overlayEl) {
			overlayEl.style.opacity = '1';
			overlayEl.style.pointerEvents = 'auto';
		}
		applyFilter();
		applyHover();
	}
	function closeList() {
		listOpen = false;
		document.body.style.overflow = '';
		if (overlayEl) {
			overlayEl.style.opacity = '0';
			overlayEl.style.pointerEvents = 'none';
		}
	}

	function render() {
		const m = metrics();
		const { P, ord, G, W, U, N } = m;
		const u = m.u;
		const p = m.p;
		if (u > lastU) dir = 1;
		else if (u < lastU) dir = -1;
		lastU = u;
		const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

		// Transition Hero → carte
		if (heroWrap) {
			css(heroWrap, 'transform', `translateY(${f1(-ease * vh * 0.35)}px) scale(${(1 - ease * 0.12).toFixed(3)})`);
			const heroOp = cl(1 - p * 1.6, 0, 1);
			css(heroWrap, 'opacity', heroOp.toFixed(3));
			// Hero invisible : ses animations (canvas, shimmer) se mettent en pause.
			if (changed(heroWrap, '#hidden', String(heroOp === 0))) heroWrap.toggleAttribute('data-hidden', heroOp === 0);
			css(heroWrap, 'pointer-events', p < 0.3 ? 'auto' : 'none');
		}
		const wheelOp = cl((p - 0.35) / 0.5, 0, 1);
		css(mapUi!, 'opacity', wheelOp.toFixed(3));
		css(mapUi!, 'pointer-events', p > 0.8 ? 'auto' : 'none');
		if (keysEl) {
			css(keysEl, 'opacity', wheelOp.toFixed(3));
			if (changed(keysEl, '#popup', String(isOpen))) keysEl.toggleAttribute('data-popup', isOpen);
		}

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
		const dip = vh * 0.2 * kVal; // la carte descend quand la popup s'ouvre
		const hudW = Math.min(300, vw * 0.3);
		// Vertical : carte un peu à gauche (labels à droite des nœuds), un peu plus haut
		// (bandeau HUD en bas), pas de nav systèmes.
		const ox = vertical ? vw * 0.36 : vw >= 1200 ? vw / 2 + hudW * 0.3 - 60 : vw / 2;
		const navW = vertical ? 0 : vw >= 1200 ? 280 : 120;
		const oy = vh * (vertical ? 0.42 : 0.45) + (1 - ease) * vh * 0.9;
		const S = (q: Pt, dp: number): Pt => ({ x: ox + (q.x - cam.x) * z, y: oy + dp + (q.y - cam.y) * z });
		const at = (x: number, y: number) => `translate(${f1(x)}px,${f1(y)}px)`;

		const kN = m.kN;
		const ai = ord[kN];
		const curG = W[kN].g; // système du projet le plus proche (stable au retour)
		const rot = leg ? (Math.atan2(W[j + 1].y - W[j].y, W[j + 1].x - W[j].x) * 180) / Math.PI : 0;
		// Progression d'arrivée dans le sens du voyage (f en avant, 1-f en arrière).
		const fArr = dir >= 0 ? f : 1 - f;
		// Carte système en plateau : apparaît tôt (dès 5% du saut), pleine opacité
		// de 20% à 78%, puis fond — laisse le temps de lire le nom du système.
		const arrOp = leg ? Math.min(cl((fArr - 0.05) / 0.15, 0, 1), cl((0.88 - fArr) / 0.1, 0, 1)) : 0;
		const dim = 1 - arrOp * 0.9;

		// Chemins : la base est statique (relayout), seul le <g> suit la caméra.
		// S(q) = (ox - cam·z, oy + dip - cam·z) + q·z  →  translate + scale.
		attr(pathsG, 'transform', `translate(${f1(ox - cam.x * z)} ${f1(oy + dip - cam.y * z)}) scale(${z.toFixed(3)})`);
		// Portions parcourues en orange (U croissant : on s'arrête au premier non atteint).
		let sysT = '';
		let legT = '';
		for (let q = 0; q < N - 1 && u > U[q]; q++) {
			const ff = cl((u - U[q]) / (U[q + 1] - U[q]), 0, 1);
			const pts = legPts[q];
			if (pts) legT += D(pts.slice(0, Math.max(1, Math.round(ff * 48)) + 1));
			else sysT += D([W[q], lp(q, ff)]);
		}
		attr(sysTPath, 'd', sysT);
		attr(legTPath, 'd', legT);

		// Étoiles : parallaxe sur l'axe du parcours (x en horizontal, y en vertical).
		// En horizontal, top fixe en % (relayout) ; en vertical, top: 0 et y via transform.
		const W0 = vw * 1.1;
		const H0 = vh * 1.1;
		const wrap = (v: number, m: number) => ((v % m) + m) % m;
		const rotS = `rotate(${f1(rot)}deg)`;
		starBase.forEach((s, idx) => {
			const zz = s.z;
			const x = vertical ? (s.x / 100) * vw : wrap((s.x / 100) * W0 - cam.x * 0.08 * zz, W0) - vw * 0.05;
			const y = vertical ? wrap((s.y / 100) * H0 - cam.y * 0.08 * zz, H0) - vh * 0.05 : 0;
			const len = s.d + wave * (40 + s.o * 120) * zz * 1.4;
			// Au repos : taille réelle, coin calé sur un pixel entier — une étoile étirée
			// ou à cheval sur deux pixels est lissée et paraît bien plus terne.
			// En saut : rotation + traînée (étirement depuis la taille réelle).
			const tf = wave === 0 // sans traînée, la rotation d'un point est invisible
				? `translate(${Math.round(x - s.d / 2)}px,${Math.round(y - s.d / 2)}px)`
				: `translate(${f1(x)}px,${f1(y)}px) ${rotS} scaleX(${f1(len / s.d)}) translate(-50%,-50%)`;
			css(starEls[idx], 'transform', tf);
		});

		// Systèmes (anneaux + labels)
		G.forEach((g0, gi) => {
			const s = S({ x: g0.gx, y: g0.gy }, dip);
			const R = (g0.Rc + 46) * z;
			const { ring, label } = groupEls[gi];
			// Taille : ne change que pendant un saut (z) ; position : transform.
			css(ring, 'width', f1(R * 2) + 'px');
			css(ring, 'height', f1(R * 2) + 'px');
			css(ring, 'transform', at(s.x - R, s.y - R));
			// Vertical : toujours au-dessus de l'anneau (dessous = chemin vers le suivant).
			// En vertical, seul le système courant reste calé sous la barre du haut
			// (sinon les labels de deux systèmes se superposent).
			const ly = vertical
				? g0.g === curG ? Math.max(110, s.y - R - 28) : s.y - R - 28
				: g0.g % 2 ? Math.max(110, s.y - R - 28) : s.y + R + 12;
			css(label, 'transform', at(s.x, ly) + ' translateX(-50%)');
			css(label, 'color', g0.g === curG ? TEXT : 'var(--color-secondary)');
			css(label, 'opacity', dim.toFixed(3));
		});

		// Nœuds (hors écran : masqués, on n'écrit rien d'autre)
		ord.forEach((_, q) => {
			const s = S(W[q], dip);
			const { dot, label } = nodeEls[q];
			const on = s.x > -240 && s.x < vw + 240 && s.y > -120 && s.y < vh + 120;
			css(dot, 'display', on ? 'block' : 'none');
			css(label, 'display', on ? 'block' : 'none');
			if (!on) return;
			const act = Math.max(0, 1 - Math.abs(u - U[q]) * 1.4);
			const hi = act > 0.5;
			const w = 8 + 8 * act; // diamètre : 16px de base (CSS) mis à l'échelle
			const op = cl(1.25 - Math.hypot(s.x - vw / 2, s.y - vh / 2) / (Math.max(vw, vh) * 0.6), 0.15, 1) * dim;
			css(dot, 'transform', `${at(s.x, s.y)} translate(-50%,-50%) scale(${(w / 16).toFixed(3)})`);
			css(dot, 'background', hi ? ACCENT : TEXT);
			css(dot, 'box-shadow', hi ? '0 0 0 6px rgba(var(--rgb-accent), 0.18), 0 0 24px rgba(var(--rgb-accent), 0.5)' : 'none');
			css(dot, 'opacity', op.toFixed(3));
			css(dot, 'z-index', hi ? '5' : '2');
			const flip = W[q].x < W[q].gx - 1 || s.x + 200 > vw - navW - 16;
			const lx = flip ? s.x - 16 - 6 * act : s.x + 16 + 6 * act;
			css(label, 'transform', at(lx, s.y - 9) + (flip ? ' translateX(-100%)' : ''));
			css(label, 'opacity', op.toFixed(3));
			css(label, 'z-index', hi ? '5' : '2');
			css(label, 'font-size', (hi ? 15 : 12) + 'px');
			css(label, 'color', hi ? ACCENT : TEXT_DIM);
		});

		// Poussière
		dustEls.forEach(({ el, o, sz, wx, wy }) => {
			const s = S({ x: wx, y: wy }, dip);
			const on = s.x > -20 && s.x < vw + 20 && s.y > -20 && s.y < vh + 20;
			css(el, 'display', on ? 'block' : 'none');
			if (!on) return;
			css(el, 'transform', `translate(${Math.round(s.x - sz / 2)}px,${Math.round(s.y - sz / 2)}px)`); // pixel entier
			css(el, 'opacity', (o * dim).toFixed(3));
		});

		// Sonde
		const pq = leg ? S(lp(j, f), dip) : { x: -99, y: -99 };
		css(probeEl, 'transform', `${at(pq.x, pq.y)} translate(-50%,-50%)`);
		css(probeEl, 'opacity', (leg ? cl(Math.min(f, 1 - f) * 10, 0, 1) : 0).toFixed(3));

		// Pulse + carte d'arrivée (système de destination selon la direction)
		if (leg) {
			const dg = G[dir >= 0 ? W[j + 1].g : W[j].g];
			const ds = S({ x: dg.gx, y: dg.gy }, dip);
			const qp = cl((fArr - 0.72) / 0.28, 0, 1);
			const pr = (dg.Rc + 20 + qp * 160) * z;
			css(pulseEl, 'width', f1(pr * 2) + 'px');
			css(pulseEl, 'height', f1(pr * 2) + 'px');
			css(pulseEl, 'transform', at(ds.x - pr, ds.y - pr));
			css(pulseEl, 'opacity', (qp > 0 ? (1 - qp) * 0.8 : 0).toFixed(3));
			txt(arrNum, pad(dg.g + 1));
			txt(arrName, ' ' + dg.c + ' system');
			txt(arrCount, pad(dg.mem.length) + ' projects');
			css(arrivalEl, 'opacity', arrOp.toFixed(3));
		} else {
			css(pulseEl, 'opacity', '0');
			css(arrivalEl, 'opacity', '0');
		}

		// Compteur + HUD + nav (textes réécrits seulement quand le projet change)
		txt(counterEl, pad(kN + 1) + ' / ' + pad(N));
		const inWheel = p > 0.96;
		const hudOp = inWheel ? cl(1 - Math.abs(u - U[kN]) * 3, 0, 1) : 0;
		if (hudEl) css(hudEl, 'opacity', hudOp.toFixed(3));
		const cur = P[ai];
		txt(hud.cat, 'Selected · ' + cur.num + ' · ' + cur.cat);
		if (hud.img && hud.img.getAttribute('src') !== cur.img) hud.img.src = cur.img;
		txt(hud.title, cur.title);
		txt(hud.tag, cur.tag);
		txt(hud.year, cur.year);
		navRows.forEach((rowEl, gi) => {
			const on = gi === curG;
			css(rowEl, 'color', on ? TEXT : TEXT_DIM);
			const bar = navBars[gi];
			if (bar) {
				css(bar, 'width', (on ? 28 : 12) + 'px');
				css(bar, 'background', on ? ACCENT : 'rgba(var(--rgb-secondary), 0.5)');
			}
		});

		// Popup + beam + backdrop (géométrie ignorée tant que la popup est fermée)
		if (popupEl && beamSvg && beamPoly && backdropEl) {
			const k3 = kVal.toFixed(3);
			css(backdropEl, 'opacity', k3);
			css(backdropEl, 'pointer-events', isOpen ? 'auto' : 'none');
			css(popupEl, 'opacity', k3);
			css(popupEl, 'pointer-events', isOpen ? 'auto' : 'none');
			if (kVal > 0) {
				const so = S(W[Math.max(0, ord.indexOf(openIdx))], vh * 0.2);
				const popW = Math.min(640, vw - 32);
				css(popupEl, 'width', popW + 'px');
				if (measurePop) {
					popH = popupEl.offsetHeight; // le transform (scale) n'affecte pas offsetHeight
					measurePop = false;
				}
				const itemTop = so.y - 8;
				// Au-dessus du nœud, mais jamais hors de l'écran (petites hauteurs, portrait).
				const pb = Math.max(itemTop - 46, popH + 12);
				// Popup qui recouvre le nœud : le faisceau n'a plus de sens.
				css(beamSvg, 'opacity', pb < itemTop - 20 ? k3 : '0');
				const popL = cl(so.x - popW / 2, 16, vw - popW - 16);

				attr(beamSvg, 'width', String(vw));
				attr(beamSvg, 'height', String(vh));
				attr(
					beamPoly,
					'points',
					[popL + popW * 0.12, pb, popL + popW * 0.88, pb, so.x + 6, itemTop + 8, so.x - 6, itemTop + 8].map((v) => v.toFixed(1)).join(' '),
				);

				css(popupEl, 'left', popL + 'px');
				css(popupEl, 'bottom', vh - pb + 'px');
				css(popupEl, 'transform', `translateY(${((1 - kVal) * 40).toFixed(1)}px) scale(${(0.3 + 0.7 * kVal).toFixed(3)})`);
				css(popupEl, 'clip-path', `inset(${((1 - kVal) * 100).toFixed(1)}% 0 0 0)`);
			} else {
				css(beamSvg, 'opacity', '0');
			}
		}
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
	let scrollDir = 1; // sens du dernier scroll (1 = vers le bas)
	let touching = false; // doigt posé : pas de snap avant qu'il soit levé
	let touchEndAt = -Infinity; // aucun geste encore (sinon le chargement de la page compterait)
	let swipeY: number | null = null; // début d'un geste commencé dans la carte (tactile)
	const mapRange = () => [stageTop + T, stageTop + T + Utot * STEP];
	const onScroll = () => {
		const y = window.scrollY;
		// Tactile : un swipe lancé hors de la carte s'arrête à son bord,
		// on y entre toujours par le premier ou le dernier projet.
		if (coarse && !animating && (touching || performance.now() - touchEndAt < 1500)) {
			const [a, b] = mapRange();
			const edge = lastY <= a && y > a ? a : lastY >= b && y < b ? b : null;
			if (edge !== null) {
				window.scrollTo({ top: edge, behavior: 'instant' as ScrollBehavior });
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
			if (isOpen) {
				const m = metrics();
				const k = m.ord.indexOf(openIdx);
				if (Math.abs(m.u - m.U[k]) > 0.4) setOpen(false);
			}
		});
		clearTimeout(snapT);
		snapT = window.setTimeout(snap, 170);
	};
	const onWheel = () => {
		navK = null;
		hashIdx = -1; // l'utilisateur a pris la main : plus de recalage sur le hash
		if (animating) {
			cancelAnimationFrame(sRaf);
			animating = false;
		}
	};
	// Mobile : la barre d'adresse qui apparaît/disparaît au scroll déclenche un resize
	// (hauteur seule, ~60-120px). On l'ignore, sinon la carte se recalcule et saute.
	const onResize = () => {
		if (coarse && window.innerWidth === vw && Math.abs(window.innerHeight - lastH) < 160) return;
		readVp();
		relayout();
		render();
	};

	window.addEventListener('scroll', onScroll, { passive: true });
	window.addEventListener('wheel', onWheel, { passive: true });

	// --- Tactile : dans la carte, navigation par boutons uniquement ---
	// Le swipe ne fait pas défiler les projets ; il sert seulement à sortir de la carte
	// (vers le Hero depuis le premier projet, vers About depuis le dernier).
	function exitMap(d: number) {
		const m = metrics();
		if (d > 0 && m.kN === m.N - 1 && aboutEl) animScroll(aboutTop());
		else if (d < 0 && m.kN === 0) animScroll(0);
	}
	window.addEventListener('touchstart', (e) => {
		touching = true;
		onWheel();
		const [a, b] = mapRange();
		const y = window.scrollY;
		swipeY = coarse && !listOpen && y > a - 2 && y < b + 2 ? e.touches[0].clientY : null;
	}, { passive: true });
	window.addEventListener('touchmove', (e) => {
		if (swipeY !== null && e.cancelable) e.preventDefault();
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
		relayout();
		if (hashIdx >= 0) goTo(hashIdx, true); // recale sur le projet du hash avec la mesure finale
		render();
	});
	window.addEventListener('keydown', onKey);
	mapUi.addEventListener('pointerdown', onDown);
	backdropEl?.addEventListener('click', () => setOpen(false));
	popClose?.addEventListener('click', () => setOpen(false));
	hudEl?.addEventListener('click', () => {
		if (moved) return;
		const m = metrics();
		setOpen(true, m.ord[m.kN]);
	});

	// Boutons tactiles : haut de page, projet précédent / suivant, bas de page.
	root.querySelectorAll<HTMLElement>('[data-go]').forEach((btn) => {
		btn.addEventListener('click', () => {
			const go = btn.dataset.go;
			if (go === 'prev' || go === 'next') navigate(go === 'next' ? 1 : -1);
			else animScroll(go === 'top' ? 0 : document.documentElement.scrollHeight - window.innerHeight, true);
		});
	});

	seeAllBtn?.addEventListener('click', openList);
	listClose?.addEventListener('click', closeList);
	chips.forEach((ch) => {
		ch.addEventListener('click', () => {
			filter = ch.dataset.filter || 'All';
			applyFilter();
		});
	});
	rows.forEach((r) => {
		const i = Number(r.dataset.rowIdx);
		r.addEventListener('mouseenter', () => {
			hovIdx = i;
			applyHover();
		});
		r.addEventListener('click', () => {
			closeList();
			goTo(i, true);
			setTimeout(() => setOpen(true, i), 120);
		});
	});

	// Retour depuis une page projet (« ← Back ») : /#project-<slug> → carte calée sur ce projet.
	const hashSlug = /^#project-(.+)$/.exec(decodeURIComponent(location.hash))?.[1];
	let hashIdx = hashSlug ? projects.findIndex((p) => p.slug === hashSlug) : -1;

	readVp();
	relayout();
	if (hashIdx >= 0) goTo(hashIdx, true);
	render();
	root.setAttribute('data-ready', '');
}
