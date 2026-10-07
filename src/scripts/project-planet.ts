// Planète de la page projet : un astre par projet, sa stack en satellites, sa signature en orbite.
//
// - Le système (catégorie) donne la technique de rendu : Game = rocheux (cratères),
//   Graphics = low-poly (facettes), Web = plaques métalliques + anneaux de tirets.
// - Le projet donne son « ADN » (data-* posés par PlanetScene.astro) : couleur (token
//   --planet-<slug>), graine, signature, ceinture, nombre d'anneaux.
// - Un projet In progress a un drone de chantier au travail, avec un geste propre au système :
//   Game = il trace des fissures de lave au laser, Graphics = il pose les facettes une à une,
//   Web = il soude les plaques manquantes.
//
// Toutes les couleurs viennent de tokens.css (lus au démarrage) ou en sont dérivées.

type Vec3 = [number, number, number];
type RGB = [number, number, number];
type LatLon = [number, number];

/** Inclinaison du plan des orbites à l'écran et aplatissement de la perspective. */
const TILT = (-13 * Math.PI) / 180;
const FLAT = 0.3;
const PITCH = Math.asin(FLAT); // l'équateur de la planète est dans le plan des orbites
const cT = Math.cos(TILT), sT = Math.sin(TILT), cP = Math.cos(PITCH), sP = Math.sin(PITCH);
const LN = Math.hypot(0.5, 0.55, 0.67);
const LIGHT: Vec3 = [-0.5 / LN, -0.55 / LN, 0.67 / LN]; // lumière en haut à gauche
const TAU = Math.PI * 2;

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches; // tactile : 30 images/s suffisent

// ---------- Couleurs (tokens) ----------

function hex(value: string): RGB {
	const v = value.trim().replace('#', '');
	const n = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
	return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)) as RGB;
}
const rootStyle = getComputedStyle(document.documentElement);
const token = (name: string, fallback = '#ffffff') => hex(rootStyle.getPropertyValue(name) || fallback);
const C = {
	accent: token('--color-accent'),
	accentLight: token('--color-accent-light'),
	text: token('--color-text'),
	muted: token('--color-text-muted'),
	secondary: token('--color-secondary'),
	bg: token('--color-bg'),
	deep: token('--color-bg-deep'),
};
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => v + (b[i] - v) * t) as RGB;
const rgba = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const scale = (c: RGB, k: number): RGB => c.map((v) => Math.min(255, v * k)) as RGB;
const WHITE: RGB = [255, 255, 255];

// ---------- Géométrie ----------

const seeded = (n: number) => () => (n = (n * 16807) % 2147483647) / 2147483647;
const lit = ([x, y, z]: Vec3) => Math.max(0, x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]);
const sphere = (lat: number, lon: number): Vec3 => [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];

/** Point du repère monde (y = axe des pôles) → repère écran unitaire [x droite, y bas, z vers nous]. */
function view(wx: number, wy: number, wz: number, spin: number): Vec3 {
	const x = wx * Math.cos(spin) + wz * Math.sin(spin), z = -wx * Math.sin(spin) + wz * Math.cos(spin);
	const y2 = wy * cP - z * sP, z2 = wy * sP + z * cP;
	const u = x, v = -y2;
	return [u * cT - v * sT, u * sT + v * cT, z2];
}
const fromLatLon = (lat: number, lon: number, spin: number) => view(...sphere(lat, lon), spin);

// ---------- Scène ----------

type System = 'rocky' | 'facets' | 'plated';
const SYSTEMS: Record<string, System> = { Game: 'rocky', Graphics: 'facets', Web: 'plated' };
const SPIN: Record<System, number> = { rocky: 0.06, facets: 0.05, plated: 0.05 };

interface Panel { a: number; b: number; l0: number; l1: number; v: number; rust: boolean; hole: boolean }
interface Ring { roll: number; flat: number; k: number; dir: number; speed: number }
interface Crack { t: number; pts: LatLon[] }
interface Drone { clock: number; last: number | null; phase: 'fly' | 'aim' | 'fire'; until: number; fire: number; dur: number; target: LatLon; path: LatLon[] | null; panel: Panel | null }
interface Builder { pos: Vec3; target: Vec3; firing: boolean; alpha: (k: number) => number }

interface Scene {
	box: HTMLElement;
	cv: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	system: System;
	color: RGB;
	wip: boolean;
	rnd: () => number;
	W: number; H: number; R: number;
	cx: number; cy: number;
	orbitStart: number;
	sats: { el: HTMLElement; r: number; a0: number }[];
	signature: string;
	sigDir: number;
	sigR: number;
	belt?: { r: number; a0: number; size: number }[];
	craters?: { lat: number; lon: number; size: number }[];
	maria?: { lat: number; lon: number; size: number }[];
	cracks?: Crack[];
	jitter?: number[];
	rows?: { a: number; b: number; off: number; n: number }[];
	trench?: number;
	panels?: Panel[];
	rings?: Ring[];
	drone?: Drone;
	builder?: Builder;
}

const ORBIT_SCALE = 2.1;
/** Point d'une orbite (rayon r en unités d'orbite, angle a) → écran + profondeur (sin a > 0 = devant). */
function proj(s: Scene, r: number, a: number): Vec3 {
	const k = r * s.R * ORBIT_SCALE, x = Math.cos(a) * k, y = Math.sin(a) * k * FLAT;
	return [s.cx + x * cT - y * sT, s.cy + x * sT + y * cT, Math.sin(a)];
}
const toScreen = (s: Scene, p: Vec3 | number[]): [number, number] => [s.cx + p[0] * s.R, s.cy + p[1] * s.R];
const spinOf = (s: Scene, time: number) => -time * SPIN[s.system];

