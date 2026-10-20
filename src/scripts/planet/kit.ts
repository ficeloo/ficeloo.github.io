// Outils communs des planètes : couleurs (tokens), repère de la sphère, scène, outils de dessin.
// Toutes les couleurs viennent de tokens.css (lus au démarrage) ou en sont dérivées.

export type Vec3 = [number, number, number];
export type RGB = [number, number, number];
export type LatLon = [number, number];

/** Inclinaison du plan des orbites à l'écran et aplatissement de la perspective. */
export const TILT = (-13 * Math.PI) / 180;
export const FLAT = 0.3;
const PITCH = Math.asin(FLAT); // l'équateur de la planète est dans le plan des orbites
export const cT = Math.cos(TILT), sT = Math.sin(TILT);
const cP = Math.cos(PITCH), sP = Math.sin(PITCH);
const LN = Math.hypot(0.5, 0.55, 0.67);
const LIGHT: Vec3 = [-0.5 / LN, -0.55 / LN, 0.67 / LN]; // lumière en haut à gauche
export const TAU = Math.PI * 2;

export const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Couleurs (tokens) ----------

function hex(value: string): RGB {
	const v = value.trim().replace('#', '');
	const n = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
	return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)) as RGB;
}
export const rootStyle = getComputedStyle(document.documentElement);
export const token = (name: string) => hex(rootStyle.getPropertyValue(name) || rootStyle.getPropertyValue('--color-text'));
export const C = {
	accent: token('--color-accent'),
	accentLight: token('--color-accent-light'),
	text: token('--color-text'),
	muted: token('--color-text-muted'),
	secondary: token('--color-secondary'),
	bg: token('--color-bg'),
	deep: token('--color-bg-deep'),
};
export const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => v + (b[i] - v) * t) as RGB;
export const rgba = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
export const scale = (c: RGB, k: number): RGB => c.map((v) => Math.min(255, v * k)) as RGB;
export const WHITE: RGB = [255, 255, 255];

// ---------- Géométrie ----------

export const seeded = (n: number) => () => (n = (n * 16807) % 2147483647) / 2147483647;
export const lit = ([x, y, z]: Vec3) => Math.max(0, x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]);
export const sphere = (lat: number, lon: number): Vec3 => [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];

/** Point du repère monde (y = axe des pôles) → repère écran unitaire [x droite, y bas, z vers nous]. */
export function view(wx: number, wy: number, wz: number, spin: number): Vec3 {
	const x = wx * Math.cos(spin) + wz * Math.sin(spin), z = -wx * Math.sin(spin) + wz * Math.cos(spin);
	const y2 = wy * cP - z * sP, z2 = wy * sP + z * cP;
	const u = x, v = -y2;
	return [u * cT - v * sT, u * sT + v * cT, z2];
}
export const fromLatLon = (lat: number, lon: number, spin: number) => view(...sphere(lat, lon), spin);

// ---------- Scène ----------

/** Rendu d'un système de la star map (catégorie) : chaque système a son fichier. */
export interface PlanetSystem {
	spin: number; // vitesse de rotation
	disc: boolean; // surface pleine : découpée au disque, avec bord teinté et liseré (le low-poly n'en a pas)
	init?(s: Scene, data: DOMStringMap): void; // tirages propres au système (graine du projet), au montage
	draw(s: Scene, time: number): void; // la surface
	// In progress : drone bâtisseur (builder) ou drone libre qui vise (aim), tire fireDur s puis termine (weld)
	builder?: boolean;
	fireDur?: number;
	aim?(s: Scene, time: number): void;
	weld?(s: Scene, time: number): void;
}

// État propre à chaque système (rempli par son init)
export interface Panel { a: number; b: number; l0: number; l1: number; v: number; rust: boolean; hole: boolean }
export interface Ring { roll: number; flat: number; k: number; dir: number; speed: number }
export interface Crack { t: number; pts: LatLon[] }
export interface Drone { clock: number; last: number | null; phase: 'fly' | 'aim' | 'fire'; until: number; fire: number; dur: number; target: LatLon; path: LatLon[] | null; panel: Panel | null }
export interface Builder { pos: Vec3; target: Vec3; firing: boolean; alpha: (k: number) => number }

export interface Scene {
	box: HTMLElement;
	cv: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	sys: PlanetSystem;
	color: RGB;
	ringColor: RGB;
	atmo: RGB; // couleur du système : atmosphère et liseré de la planète (vert-gris du site si en construction)
	halo?: HTMLCanvasElement; // atmosphère pré-dessinée (refaite seulement au redimensionnement)
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

export const ORBIT_SCALE = 2.1;
/** Point d'une orbite (rayon r en unités d'orbite, angle a) → écran + profondeur (sin a > 0 = devant). */
export function proj(s: Scene, r: number, a: number): Vec3 {
	const k = r * s.R * ORBIT_SCALE, x = Math.cos(a) * k, y = Math.sin(a) * k * FLAT;
	return [s.cx + x * cT - y * sT, s.cy + x * sT + y * cT, Math.sin(a)];
}
export const toScreen = (s: Scene, p: Vec3 | number[]): [number, number] => [s.cx + p[0] * s.R, s.cy + p[1] * s.R];
export const spinOf = (s: Scene, time: number) => -time * s.sys.spin;

/** Un point au hasard bien en face de nous (cible du drone). */
export function pickFront(s: Scene, time: number): LatLon {
	for (let n = 0; n < 40; n++) {
		const lat = Math.asin(s.rnd() * 1.6 - 0.8), lon = s.rnd() * TAU;
		if (fromLatLon(lat, lon, spinOf(s, time))[2] > 0.45) return [lat, lon];
	}
	return [0, -spinOf(s, time)];
}

// ---------- Outils de dessin ----------

export function shade(c: CanvasRenderingContext2D, cx: number, cy: number, R: number) {
	const g = c.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.15, cx, cy, R * 1.02);
	g.addColorStop(0, rgba(C.text, 0.12)); g.addColorStop(0.55, rgba(C.deep, 0)); g.addColorStop(1, rgba(C.deep, 0.88));
	c.fillStyle = g; c.fillRect(cx - R, cy - R, 2 * R, 2 * R);
}
export function baseFill(s: Scene, c: CanvasRenderingContext2D) {
	const { cx, cy, R } = s;
	const g = c.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
	g.addColorStop(0, rgba(s.color)); g.addColorStop(0.55, rgba(mix(s.color, C.bg, 0.5))); g.addColorStop(1, rgba(mix(s.color, C.deep, 0.8)));
	c.fillStyle = g; c.fillRect(cx - R, cy - R, 2 * R, 2 * R);
}
export function poly(s: Scene, pts: Vec3[]) {
	const c = s.ctx;
	c.beginPath();
	pts.forEach(([x, y], k) => (k ? c.lineTo(s.cx + x * s.R, s.cy + y * s.R) : c.moveTo(s.cx + x * s.R, s.cy + y * s.R)));
	c.closePath();
}
/** Polyligne de surface (lat/lon monde), seulement sur la face visible. */
export function surfLine(s: Scene, pts: LatLon[] | Vec3[], spin: number, world = false) {
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
