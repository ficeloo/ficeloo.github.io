// Enseignes au néon de la planète IRL : une forme par signe, propre au projet (champ planet.signs de projects.ts).
// Coordonnées locales de -1 à 1 (y vers le bas) ; chaque signe est une liste de tubes (polylignes).

type Pt = [number, number];
type Shape = Pt[][];
const TAU = Math.PI * 2;

const circ = (cx: number, cy: number, r: number, n = 24, a0 = 0, a1 = TAU): Pt[] =>
	Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];

// Lettres en tubes (cellule 1 × 1) pour les enseignes écrites
const LETTERS: Record<string, Shape> = {
	A: [[[0, 1], [0.5, 0], [1, 1]], [[0.25, 0.55], [0.75, 0.55]]],
	G: [[[1, 0], [0, 0], [0, 1], [1, 1], [1, 0.5], [0.5, 0.5]]],
	I: [[[0.5, 0], [0.5, 1]]],
	L: [[[0, 0], [0, 1], [1, 1]]],
	N: [[[0, 1], [0, 0], [1, 1], [1, 0]]],
	O: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
	R: [[[0, 1], [0, 0], [1, 0], [1, 0.5], [0, 0.5], [1, 1]]],
	' ': [],
};
/** Un mot centré, ramené à la largeur -1..1. */
function word(w: string): Shape {
	const n = w.length, cw = 0.62, gap = 0.3, tot = n * cw + (n - 1) * gap, k = 2 / tot, h = cw * 1.5 * k;
	return w.split('').flatMap((ch, i) => LETTERS[ch].map((pl) => pl.map(([x, y]): Pt => [-1 + (i * (cw + gap) + x * cw) * k, -h / 2 + y * h])));
}

export const SIGNS: Record<string, () => Shape> = {
	// Radio, scène (La Balise)
	mic: () => [[...circ(0, -0.45, 0.32, 12, Math.PI, TAU), [0.32, 0.05], ...circ(0, 0.05, 0.32, 12, 0, Math.PI), [-0.32, -0.45]], circ(0, 0.05, 0.55, 16, 0, Math.PI), [[0, 0.6], [0, 0.95]], [[-0.4, 0.95], [0.4, 0.95]]],
	radio: () => [0.3, 0.6, 0.9].flatMap((r) => [circ(0, 0, r, 10, -0.75, 0.75), circ(0, 0, r, 10, Math.PI - 0.75, Math.PI + 0.75)]).concat([circ(0, 0, 0.08, 6)]),
	onair: () => word('ON AIR'),
	phones: () => [circ(0, 0.1, 0.85, 22, Math.PI, TAU), rect(-0.95, 0.15, -0.55, 0.85), rect(0.55, 0.15, 0.95, 0.85)],
	sine: () => [Array.from({ length: 41 }, (_, i): Pt => { const x = -1 + i / 20; return [x, -0.4 * Math.sin(Math.PI * 2 * x * 0.75)]; })],
	clock: () => [circ(0, 0, 0.9, 30), [[0, 0], [0, -0.6]], [[0, 0], [0.45, 0.2]]],
	// LAN et game jam (GetNextLan)
	joystick: () => [circ(0, -0.55, 0.32, 18), [[0, -0.23], [0, 0.4]], rect(-0.9, 0.4, 0.9, 0.85), circ(-0.5, 0.62, 0.1, 8)],
	rj45: () => [[[-0.6, -0.9], [0.6, -0.9], [0.6, 0.4], [0.3, 0.4], [0.3, 0.7], [-0.3, 0.7], [-0.3, 0.4], [-0.6, 0.4], [-0.6, -0.9]], ...[-0.4, -0.2, 0, 0.2, 0.4].map((x): Pt[] => [[x, -0.9], [x, -0.6]]), [[0, 0.7], [0, 1]]],
	gg: () => word('GG'),
	lan: () => word('LAN'),
	trophy: () => [[[-0.6, -0.8], [0.6, -0.8], [0.5, -0.1], [0.2, 0.15], [-0.2, 0.15], [-0.5, -0.1], [-0.6, -0.8]], circ(-0.62, -0.5, 0.25, 10, Math.PI / 2, 1.5 * Math.PI), circ(0.62, -0.5, 0.25, 10, -Math.PI / 2, Math.PI / 2), [[0, 0.15], [0, 0.6]], rect(-0.4, 0.6, 0.4, 0.85)],
	chrono: () => [circ(0, 0.12, 0.8, 30), [[0, 0.12], [0, -0.4]], [[0, 0.12], [0.35, 0.3]], [[-0.18, -0.95], [0.18, -0.95]], [[0, -0.95], [0, -0.68]], [[0.55, -0.65], [0.72, -0.82]]],
	pad: () => [[[-0.6, -0.4], [0.6, -0.4], [0.95, 0.1], [0.85, 0.55], [0.5, 0.5], [0.3, 0.2], [-0.3, 0.2], [-0.5, 0.5], [-0.85, 0.55], [-0.95, 0.1], [-0.6, -0.4]], [[-0.55, -0.1], [-0.3, -0.1]], [[-0.42, -0.22], [-0.42, 0.02]], circ(0.45, -0.1, 0.07, 6)],
};

/** Enseignes écrites : plus larges que les pictogrammes. */
export const TEXT_SIGNS = new Set(['onair', 'gg', 'lan']);