function setup(box: HTMLElement): Scene {
	const ds = box.dataset;
	const cv = box.querySelector('canvas')!;
	const system = SYSTEMS[ds.system ?? ''] ?? 'rocky';
	const rnd = seeded(Number(ds.seed) || 11);
	const s: Scene = {
		box, cv, ctx: cv.getContext('2d')!, system,
		color: token(`--planet-${ds.slug}`, '#8d88bd'),
		wip: 'wip' in ds, rnd,
		W: 0, H: 0, R: 0, cx: 0, cy: 0,
		orbitStart: 'belt' in ds ? 0.78 : 0.72,
		sats: [],
		signature: ds.signature ?? 'moon',
		sigDir: 'retrograde' in ds ? -1 : 1,
		sigR: 'belt' in ds ? 0.63 : 0.55,
	};
	s.sats = [...box.querySelectorAll<HTMLElement>('[data-sat]')].map((el, i) => ({ el, r: s.orbitStart + i * 0.12, a0: i * 2.1 + 0.6 }));
	if (system === 'rocky') initRocky(s);
	if (system === 'facets') s.jitter = Array.from({ length: 8 * 14 }, () => 0.9 + rnd() * 0.2);
	if (system === 'plated') initPlated(s, Number(ds.rings) || 1);
	if ('belt' in ds) s.belt = Array.from({ length: 170 }, () => ({ r: 0.57 + rnd() * 0.12, a0: rnd() * TAU, size: 0.6 + rnd() ** 3 * 1.8 }));
	if (s.wip && system !== 'facets') s.drone = { clock: 0, last: null, phase: 'fly', until: 2, fire: 0, dur: 0.5, target: [0, 0], path: null, panel: null };
	if (s.wip && system === 'facets') s.builder = { pos: [0, -1.4, 0], target: [0, 0, 1], firing: false, alpha: () => 1 };
	box.toggleAttribute('data-live', true);
	return s;
}

function resize(s: Scene) {
	const dpr = devicePixelRatio || 1;
	s.W = s.box.clientWidth; s.H = s.box.clientHeight;
	s.cv.width = Math.round(s.W * dpr); s.cv.height = Math.round(s.H * dpr);
	s.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	s.R = Math.min(s.W, s.H) * 0.3;
	s.cx = s.W * 0.5; s.cy = s.H * 0.44;
}

// ---------- Outils de dessin ----------

function shade(c: CanvasRenderingContext2D, cx: number, cy: number, R: number) {
	const g = c.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.15, cx, cy, R * 1.02);
	g.addColorStop(0, rgba(C.text, 0.12)); g.addColorStop(0.55, rgba(C.deep, 0)); g.addColorStop(1, rgba(C.deep, 0.88));
	c.fillStyle = g; c.fillRect(cx - R, cy - R, 2 * R, 2 * R);
}
function baseFill(s: Scene, c: CanvasRenderingContext2D) {
	const { cx, cy, R } = s;
	const g = c.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
	g.addColorStop(0, rgba(s.color)); g.addColorStop(0.55, rgba(mix(s.color, C.bg, 0.5))); g.addColorStop(1, rgba(mix(s.color, C.deep, 0.8)));
	c.fillStyle = g; c.fillRect(cx - R, cy - R, 2 * R, 2 * R);
}
function rim(s: Scene) {
	const c = s.ctx;
	c.beginPath(); c.arc(s.cx, s.cy, s.R + 1, 0, TAU);
	c.strokeStyle = rgba(C.secondary, 0.55); c.lineWidth = 1.5; c.stroke();
}
function poly(s: Scene, pts: Vec3[]) {
	const c = s.ctx;
	c.beginPath();
	pts.forEach(([x, y], k) => (k ? c.lineTo(s.cx + x * s.R, s.cy + y * s.R) : c.moveTo(s.cx + x * s.R, s.cy + y * s.R)));
	c.closePath();
}
/** Polyligne de surface (lat/lon monde), seulement sur la face visible. */
function surfLine(s: Scene, pts: LatLon[] | Vec3[], spin: number, world = false) {
	const c = s.ctx;
	c.beginPath();
	let prev = false;
	pts.forEach((p) => {
		const [x, y, z] = world ? view(...(p as Vec3), spin) : fromLatLon(p[0], p[1], spin);
		const ok = z > 0.05;
		if (ok && prev) c.lineTo(s.cx + x * s.R, s.cy + y * s.R); else c.moveTo(s.cx + x * s.R, s.cy + y * s.R);
		prev = ok;
	});
	c.stroke();
}
function facetGrid(rows: number, cols: number, spin: number, each: (i: number, j: number, pts: Vec3[], n: Vec3) => void) {
	for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
		const la0 = -Math.PI / 2 + (i * Math.PI) / rows, la1 = la0 + Math.PI / rows;
		const lo0 = (j * TAU) / cols, lo1 = lo0 + TAU / cols;
		const pts = ([[la0, lo0], [la0, lo1], [la1, lo1], [la1, lo0]] as LatLon[]).map(([a, b]) => fromLatLon(a, b, spin));
		each(i, j, pts, fromLatLon((la0 + la1) / 2, (lo0 + lo1) / 2, spin));
	}
}
function orbitEllipse(s: Scene, r: number, front: boolean) {
	const c = s.ctx;
	c.beginPath();
	const from = front ? 0 : Math.PI;
	for (let a = from; a <= from + Math.PI + 0.01; a += 0.04) {
		const [x, y] = proj(s, r, a);
		a === from ? c.moveTo(x, y) : c.lineTo(x, y);
	}
	c.stroke();
}

