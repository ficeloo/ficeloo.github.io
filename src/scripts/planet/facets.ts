// Système Graphics : astre low-poly (facettes éclairées une à une).
// In progress : le drone bâtisseur pose toutes les facettes dans l'ordre (pôle nord → sud), pause,
// effacement progressif dans le même ordre, retour au pôle, et on recommence.

import { C, TAU, fromLatLon, lit, poly, reduce, rgba, scale, sphere, spinOf, view, type LatLon, type PlanetSystem, type Scene, type Vec3 } from './kit';

const F_ROWS = 8, F_COLS = 14;

function facetGrid(rows: number, cols: number, spin: number, each: (i: number, j: number, pts: Vec3[], n: Vec3) => void) {
	for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
		const la0 = -Math.PI / 2 + (i * Math.PI) / rows, la1 = la0 + Math.PI / rows;
		const lo0 = (j * TAU) / cols, lo1 = lo0 + TAU / cols;
		const pts = ([[la0, lo0], [la0, lo1], [la1, lo1], [la1, lo0]] as LatLon[]).map(([a, b]) => fromLatLon(a, b, spin));
		each(i, j, pts, fromLatLon((la0 + la1) / 2, (lo0 + lo1) / 2, spin));
	}
}

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

export const facets: PlanetSystem = {
	spin: 0.05,
	disc: false,
	builder: true,
	init(s) {
		s.jitter = Array.from({ length: F_ROWS * F_COLS }, () => 0.9 + s.rnd() * 0.2);
	},
	draw(s, time) {
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
	},
};
