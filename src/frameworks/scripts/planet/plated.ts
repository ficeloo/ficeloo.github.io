// Système Web : plaques métalliques (nuances différentes, quelques rouillées) + anneaux de tirets,
// un anneau par couche du projet (front, back, BDD…), 3 au plus.
// In progress : la moitié des plaques manque ; le drone soudeur les remet une à une.

import { C, TAU, baseFill, fromLatLon, mix, pickFront, poly, reduce, rgba, shade, spinOf, surfLine, toScreen, type LatLon, type Panel, type PlanetSystem, type Scene, type Vec3 } from './kit';

const panelCenter = (p: Panel): LatLon => [(p.a + p.b) / 2, (p.l0 + p.l1) / 2];
function panelOutline(p: Panel, spin: number): Vec3[] {
	const pts: LatLon[] = [];
	for (let t = 0; t <= 4; t++) pts.push([p.a, p.l0 + ((p.l1 - p.l0) * t) / 4]);
	for (let t = 0; t <= 3; t++) pts.push([p.a + ((p.b - p.a) * t) / 3, p.l1]);
	for (let t = 4; t >= 0; t--) pts.push([p.b, p.l0 + ((p.l1 - p.l0) * t) / 4]);
	for (let t = 3; t >= 0; t--) pts.push([p.a + ((p.b - p.a) * t) / 3, p.l0]);
	return pts.map(([a, b]) => fromLatLon(a, b, spin));
}

/** Anneaux de tirets, en deux moitiés (derrière / devant la planète). */
export function drawRings(s: Scene, time: number, front: boolean) {
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
		c.strokeStyle = rgba(s.ringColor, front ? 0.85 : 0.25); c.lineWidth = 2.2; c.stroke();
		c.setLineDash([]);
	});
}

export const plated: PlanetSystem = {
	spin: 0.05,
	disc: true,
	init(s, data) {
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
		s.rings = Array.from({ length: Math.min(3, Number(data.rings) || 1) }, (_, i) => ({
			roll: [-0.6, 0.45, 1.35][i] + (r() - 0.5) * 0.15,
			flat: [0.32, 0.42, 0.26][i],
			k: 1.16 + i * 0.05,
			dir: i % 2 ? -1 : 1,
			speed: 10 + r() * 8,
		}));
	},
	draw(s, time) {
		const c = s.ctx, spin = spinOf(s, time);
		const visible = (p: Panel) => fromLatLon(...panelCenter(p), spin)[2] > 0;
		// Chantier : les plaques manquantes sont de vrais trous. On dessine d'abord l'intérieur de la
		// coque (plaques de la face arrière, vues de l'intérieur ; ses propres trous laissent voir le fond),
		// puis la surface autour des trous seulement (découpe evenodd), comme le filaire de Graphics.
		const holes = s.wip ? s.panels!.filter((p) => p.hole && visible(p)).map((p) => panelOutline(p, spin)) : [];
		if (holes.length) {
			s.panels!.forEach((p) => {
				if (visible(p)) return;
				poly(s, panelOutline(p, spin));
				if (!p.hole) { c.fillStyle = rgba(C.deep, 0.55); c.fill(); }
				c.strokeStyle = rgba(C.secondary, 0.22); c.lineWidth = 0.7; c.stroke();
			});
			c.save();
			c.beginPath();
			c.rect(s.cx - s.R - 2, s.cy - s.R - 2, 2 * s.R + 4, 2 * s.R + 4);
			holes.forEach((q) => q.forEach(([x, y], k) => (k ? c.lineTo(s.cx + x * s.R, s.cy + y * s.R) : c.moveTo(s.cx + x * s.R, s.cy + y * s.R))));
			c.clip('evenodd');
		}
		baseFill(s, c);
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
		if (!holes.length) return;
		c.restore();
		// Bord de chaque trou + échafaudage en croix
		holes.forEach((q) => {
			poly(s, q);
			c.strokeStyle = rgba(C.secondary, 0.7); c.lineWidth = 0.7; c.stroke();
			const [ax, ay] = toScreen(s, q[0]), [bx, by] = toScreen(s, q[9]), [dx, dy] = toScreen(s, q[4]), [ex, ey] = toScreen(s, q[13]);
			c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.moveTo(dx, dy); c.lineTo(ex, ey); c.stroke();
		});
	},
	// Le drone vise une plaque manquante visible…
	aim(s, time) {
		const d = s.drone!, spin = spinOf(s, time);
		const holes = s.panels!.filter((p) => p.hole && fromLatLon(...panelCenter(p), spin)[2] > 0.3);
		const panel = holes.length ? holes[Math.floor(s.rnd() * holes.length)] : null;
		d.item = panel;
		d.target = panel ? panelCenter(panel) : pickFront(s, time);
	},
	// … la soude ; une plaque cachée se détache pour que le chantier reste ouvert
	weld(s, time) {
		const panel = s.drone!.item as Panel | null, spin = spinOf(s, time);
		if (!panel) return;
		panel.hole = false;
		const hidden = s.panels!.filter((p) => !p.hole && fromLatLon(...panelCenter(p), spin)[2] < -0.2);
		if (hidden.length) hidden[Math.floor(s.rnd() * hidden.length)].hole = true;
	},
};