// ---------- Game : astre rocheux ----------

function initRocky(s: Scene) {
	const r = s.rnd;
	s.craters = Array.from({ length: 30 }, () => ({ lat: (r() - 0.5) * 2.6, lon: r() * TAU, size: 0.05 + r() ** 2 * 0.16 }));
	s.maria = Array.from({ length: 5 }, () => ({ lat: (r() - 0.5) * 2, lon: r() * TAU, size: 0.3 + r() * 0.25 }));
	if (s.wip) s.cracks = Array.from({ length: 6 }, () => ({ t: -1e9, pts: randomPath(r, (r() - 0.5) * 2.4, r() * TAU, 9, 0.13, 0.17, 1.2) }));
}
function randomPath(r: () => number, lat: number, lon: number, n: number, dLat: number, dLon: number, turn: number): LatLon[] {
	let h = r() * TAU;
	return Array.from({ length: n }, () => {
		const pt: LatLon = [lat, lon];
		h += (r() - 0.5) * turn; lat += Math.sin(h) * dLat; lon += Math.cos(h) * dLon;
		return pt;
	});
}
function drawRocky(s: Scene, time: number) {
	const c = s.ctx, { cx, cy, R } = s, spin = spinOf(s, time);
	baseFill(s, c);
	const dark = mix(s.color, C.deep, 0.75), light = mix(s.color, WHITE, 0.45);
	const spot = (f: { lat: number; lon: number; size: number }, fill: string, ring?: string) => {
		const [x, y, z] = fromLatLon(f.lat, f.lon, spin);
		if (z < 0.08) return;
		const rr = f.size * R;
		c.beginPath(); c.ellipse(cx + x * R, cy + y * R, rr * z, rr, Math.atan2(y, x), 0, TAU);
		c.fillStyle = fill; c.fill();
		if (ring) { c.strokeStyle = ring; c.lineWidth = 1; c.stroke(); }
	};
	s.maria!.forEach((m) => spot(m, rgba(dark, 0.3)));
	s.craters!.forEach((k) => spot(k, rgba(dark, 0.45), rgba(light, 0.28)));
	shade(c, cx, cy, R);
	if (s.cracks) drawLava(s, time, spin);
}
// In progress : protoplanète, la croûte n'a pas fini de refroidir
function drawLava(s: Scene, time: number, spin: number) {
	const c = s.ctx, { cx, cy, R } = s;
	const glow = c.createRadialGradient(cx + R * 0.4, cy + R * 0.45, R * 0.2, cx, cy, R * 1.1);
	glow.addColorStop(0, rgba(C.accent, 0.16)); glow.addColorStop(1, rgba(C.accent, 0));
	c.fillStyle = glow; c.fillRect(cx - R, cy - R, 2 * R, 2 * R);
	c.lineCap = 'round';
	const line = (pts: LatLon[], width: number, color: string) => { c.strokeStyle = color; c.lineWidth = width; surfLine(s, pts, spin); };
	s.cracks!.forEach((cr, i) => {
		const pulse = reduce ? 0.8 : 0.55 + 0.45 * Math.sin(time * 1.6 + i * 1.3);
		const fresh = Math.max(0, 1 - (time - cr.t) / 2.5); // fissure neuve : plus vive et plus large
		line(cr.pts, 3.2 + fresh * 2, rgba(C.accent, 0.18 * pulse + 0.3 * fresh));
		line(cr.pts, 1.2 + fresh, rgba(mix(C.accentLight, WHITE, fresh * 0.6), Math.min(1, 0.9 * pulse + fresh)));
	});
	const d = s.drone; // fissure en train d'être tracée
	if (d?.phase === 'fire' && d.path) {
		const part = d.path.slice(0, Math.max(2, Math.ceil(d.path.length * (1 - d.fire / d.dur))));
		line(part, 5, rgba(C.accent, 0.45)); line(part, 1.8, rgba(mix(C.accentLight, WHITE, 0.6)));
	}
	c.lineCap = 'butt';
}

// ---------- Graphics : astre low-poly ----------

