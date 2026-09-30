// Moteur de la "star map" — porté du prototype de design (design_handoff_star_map).
// Phase A : rendu statique. Phase B : modèle de scroll, fusion Hero↔carte, snap,
// nav cliquable, HUD/compteur pilotés par le scroll.
// Phases suivantes : sauts hyperspace (C), popup + clavier + drag (D), overlay (E).

type Raw = {
	slug: string | null;
	title: string;
	description: string;
	tag: string;
	year: string;
	img: string;
	alt: string;
};
type Proj = Raw & { i: number; num: string; cat: string; link: string };
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
const LEG = 4;

export function initStarMap(styles: Record<string, string>) {
	const root = document.querySelector<HTMLElement>('[data-starmap]');
	const dataEl = document.getElementById('starmap-data');
	const starsLayer = root?.querySelector<HTMLElement>('[data-stars]');
	const mapLayer = root?.querySelector<HTMLElement>('[data-map]');
	const heroWrap = root?.querySelector<HTMLElement>('[data-hero-wrap]');
	const mapUi = root?.querySelector<HTMLElement>('[data-map-ui]');
	const workAnchor = root?.querySelector<HTMLElement>('[data-work-anchor]');
	if (!root || !dataEl || !starsLayer || !mapLayer || !mapUi) return;

	const raw = JSON.parse(dataEl.textContent || '[]') as Raw[];
	const projects: Proj[] = raw.map((p, i) => ({
		...p,
		i,
		num: pad(i + 1),
		cat: p.tag.split('·')[0].trim(),
		link: p.slug ? `/projects/${p.slug}` : '#',
	}));
	if (!projects.length) return;

	let vw = 1280;
	let vh = 800;
	const readVp = () => {
		vw = window.innerWidth || 1280;
		vh = Math.round(cl(Math.min(window.innerHeight || 800, (window.screen && screen.height) || 1200), 480, 1400));
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
				c: q < 0.05 ? '#FD6035' : q < 0.16 ? '#537970' : '#F3F6F6',
			};
		});
	})();

	// --- Construction du DOM (une seule fois) ---
	const starEls = starBase.map((s) => {
		const d = document.createElement('div');
		d.className = styles.star;
		d.style.background = s.c;
		d.style.opacity = String(s.o);
		d.style.height = s.d + 'px';
		starsLayer.appendChild(d);
		return d;
	});

	const NS = 'http://www.w3.org/2000/svg';
	const svg = document.createElementNS(NS, 'svg');
	svg.setAttribute('class', styles.paths);
	const mkPath = (dash?: string, w = '1') => {
		const p = document.createElementNS(NS, 'path');
		p.setAttribute('fill', 'none');
		p.setAttribute('stroke', 'rgba(83,121,112,0.6)');
		p.setAttribute('stroke-width', w);
		if (dash) {
			p.setAttribute('stroke-dasharray', dash);
			p.setAttribute('stroke-linecap', 'round');
		}
		return p;
	};
	const legPath = mkPath('2 7', '1.2');
	const sysPath = mkPath();
	svg.appendChild(legPath);
	svg.appendChild(sysPath);
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
		const travel = () => goTo(idx);
		dot.addEventListener('click', travel);
		label.addEventListener('click', travel);
		mapLayer.appendChild(dot);
		mapLayer.appendChild(label);
		return { dot, label };
	});

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

	function layout() {
		const P = projects;
		const cats = [...new Set(P.map((p) => p.cat))];
		const ord = cats.flatMap((c) => P.filter((p) => p.cat === c).map((p) => p.i));
		const Dx = cl(vw * 1.15, 1000, 1650);
		const G: Group[] = cats.map((c, g) => {
			const mem = ord.filter((q) => P[q].cat === c);
			return { c, g, mem, gx: g * Dx, gy: (g % 2 ? -1 : 1) * vh * 0.06, Rc: 110 + mem.length * 26, pos: null };
		});
		const W: Node[] = ord.map((pi) => {
			const g0 = G.find((x) => x.c === P[pi].cat)!;
			const n = g0.mem.length;
			const j = g0.mem.indexOf(pi);
			if (!g0.pos) {
				const amp = Math.min(g0.Rc * 0.8, vh * 0.24);
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
		const U = [0];
		for (let k = 1; k < W.length; k++) U.push(U[k - 1] + (W[k].g === W[k - 1].g ? 1 : LEG));
		return { P, cats, ord, G, W, U, N: ord.length };
	}

	type Metrics = ReturnType<typeof layout> & {
		stageTop: number; T: number; STEP: number; Utot: number; local: number; u: number; p: number; kN: number;
	};
	function metrics(): Metrics {
		const L = layout();
		const stageTop = root!.getBoundingClientRect().top + window.scrollY;
		const T = vh * 0.9;
		const STEP = vh * 0.28;
		const Utot = L.U[L.N - 1] || 0;
		const local = window.scrollY - stageTop;
		const u = cl((local - T) / STEP, 0, Utot);
		const p = cl(local / T, 0, 1);
		let kN = 0;
		L.U.forEach((v, k) => {
			if (Math.abs(v - u) < Math.abs(L.U[kN] - u)) kN = k;
		});
		return { ...L, stageTop, T, STEP, Utot, local, u, p, kN };
	}

	function updateGeometry() {
		const L = layout();
		const T = vh * 0.9;
		const STEP = vh * 0.28;
		const Utot = L.U[L.N - 1] || 0;
		root!.style.height = vh + T + Utot * STEP + 'px';
		if (workAnchor) workAnchor.style.top = T + 'px';
	}

	// --- Scroll animé + snap ---
	let animating = false;
	let sRaf = 0;
	function animScroll(target: number) {
		cancelAnimationFrame(sRaf);
		const from = window.scrollY;
		const d = target - from;
		if (Math.abs(d) < 2) {
			animating = false;
			return;
		}
		const units = Math.abs(d) / (vh * 0.28);
		const dur = cl(450 + units * 300, 450, 3600);
		const t0 = performance.now();
		animating = true;
		const step = (t: number) => {
			const q = cl((t - t0) / dur, 0, 1);
			const e = q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
			window.scrollTo({ top: from + d * e, behavior: 'instant' as ScrollBehavior });
			if (q < 1) sRaf = requestAnimationFrame(step);
			else animating = false;
		};
		sRaf = requestAnimationFrame(step);
	}

	function snap() {
		if (animating) return;
		const m = metrics();
		if (m.local < m.T * 0.98 || m.local > m.T + m.Utot * m.STEP + 2) return;
		const target = m.stageTop + m.T + m.U[m.kN] * m.STEP;
		if (Math.abs(target - window.scrollY) > 2) animScroll(target);
	}

	function goTo(i: number) {
		const m = metrics();
		const k = Math.max(0, m.ord.indexOf(i));
		animScroll(m.stageTop + m.T + m.U[k] * m.STEP);
	}

	function render() {
		const m = metrics();
		const { P, ord, G, W, U, N } = m;
		const u = m.u;
		const p = m.p;
		const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

		// Transition Hero → carte
		if (heroWrap) {
			heroWrap.style.transform = `translateY(${(-ease * vh * 0.35).toFixed(1)}px) scale(${(1 - ease * 0.12).toFixed(3)})`;
			heroWrap.style.opacity = cl(1 - p * 1.6, 0, 1).toFixed(3);
			heroWrap.style.pointerEvents = p < 0.3 ? 'auto' : 'none';
		}
		const wheelOp = cl((p - 0.35) / 0.5, 0, 1);
		mapUi!.style.opacity = wheelOp.toFixed(3);
		mapUi!.style.pointerEvents = p > 0.8 ? 'auto' : 'none';

		let j = 0;
		while (j < N - 1 && U[j + 1] <= u) j++;
		const last = j >= N - 1;
		const f = last ? 0 : (u - U[j]) / (U[j + 1] - U[j]);
		const leg = !last && W[j + 1].g !== W[j].g;
		const camF = (q: number): Pt => ({ x: W[q].x * 0.7 + W[q].gx * 0.3, y: W[q].y * 0.45 + W[q].gy * 0.55 });
		const lp = (q: number, t: number): Pt => ({ x: W[q].x + (W[q + 1].x - W[q].x) * t, y: W[q].y + (W[q + 1].y - W[q].y) * t });
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
		const dip = 0; // popup (phase D)
		const hudW = Math.min(300, vw * 0.3);
		const ox = vw >= 1200 ? vw / 2 + hudW * 0.3 - 60 : vw / 2;
		const navW = vw >= 1200 ? 280 : 120;
		const oy = vh * 0.45 + (1 - ease) * vh * 0.9;
		const S = (q: Pt, dp: number): Pt => ({ x: ox + (q.x - cam.x) * z, y: oy + dp + (q.y - cam.y) * z });

		const kN = m.kN;
		const ai = ord[kN];
		const curG = leg ? (f < 0.5 ? W[j].g : W[j + 1].g) : W[kN].g;

		// Chemins
		const f1 = (v: number) => v.toFixed(1);
		const D = (arr: Pt[]) => (arr.length ? 'M' + arr.map((s) => f1(s.x) + ' ' + f1(s.y)).join(' L') + ' ' : '');
		let sysD = '';
		let legD = '';
		for (let q = 0; q < N - 1; q++) {
			const isLeg = W[q + 1].g !== W[q].g;
			const scr = (isLeg ? Array.from({ length: 49 }, (_, s) => lp(q, s / 48)) : [W[q], W[q + 1]]).map((w) => S(w, dip));
			if (isLeg) legD += D(scr);
			else sysD += D(scr);
		}
		svg.setAttribute('width', String(vw));
		svg.setAttribute('height', String(vh));
		sysPath.setAttribute('d', sysD);
		legPath.setAttribute('d', legD);

		// Étoiles
		const W0 = vw * 1.1;
		starBase.forEach((s, idx) => {
			const zz = s.z;
			const x = (((s.x / 100) * W0 - cam.x * 0.08 * zz) % W0 + W0) % W0 - vw * 0.05;
			const len = s.d + wave * (40 + s.o * 120) * zz * 1.4;
			const el = starEls[idx];
			el.style.left = ((x / vw) * 100).toFixed(2) + '%';
			el.style.top = s.y.toFixed(2) + '%';
			el.style.width = len.toFixed(1) + 'px';
		});

		// Systèmes (anneaux + labels)
		G.forEach((g0, gi) => {
			const s = S({ x: g0.gx, y: g0.gy }, dip);
			const R = (g0.Rc + 46) * z;
			const { ring, label } = groupEls[gi];
			ring.style.left = s.x - R + 'px';
			ring.style.top = s.y - R + 'px';
			ring.style.width = R * 2 + 'px';
			ring.style.height = R * 2 + 'px';
			label.textContent = pad(g0.g + 1) + ' · ' + g0.c + ' system';
			label.style.left = s.x + 'px';
			label.style.top = (g0.g % 2 ? Math.max(110, s.y - R - 28) : s.y + R + 12) + 'px';
			label.style.color = g0.g === curG ? '#F3F6F6' : '#537970';
		});

		// Nœuds
		ord.forEach((pi, q) => {
			const s = S(W[q], dip);
			const act = Math.max(0, 1 - Math.abs(u - U[q]) * 1.4);
			const hi = act > 0.5;
			const on = s.x > -240 && s.x < vw + 240 && s.y > -120 && s.y < vh + 120;
			const { dot, label } = nodeEls[q];
			const w = 8 + 8 * act;
			const op = cl(1.25 - Math.hypot(s.x - vw / 2, s.y - vh / 2) / (Math.max(vw, vh) * 0.6), 0.15, 1);
			dot.style.left = s.x + 'px';
			dot.style.top = s.y + 'px';
			dot.style.width = w + 'px';
			dot.style.height = w + 'px';
			dot.style.background = hi ? '#FD6035' : '#F3F6F6';
			dot.style.boxShadow = hi ? '0 0 0 6px rgba(253,96,53,0.18), 0 0 24px rgba(253,96,53,0.5)' : 'none';
			dot.style.opacity = op.toFixed(3);
			dot.style.display = on ? 'block' : 'none';
			dot.style.zIndex = hi ? '5' : '2';
			const flip = W[q].x < W[q].gx - 1 || s.x + 200 > vw - navW - 16;
			label.style.left = (flip ? s.x - 16 - 6 * act : s.x + 16 + 6 * act) + 'px';
			label.style.top = s.y - 9 + 'px';
			label.style.transform = flip ? 'translateX(-100%)' : 'none';
			label.style.display = on ? 'block' : 'none';
			label.style.opacity = op.toFixed(3);
			label.style.zIndex = hi ? '5' : '2';
			label.style.fontSize = (hi ? 15 : 12) + 'px';
			label.style.color = hi ? '#FD6035' : 'rgba(243,246,246,0.62)';
		});

		// Compteur + HUD + nav
		if (counterEl) counterEl.textContent = pad(kN + 1) + ' / ' + pad(N);
		const inWheel = p > 0.96;
		const hudOp = inWheel ? cl(1 - Math.abs(u - U[kN]) * 3, 0, 1) : 0;
		if (hudEl) hudEl.style.opacity = hudOp.toFixed(3);
		const cur = P[ai];
		if (hud.cat) hud.cat.textContent = 'Selected · ' + cur.num + ' · ' + cur.cat;
		if (hud.img && hud.img.getAttribute('src') !== cur.img) hud.img.src = cur.img;
		if (hud.title) hud.title.textContent = cur.title;
		if (hud.tag) hud.tag.textContent = cur.tag;
		if (hud.year) hud.year.textContent = cur.year;
		navRows.forEach((rowEl, gi) => {
			const on = gi === curG;
			rowEl.style.color = on ? '#F3F6F6' : 'rgba(243,246,246,0.62)';
			const bar = rowEl.querySelector<HTMLElement>('[data-nav-bar]');
			if (bar) {
				bar.style.width = (on ? 28 : 12) + 'px';
				bar.style.background = on ? '#FD6035' : 'rgba(83,121,112,0.5)';
			}
		});
	}

	// Nav : clic → voyage vers le premier projet du système.
	navRows.forEach((rowEl, gi) => {
		rowEl.addEventListener('click', () => {
			const g0 = layout().G[gi];
			if (g0) goTo(g0.mem[0]);
		});
	});

	// --- Boucle de scroll ---
	let raf = 0;
	let snapT = 0;
	const onScroll = () => {
		if (!raf) raf = requestAnimationFrame(() => {
			raf = 0;
			render();
		});
		clearTimeout(snapT);
		snapT = window.setTimeout(snap, 170);
	};
	const onWheel = () => {
		if (animating) {
			cancelAnimationFrame(sRaf);
			animating = false;
		}
	};
	const onResize = () => {
		readVp();
		updateGeometry();
		render();
	};

	window.addEventListener('scroll', onScroll, { passive: true });
	window.addEventListener('wheel', onWheel, { passive: true });
	window.addEventListener('touchstart', onWheel, { passive: true });
	window.addEventListener('resize', onResize);

	readVp();
	updateGeometry();
	render();
	root.setAttribute('data-ready', '');
}