const F_ROWS = 8, F_COLS = 14;
function drawFacets(s: Scene, time: number) {
	const c = s.ctx, spin = spinOf(s, time);
	if (s.builder) builderStep(s, time, spin);
	const alpha = s.builder ? s.builder.alpha : () => 1;
	if (s.builder) facetGrid(F_ROWS, F_COLS, spin, (_i, _j, pts, n) => { // filaire arrière, vu à travers
		if (n[2] > 0) return;
		poly(s, pts); c.strokeStyle = rgba(C.secondary, 0.16); c.lineWidth = 0.7; c.stroke();
	});
	facetGrid(F_ROWS, F_COLS, spin, (i, j, pts, n) => {
		if (n[2] <= 0) return;
		const k = (F_ROWS - 1 - i) * F_COLS + j, a = alpha(k);
		poly(s, pts);
		if (a > 0) {
			c.fillStyle = rgba(scale(s.color, (0.22 + 0.95 * lit(n)) * s.jitter![i * F_COLS + j]), a); c.fill();
			c.strokeStyle = a < 1 ? rgba(C.secondary, 0.75) : rgba(scale(s.color, 0.25), 0.5);
		} else c.strokeStyle = rgba(C.secondary, 0.75);
		c.lineWidth = 0.8; c.stroke();
	});
}
// In progress : le drone pose toutes les facettes dans l'ordre (pôle nord → sud), pause,
// effacement progressif dans le même ordre, retour au pôle, et on recommence.
const B_STEP = 0.18, B_HOLD = 1.6, B_GAP = 0.05, B_FADE = 0.5, B_RETURN = 1.4;
function builderStep(s: Scene, time: number, spin: number) {
	const b = s.builder!, total = F_ROWS * F_COLS, build = total * B_STEP, erase = total * B_GAP + B_FADE;
	const tt = reduce ? build * 0.6 : time % (build + B_HOLD + erase + B_RETURN);
	const center = (k: number): LatLon => {
		const i = F_ROWS - 1 - Math.floor(k / F_COLS), j = k % F_COLS;
		return [-Math.PI / 2 + ((i + 0.5) * Math.PI) / F_ROWS, ((j + 0.5) * TAU) / F_COLS];
	};
	const above = (k: number) => view(...(sphere(...center(Math.max(0, Math.min(total - 1, k)))).map((v) => v * 1.35) as Vec3), spin);
	const park: Vec3 = [0.95 + 0.06 * Math.sin(time * 2), -1.05 + 0.06 * Math.cos(time * 1.6), 0.5];
	const lerp = (p: Vec3, q: Vec3, m: number) => p.map((v, i) => v + (q[i] - v) * m) as Vec3;
	const ease = (m: number) => m * m * (3 - 2 * m);
	b.firing = false;
	if (tt < build) {
		const idx = Math.floor(tt / B_STEP), frac = (tt / B_STEP) % 1, placed = idx + (frac > 0.8 ? 1 : 0);
		b.pos = lerp(above(idx - 1), above(idx), Math.min(1, frac * 2));
		b.firing = !reduce && frac > 0.55;
		b.target = fromLatLon(...center(idx), spin);
		b.alpha = (k) => (k < placed ? 1 : 0);
	} else if (tt < build + B_HOLD) {
		b.pos = lerp(above(total - 1), park, ease(Math.min(1, (tt - build) / 0.8)));
		b.alpha = () => 1;
	} else if (tt < build + B_HOLD + erase) {
		const te = tt - build - B_HOLD;
		b.pos = park;
		b.alpha = (k) => 1 - Math.max(0, Math.min(1, (te - k * B_GAP) / B_FADE));
	} else {
		b.pos = lerp(park, above(0), ease((tt - build - B_HOLD - erase) / B_RETURN));
		b.alpha = () => 0;
	}
}

// ---------- Web : plaques métalliques + anneaux ----------

function initPlated(s: Scene, ringCount: number) {
	const r = s.rnd, lats = [-1.25];
	while (lats[lats.length - 1] < 1.2) lats.push(lats[lats.length - 1] + 0.22 + r() * 0.3);
	s.rows = lats.slice(0, -1).map((a, i) => ({ a, b: lats[i + 1], off: r() * TAU, n: 6 + Math.floor(r() * 8) }));
	s.trench = (r() - 0.5) * 0.6;
	// Chaque plaque a sa nuance (plus claire, plus sombre, parfois rouillée) ; In progress : la moitié manque
	s.panels = s.rows.flatMap((row) => Array.from({ length: row.n }, (_, k) => {
		const step = TAU / row.n, l0 = row.off + k * step;
		return { a: row.a, b: row.b, l0, l1: l0 + step, v: r() * 2 - 1, rust: r() < 0.08, hole: s.wip && r() < 0.5 };
	}));
	// Anneaux vus de biais à des angles d'écran très différents : ils se croisent en X
	s.rings = Array.from({ length: Math.min(3, ringCount) }, (_, i) => ({
		roll: [-0.6, 0.45, 1.35][i] + (r() - 0.5) * 0.15,
		flat: [0.32, 0.42, 0.26][i],
		k: 1.16 + i * 0.05,
		dir: i % 2 ? -1 : 1,
		speed: 10 + r() * 8,
	}));
}
const panelCenter = (p: Panel): LatLon => [(p.a + p.b) / 2, (p.l0 + p.l1) / 2];
function panelOutline(p: Panel, spin: number): Vec3[] {
	const pts: LatLon[] = [];
	for (let t = 0; t <= 4; t++) pts.push([p.a, p.l0 + ((p.l1 - p.l0) * t) / 4]);
	for (let t = 0; t <= 3; t++) pts.push([p.a + ((p.b - p.a) * t) / 3, p.l1]);
	for (let t = 4; t >= 0; t--) pts.push([p.b, p.l0 + ((p.l1 - p.l0) * t) / 4]);
	for (let t = 3; t >= 0; t--) pts.push([p.a + ((p.b - p.a) * t) / 3, p.l0]);
	return pts.map(([a, b]) => fromLatLon(a, b, spin));
}
function drawPlated(s: Scene, time: number) {
	const c = s.ctx, spin = spinOf(s, time);
	baseFill(s, c);
	const visible = (p: Panel) => fromLatLon(...panelCenter(p), spin)[2] > 0;
	s.panels!.forEach((p) => {
		if (!visible(p)) return;
		poly(s, panelOutline(p, spin));
		c.fillStyle = p.rust ? rgba(C.accent, 0.12) : p.v > 0 ? rgba(C.text, p.v * 0.09) : rgba(C.deep, -p.v * 0.22);
		c.fill();
	});
	const seam = mix(s.color, C.deep, 0.6);
	c.strokeStyle = rgba(mix(s.color, C.deep, 0.7), 0.85); c.lineWidth = Math.max(2, s.R * 0.05);
	surfLine(s, Array.from({ length: 73 }, (_, i) => [s.trench!, (i * Math.PI) / 36] as LatLon), spin);
	c.strokeStyle = rgba(seam, 0.6); c.lineWidth = 0.8;
	s.rows!.forEach((row) => {
		surfLine(s, Array.from({ length: 73 }, (_, i) => [row.a, (i * Math.PI) / 36] as LatLon), spin);
		for (let k = 0; k < row.n; k++) {
			const lon = row.off + (k * TAU) / row.n;
			surfLine(s, [0, 1, 2, 3].map((t) => [row.a + ((row.b - row.a) * t) / 3, lon] as LatLon), spin);
		}
	});
	shade(c, s.cx, s.cy, s.R);
	// Chantier : plaque manquante = trou sombre + échafaudage en croix
	s.panels!.forEach((p) => {
		if (!p.hole || !visible(p)) return;
		const q = panelOutline(p, spin);
		poly(s, q); c.fillStyle = rgba(C.deep, 0.92); c.fill();
		c.strokeStyle = rgba(C.secondary, 0.7); c.lineWidth = 0.7; c.stroke();
		const [ax, ay] = toScreen(s, q[0]), [bx, by] = toScreen(s, q[9]), [dx, dy] = toScreen(s, q[4]), [ex, ey] = toScreen(s, q[13]);
		c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.moveTo(dx, dy); c.lineTo(ex, ey); c.stroke();
	});
}
function drawRings(s: Scene, time: number, front: boolean) {
	const c = s.ctx, t0 = reduce ? 0 : time;
	s.rings!.forEach((g) => {
		// repère écran : grand axe à l'angle roll, petit axe qui part vers nous pour l'avant de l'anneau
		const se = Math.sqrt(1 - g.flat * g.flat);
		const e1: Vec3 = [Math.cos(g.roll), Math.sin(g.roll), 0], e2: Vec3 = [-Math.sin(g.roll) * g.flat, Math.cos(g.roll) * g.flat, se];
		c.beginPath();
		let prev = false;
		for (let i = 0; i <= 120; i++) {
			const t = (i / 120) * TAU, p = [0, 1, 2].map((k) => (Math.cos(t) * e1[k] + Math.sin(t) * e2[k]) * g.k);
			const ok = p[2] > 0 === front, [x, y] = toScreen(s, p);
			if (ok && prev) c.lineTo(x, y); else c.moveTo(x, y);
			prev = ok;
		}
		c.setLineDash([16, 9]); c.lineDashOffset = -g.dir * t0 * g.speed;
		c.strokeStyle = rgba(C.accent, front ? 0.85 : 0.25); c.lineWidth = 2.2; c.stroke();
		c.setLineDash([]);
	});
}

// ---------- Ceinture, signature, satellites ----------

function drawBelt(s: Scene, time: number, front: boolean) {
	const c = s.ctx, col = mix(s.color, WHITE, 0.25);
	s.belt!.forEach((b) => {
		const [x, y, d] = proj(s, b.r, b.a0 + time * 0.33 * Math.pow(b.r / 0.52, -1.5));
		if (d > 0 !== front) return;
		c.fillStyle = rgba(col, front ? 0.85 : 0.35);
		c.fillRect(x - b.size / 2, y - b.size / 2, b.size, b.size);
	});
}

// Objets emblématiques des projets, dessinés centrés (sz ≈ demi-taille en px)
const SIGNATURES: Record<string, (c: CanvasRenderingContext2D, sz: number, t: number) => void> = {
	ship(c, sz, t) { // vaisseau vectoriel façon Asteroids
		c.beginPath(); c.moveTo(sz, 0); c.lineTo(-0.7 * sz, 0.6 * sz); c.lineTo(-0.35 * sz, 0); c.lineTo(-0.7 * sz, -0.6 * sz); c.closePath();
		c.fillStyle = rgba(C.deep, 0.9); c.fill();
		c.strokeStyle = rgba(C.text); c.lineWidth = 1.3; c.stroke();
		const f = 0.5 + 0.5 * Math.sin(t * 30);
		c.beginPath(); c.moveTo(-0.45 * sz, 0.22 * sz); c.lineTo(-(0.8 + 0.4 * f) * sz, 0); c.lineTo(-0.45 * sz, -0.22 * sz);
		c.strokeStyle = rgba(C.accent); c.stroke();
	},
	teapot(c, sz, t) { // théière de l'Utah en low-poly, qui culbute
		c.rotate(t * 0.6);
		const a = rgba(C.text, 0.85), b = rgba(C.muted);
		c.beginPath(); c.moveTo(-0.7 * sz, 0.1 * sz); c.lineTo(-0.5 * sz, -0.4 * sz); c.lineTo(0.5 * sz, -0.4 * sz); c.lineTo(0.7 * sz, 0.1 * sz); c.lineTo(0.45 * sz, 0.5 * sz); c.lineTo(-0.45 * sz, 0.5 * sz); c.closePath();
		c.fillStyle = a; c.fill();
		c.beginPath(); c.moveTo(0, 0.1 * sz); c.lineTo(0.7 * sz, 0.1 * sz); c.lineTo(0.45 * sz, 0.5 * sz); c.lineTo(-0.45 * sz, 0.5 * sz); c.lineTo(-0.7 * sz, 0.1 * sz); c.closePath();
		c.fillStyle = b; c.fill();
		c.beginPath(); c.moveTo(0.6 * sz, -0.05 * sz); c.lineTo(1.15 * sz, -0.5 * sz); c.lineTo(1.05 * sz, -0.3 * sz); c.lineTo(0.68 * sz, 0.2 * sz); c.closePath(); c.fillStyle = a; c.fill();
		c.beginPath(); c.moveTo(-0.62 * sz, -0.2 * sz); c.lineTo(-1.05 * sz, -0.1 * sz); c.lineTo(-0.95 * sz, 0.3 * sz); c.lineTo(-0.6 * sz, 0.3 * sz);
		c.strokeStyle = b; c.lineWidth = Math.max(1.5, sz * 0.18); c.stroke();
		c.beginPath(); c.moveTo(-0.25 * sz, -0.4 * sz); c.lineTo(0, -0.62 * sz); c.lineTo(0.25 * sz, -0.4 * sz); c.closePath(); c.fillStyle = b; c.fill();
	},
	station(c, sz, t) { // station orbitale : module central + panneaux solaires
		c.rotate(t * 0.4);
		c.fillStyle = rgba(C.secondary); c.fillRect(-1.15 * sz, -0.28 * sz, 0.75 * sz, 0.56 * sz); c.fillRect(0.4 * sz, -0.28 * sz, 0.75 * sz, 0.56 * sz);
		c.strokeStyle = rgba(C.text, 0.6); c.lineWidth = 0.8; c.beginPath(); c.moveTo(-0.4 * sz, 0); c.lineTo(0.4 * sz, 0); c.stroke();
		c.fillStyle = rgba(C.text); c.fillRect(-0.3 * sz, -0.3 * sz, 0.6 * sz, 0.6 * sz);
		c.fillStyle = rgba(C.accent); c.fillRect(-0.1 * sz, -0.1 * sz, 0.2 * sz, 0.2 * sz);
	},
	beacon(c, sz, t) { // balise : feu orange qui clignote
		c.fillStyle = rgba(C.text); c.beginPath(); c.arc(0, 0, 0.4 * sz, 0, TAU); c.fill();
		c.strokeStyle = rgba(C.text); c.lineWidth = 1; c.beginPath(); c.moveTo(0, -0.4 * sz); c.lineTo(0, -sz); c.stroke();
		const on = reduce || Math.sin(t * 4) > 0;
		c.beginPath(); c.arc(0, -sz, 0.22 * sz, 0, TAU); c.fillStyle = rgba(C.accent, on ? 1 : 0.25); c.fill();
		if (on) { c.beginPath(); c.arc(0, -sz, 0.6 * sz, 0, TAU); c.fillStyle = rgba(C.accent, 0.18); c.fill(); }
	},
	moon(c, sz) { // petite lune
		const g = c.createRadialGradient(-0.25 * sz, -0.25 * sz, 0, 0, 0, 0.6 * sz);
		g.addColorStop(0, rgba(mix(C.muted, WHITE, 0.4))); g.addColorStop(1, rgba(mix(C.muted, C.deep, 0.6)));
		c.beginPath(); c.arc(0, 0, 0.6 * sz, 0, TAU); c.fillStyle = g; c.fill();
	},
};
function drawSignature(s: Scene, time: number, front: boolean) {
	const draw = SIGNATURES[s.signature];
	if (!draw) return;
	const c = s.ctx, r = s.sigR, dir = s.sigDir, a = 2.4 + dir * time * 0.8 * Math.pow(r / 0.52, -1.5);
	const [x, y, d] = proj(s, r, a);
	if (d > 0 !== front) return;
	for (let k = 8; k >= 1; k--) { // traînée
		const [tx, ty] = proj(s, r, a - dir * k * 0.035);
		c.beginPath(); c.arc(tx, ty, 1.2, 0, TAU); c.fillStyle = rgba(C.text, 0.25 * (1 - k / 9) * (front ? 1 : 0.4)); c.fill();
	}
	const [nx, ny] = proj(s, r, a + dir * 0.02);
	c.save();
	c.globalAlpha = front ? 1 : 0.5;
	c.translate(x, y);
	if (s.signature === 'ship') c.rotate(Math.atan2(ny - y, nx - x)); // seul le vaisseau suit sa trajectoire
	draw(c, Math.max(6, s.R * 0.13) * (front ? 1 : 0.8), time);
	c.restore();
}

// ---------- Drone de chantier (In progress) ----------

/** Sprite A : quadcopter de chantier (bandes de signalisation, gyrophare, buse). Centré, ~36 unités de large. */
function drawDrone(c: CanvasRenderingContext2D, x: number, y: number, size: number, time: number, front: boolean, active: boolean) {
	c.save();
	c.globalAlpha = front ? 1 : 0.45;
	c.translate(x, y);
	c.scale(size / 36, size / 36);
	const steel = rgba(C.muted);
	c.strokeStyle = steel; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-17, -6); c.lineTo(17, -6); c.stroke();
	[-18, 18].forEach((rx, i) => { // hélices floues
		c.fillStyle = rgba(C.text, 0.18); c.beginPath(); c.ellipse(rx, -9, 9, 2, 0, 0, TAU); c.fill();
		const a = reduce ? 0.3 : time * 40 + i;
		c.strokeStyle = rgba(C.text, 0.7); c.lineWidth = 1;
		c.beginPath(); c.moveTo(rx - Math.cos(a) * 9, -9 - Math.sin(a) * 2); c.lineTo(rx + Math.cos(a) * 9, -9 + Math.sin(a) * 2); c.stroke();
	});
	c.fillStyle = rgba(C.text); c.beginPath(); c.roundRect(-11, -6, 22, 12, 3); c.fill();
	c.save(); c.beginPath(); c.rect(-11, 1, 22, 5); c.clip(); // bandes de signalisation
	c.fillStyle = rgba(C.accent); c.fillRect(-11, 1, 22, 5);
	c.fillStyle = rgba(C.bg);
	for (let i = -3; i < 7; i++) { c.beginPath(); c.moveTo(-11 + i * 4.4, 6); c.lineTo(-8.8 + i * 4.4, 6); c.lineTo(-3.8 + i * 4.4, 1); c.lineTo(-6 + i * 4.4, 1); c.fill(); }
	c.restore();
	const on = reduce || Math.sin(time * 6) > 0; // gyrophare
	c.fillStyle = on ? rgba(C.accent) : rgba(mix(C.accent, C.deep, 0.5)); c.beginPath(); c.arc(0, -6, 3.2, Math.PI, 0); c.fill();
	c.fillStyle = steel; c.fillRect(-2, 6, 4, 4); // buse
	c.fillStyle = rgba(C.bg); c.fillRect(-7, -3, 5, 3);
	c.fillStyle = active ? rgba(C.accent) : rgba(C.secondary); c.fillRect(-6.5, -2.5, 4, 2); // hublot
	c.restore();
}
function drawLaser(s: Scene, x: number, y: number, tx: number, ty: number, front: boolean) {
	const c = s.ctx;
	c.save();
	c.globalAlpha = front ? 1 : 0.75;
	c.lineCap = 'round';
	c.strokeStyle = rgba(C.accent, 0.3); c.lineWidth = 4; c.beginPath(); c.moveTo(x, y); c.lineTo(tx, ty); c.stroke();
	c.strokeStyle = rgba(C.accentLight); c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y); c.lineTo(tx, ty); c.stroke();
	if (front) {
		for (let k = 0; k < 6; k++) { // étincelles
			const a = Math.random() * TAU, l = Math.random() * s.R * 0.08;
			c.fillStyle = rgba(k % 2 ? C.accentLight : C.accent);
			c.fillRect(tx + Math.cos(a) * l - 0.8, ty + Math.sin(a) * l - 0.8, 1.6, 1.6);
		}
		c.beginPath(); c.arc(tx, ty, 2.5 + Math.random() * 1.5, 0, TAU); c.fillStyle = rgba(mix(C.accentLight, WHITE, 0.6), 0.9); c.fill();
	}
	c.restore();
}
const droneSize = (s: Scene) => Math.max(14, s.R * 0.2);

// Drone « libre » (Game, Web) : vol chaotique, arrêt devant la planète, tir, puis il repart
function dronePos(d: Drone): Vec3 {
	const t = d.clock, a = 0.55 * t + 0.6 * Math.sin(0.37 * t), rad = 1.55 + 0.18 * Math.sin(1.3 * t + 1);
	const x = rad * Math.cos(a), z = rad * Math.sin(a), y = 0.42 * Math.sin(0.8 * t) + 0.22 * Math.sin(2.1 * t + 2);
	return [x * cT - y * sT, x * sT + y * cT, z];
}
function pickFront(s: Scene, time: number): LatLon {
	for (let n = 0; n < 40; n++) {
		const lat = Math.asin(s.rnd() * 1.6 - 0.8), lon = s.rnd() * TAU;
		if (fromLatLon(lat, lon, spinOf(s, time))[2] > 0.45) return [lat, lon];
	}
	return [0, -spinOf(s, time)];
}
function droneAim(s: Scene, time: number) {
	const d = s.drone!, spin = spinOf(s, time);
	d.path = null; d.panel = null;
	if (s.system === 'rocky') { // Game : point de départ + tracé courbe du balayage
		d.target = pickFront(s, time);
		d.path = randomPath(s.rnd, d.target[0], d.target[1], 12, 0.07, 0.09, 0.9);
	} else { // Web : une plaque manquante visible
		const holes = s.panels!.filter((p) => p.hole && fromLatLon(...panelCenter(p), spin)[2] > 0.3);
		d.panel = holes.length ? holes[Math.floor(s.rnd() * holes.length)] : null;
		d.target = d.panel ? panelCenter(d.panel) : pickFront(s, time);
	}
}
function droneWeld(s: Scene, time: number) {
	const d = s.drone!, spin = spinOf(s, time);
	if (s.system === 'rocky' && d.path) { // le tracé devient une fissure, les plus anciennes se referment
		s.cracks!.push({ t: time, pts: d.path });
		s.cracks = s.cracks!.slice(-12);
	}
	if (d.panel) { // plaque soudée ; une plaque cachée se détache pour que le chantier reste ouvert
		d.panel.hole = false;
		const hidden = s.panels!.filter((p) => !p.hole && fromLatLon(...panelCenter(p), spin)[2] < -0.2);
		if (hidden.length) hidden[Math.floor(s.rnd() * hidden.length)].hole = true;
	}
	d.path = null; d.panel = null;
}
function droneUpdate(s: Scene, time: number) {
	const d = s.drone!, dt = d.last === null ? 0 : Math.min(0.1, time - d.last);
	d.last = time;
	if (reduce) return;
	if (d.phase === 'fly') {
		d.clock += dt; d.until -= dt;
		if (d.until <= 0 && dronePos(d)[2] > 0.2) { droneAim(s, time); d.phase = 'aim'; d.fire = 0.25; }
	} else if (d.phase === 'aim') {
		d.fire -= dt;
		if (d.fire <= 0) { d.phase = 'fire'; d.dur = d.fire = s.system === 'rocky' ? 0.75 : 0.5; }
	} else {
		d.fire -= dt;
		if (d.fire <= 0) { droneWeld(s, time); d.phase = 'fly'; d.until = 1.6 + s.rnd() * 1.6; }
	}
}
function drawFreeDrone(s: Scene, time: number, front: boolean) {
	const d = s.drone!, p = dronePos(d);
	if (p[2] > 0 !== front) return;
	const [x, y] = toScreen(s, p);
	if (front && d.phase === 'fire') {
		let tgt = d.target;
		if (d.path) { // le point d'impact avance le long du tracé
			const u = Math.min(1, 1 - d.fire / d.dur) * (d.path.length - 1), i = Math.floor(u), f = u - i;
			const a = d.path[i], b = d.path[Math.min(i + 1, d.path.length - 1)];
			tgt = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
		}
		const [tx, ty] = toScreen(s, fromLatLon(...tgt, spinOf(s, time)));
		drawLaser(s, x, y + droneSize(s) * 0.25, tx, ty, true);
	}
	drawDrone(s.ctx, x, y, droneSize(s) * (1 + 0.12 * p[2]), time, front, d.phase !== 'fly');
}
// Drone bâtisseur (Graphics) : laser tracé dans la passe du drone, la planète masque ce qui passe derrière
function drawBuilder(s: Scene, time: number, front: boolean) {
	const b = s.builder!;
	if (b.pos[2] > 0 !== front) return;
	const [x, y] = toScreen(s, b.pos);
	if (b.firing) { const [tx, ty] = toScreen(s, b.target); drawLaser(s, x, y + droneSize(s) * 0.25, tx, ty, front && b.target[2] > 0); }
	drawDrone(s.ctx, x, y, droneSize(s), time, front, b.firing);
}

// ---------- Image ----------

function frame(s: Scene, ms: number) {
	if (!s.W) return;
	const c = s.ctx, time = reduce ? 0 : ms / 1000;
	c.clearRect(0, 0, s.W, s.H);
	const sats = s.sats.map((o) => proj(s, o.r, o.a0 + time * 0.55 * Math.pow(o.r / 0.52, -1.5)));
	const dot = ([x, y, d]: Vec3) => { c.beginPath(); c.arc(x, y, d > 0 ? 4 : 3, 0, TAU); c.fillStyle = rgba(C.accent, d > 0 ? 1 : 0.45); c.fill(); };
	if (s.drone) droneUpdate(s, time);

	// Arrière-plan : moitiés arrière des orbites, de la ceinture, des anneaux ; ce qui est derrière la planète
	c.lineWidth = 1; c.setLineDash([3, 5]); c.strokeStyle = rgba(C.secondary, 0.45);
	s.sats.forEach((o) => orbitEllipse(s, o.r, false));
	c.setLineDash([]);
	if (s.rings) drawRings(s, time, false);
	if (s.belt) drawBelt(s, time, false);
	drawSignature(s, time, false);
	if (s.drone) drawFreeDrone(s, time, false);
	if (s.builder) drawBuilder(s, time, false);
	sats.forEach((p) => { if (p[2] <= 0) dot(p); });

	// Planète
	c.save();
	if (s.system !== 'facets') { c.beginPath(); c.arc(s.cx, s.cy, s.R, 0, TAU); c.clip(); }
	if (s.system === 'rocky') drawRocky(s, time);
	else if (s.system === 'facets') drawFacets(s, time);
	else drawPlated(s, time);
	c.restore();
	if (s.system !== 'facets') rim(s);

	// Premier plan
	if (s.rings) drawRings(s, time, true);
	if (s.belt) drawBelt(s, time, true);
	drawSignature(s, time, true);
	if (s.drone) drawFreeDrone(s, time, true);
	if (s.builder) drawBuilder(s, time, true);
	c.setLineDash([3, 5]); c.strokeStyle = rgba(C.secondary, 0.7); c.lineWidth = 1;
	s.sats.forEach((o) => orbitEllipse(s, o.r, true));
	c.setLineDash([]);
	sats.forEach((p) => { if (p[2] > 0) dot(p); });

	// Étiquettes des satellites (HTML) : estompées derrière, masquées derrière le disque
	s.sats.forEach((o, i) => {
		const [x, y, d] = sats[i];
		const hidden = d <= 0 && Math.hypot(x - s.cx, y - s.cy) < s.R * 1.05;
		o.el.style.transform = `translate(${x}px, ${y - 16}px) translate(-50%, -50%)`;
		o.el.style.opacity = d > 0 ? '1' : hidden ? '0' : '0.45';
		o.el.style.zIndex = d > 0 ? '2' : '0';
	});
}

// ---------- Démarrage ----------

const scenes = [...document.querySelectorAll<HTMLElement>('[data-planet-scene]')].map(setup);
const visible = new Set<Scene>();
const io = new IntersectionObserver((entries) => entries.forEach((e) => {
	const s = scenes.find((sc) => sc.box === e.target);
	if (s) e.isIntersecting ? visible.add(s) : visible.delete(s);
}));
scenes.forEach((s) => { io.observe(s.box); resize(s); frame(s, performance.now()); });
new ResizeObserver(() => scenes.forEach((s) => { resize(s); frame(s, performance.now()); })).observe(document.body);

if (!reduce && scenes.length) {
	let last = 0;
	const loop = (ms: number) => {
		if (!coarse || ms - last > 32) { last = ms; visible.forEach((s) => frame(s, ms)); }
		requestAnimationFrame(loop);
	};
	requestAnimationFrame(loop);
}

export {}; // module : ses déclarations restent locales au fichier
