// Système IRL (événements : scène, LAN, game jam…) : une planète de nuit couverte d'enseignes au néon
// propres au projet (neon-signs.ts), qui éclairent le sol autour d'elles et bégaient de temps en temps.
// Petites rues autour de chaque enseigne, où roulent des voitures (phares blancs à l'aller, feux
// rouges au retour), et lumières isolées entre elles.
// In progress : la moitié des tubes est éteinte, et les rues d'une enseigne éteinte n'ont pas de
// voitures. Le drone retrace une enseigne au laser, elle s'allume en grésillant ; pour que le
// chantier continue, une enseigne de la face cachée s'éteint.

import { C, TAU, WHITE, baseFill, fromLatLon, mix, pickFront, reduce, rgba, shade, sphere, spinOf, surfLine, token, view, type LatLon, type NeonSign, type PlanetSystem, type RGB, type Vec3 } from './kit';
import { SIGNS, TEXT_SIGNS } from './neon-signs';

const IRL = token('--system-irl');
const TUBES = [token('--neon-cyan'), token('--neon-pink')];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const norm = (v: Vec3): Vec3 => { const l = Math.hypot(...v); return v.map((x) => x / l) as Vec3; };
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Repère tangent en un point de la sphère (pour poser une forme plane sur la surface). */
function tangent(c: Vec3): [Vec3, Vec3] { const u = norm(cross(Math.abs(c[1]) > 0.98 ? [1, 0, 0] : [0, 1, 0], c)); return [u, cross(c, u)]; }
const onSurface = (c: Vec3, U: Vec3, V: Vec3, x: number, y: number) => norm([0, 1, 2].map((k) => c[k] + x * U[k] + y * V[k]) as Vec3);
/** Bruit stable (bégaiement des néons). */
const hash = (a: number, b: number) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
/** Position le long d'une polyligne de la sphère, u de 0 à 1. */
function along(path: Vec3[], u: number): Vec3 {
	const n = path.length - 1, x = clamp(u, 0, 1) * n, i = Math.min(n - 1, Math.floor(x)), f = x - i;
	return norm(path[i].map((v, k) => v + (path[i + 1][k] - v) * f) as Vec3);
}
/** La partie déjà tracée d'une enseigne : le laser avance le long de ses tubes. */
function partial(paths: Vec3[][], u: number): Vec3[][] {
	let left = u * paths.reduce((n, p) => n + p.length - 1, 0);
	const out: Vec3[][] = [];
	for (const p of paths) {
		if (left <= 0) break;
		const segs = p.length - 1;
		if (left >= segs) out.push(p);
		else out.push([...p.slice(0, Math.floor(left) + 1), along(p, left / segs)]);
		left -= segs;
	}
	return out;
}
/** Tracé d'une enseigne en latitude / longitude, pour le laser du drone (longitudes sans saut de 2π). */
function toLatLon(pts: Vec3[]): LatLon[] {
	let prev = 0;
	return pts.map(([x, y, z], i) => {
		let lon = Math.atan2(x, z);
		if (i) lon += Math.round((prev - lon) / TAU) * TAU;
		prev = lon;
		return [Math.asin(clamp(y, -1, 1)), lon];
	});
}

export const neon: PlanetSystem = {
	spin: 0.05,
	disc: true,
	fireDur: 1.1,
	init(s, data) {
		const r = s.rnd;
		const keys = (data.signs ?? '').split(',').filter((k) => k in SIGNS);
		if (!keys.length) keys.push('sine');
		for (let i = keys.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [keys[i], keys[j]] = [keys[j], keys[i]]; }
		const cols: RGB[] = [mix(IRL, WHITE, 0.15), mix(s.color, WHITE, 0.55), ...TUBES];
		// Enseignes réparties régulièrement (spirale de Fibonacci), chaque signe deux fois au moins
		const n = Math.min(14, Math.max(8, keys.length * 2));
		const signs: NeonSign[] = Array.from({ length: n }, (_, i) => {
			const y = 1 - ((i + 0.5) / n) * 2, rr = Math.sqrt(1 - y * y), a = i * 2.39996 + r() * 0.3;
			const c = norm([Math.cos(a) * rr, y * 0.82, Math.sin(a) * rr]);
			const key = keys[i % keys.length];
			const [U, V] = tangent(c), size = (TEXT_SIGNS.has(key) ? 0.27 : 0.17) + r() * 0.03, rot = (r() - 0.5) * 0.5;
			const cr = Math.cos(rot), sr = Math.sin(rot);
			const paths = SIGNS[key]().map((pl) => pl.map(([x, yy]) => onSurface(c, U, V, (x * cr - yy * sr) * size, -(x * sr + yy * cr) * size)));
			return { c, paths, size, col: cols[i % cols.length], ph: r() * 50, on: !s.wip || r() < 0.5, ignite: -9 };
		});
		// Petites rues : une grille de 3 × 3 rues autour de chaque enseigne
		const streets = signs.flatMap((g, sign) => {
			const [U, V] = tangent(g.c), half = (0.2 + r() * 0.12) * 1.3;
			return [-0.66, 0, 0.66].flatMap((o) => [[[-1, o], [1, o]], [[o, -1], [o, 1]]].map(([[x0, y0], [x1, y1]]) => ({
				sign,
				pts: Array.from({ length: 6 }, (_, k) => { const f = k / 5; return onSurface(g.c, U, V, (x0 + (x1 - x0) * f) * half, (y0 + (y1 - y0) * f) * half); }),
			})));
		});
		s.neon = {
			signs, streets,
			cars: streets.map((_, street) => ({ street, ph: r(), v: 0.12 + r() * 0.12, dir: r() < 0.5 ? -1 : 1 })),
			lights: Array.from({ length: 70 }, () => ({ p: sphere(Math.asin(r() * 1.9 - 0.95), r() * TAU), ph: r() * TAU })),
			maria: Array.from({ length: 6 }, () => ({ lat: (r() - 0.5) * 2.2, lon: r() * TAU, size: 0.18 + r() * 0.22 })),
		};
	},
	draw(s, t) {
		const c = s.ctx, city = s.neon!, spin = spinOf(s, t), k = s.R / 150, dark = mix(s.color, C.deep, 0.62);
		// Sol de nuit
		baseFill(s, c, dark);
		city.maria.forEach((m) => {
			const [x, y, z] = fromLatLon(m.lat, m.lon, spin);
			if (z < 0.06) return;
			const rr = m.size * s.R;
			c.beginPath(); c.ellipse(s.cx + x * s.R, s.cy + y * s.R, rr * z, rr, Math.atan2(y, x), 0, TAU);
			c.fillStyle = rgba(mix(dark, C.deep, 0.6), 0.4); c.fill();
		});
		shade(c, s.cx, s.cy, s.R);
		// Courant de chaque enseigne (ses rues s'éteignent avec elle)
		const power = city.signs.map((g) => (g.on ? clamp((t - g.ignite) / 1.6, 0, 1) : 0));
		// Petites rues
		c.strokeStyle = rgba(IRL, 0.1); c.lineWidth = 0.7;
		city.streets.forEach((st) => surfLine(s, st.pts, spin, true));
		// Lumières isolées
		const warm = mix(IRL, WHITE, 0.35), z0 = Math.max(1.3, 1.9 * k * 0.7);
		city.lights.forEach((w) => {
			const v = view(...w.p, spin);
			if (v[2] < 0.05) return;
			c.fillStyle = rgba(warm, Math.min(1, (0.42 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.5 + w.ph))) * v[2] * 0.5));
			c.fillRect(s.cx + v[0] * s.R - z0 / 2, s.cy + v[1] * s.R - z0 / 2, z0, z0);
		});
		// Voitures : phares blancs à l'aller, feux rouges au retour ; elles apparaissent et disparaissent au bout de la rue
		c.globalCompositeOperation = 'lighter';
		const zc = Math.max(1.2, 1.5 * k);
		city.cars.forEach((car) => {
			const st = city.streets[car.street], pw = power[st.sign];
			if (!pw) return;
			const u = reduce ? car.ph : (((t * car.v * car.dir + car.ph) % 1) + 1) % 1, v = view(...along(st.pts, u), spin);
			if (v[2] < 0.05) return;
			const a = v[2] * pw * Math.sin(Math.PI * u);
			c.fillStyle = car.dir > 0 ? rgba(WHITE, 0.85 * a) : rgba(C.accent, 0.8 * a);
			c.fillRect(s.cx + v[0] * s.R - zc / 2, s.cy + v[1] * s.R - zc / 2, zc, zc);
		});
		c.globalCompositeOperation = 'source-over';
		// Enseignes
		c.lineCap = 'round'; c.lineJoin = 'round';
		const d = s.drone;
		city.signs.forEach((g) => {
			const tracing = d?.phase === 'fire' && d.item === g;
			const v = view(...g.c, spin);
			if (v[2] < -0.1) return;
			const vis = clamp(v[2] * 2.5, 0, 1);
			if (!g.on && !tracing) { // tube éteint : verre gris
				c.lineWidth = 1.3; c.strokeStyle = rgba(C.muted, 0.32 * vis);
				g.paths.forEach((p) => surfLine(s, p, spin, true));
				return;
			}
			let a = 1;
			if (!reduce) {
				if (hash(Math.floor(t * 1.4 + g.ph), g.ph) < 0.07) a = Math.sin(t * 70) > 0 ? 1 : 0.12; // bégaiement
				const ig = t - g.ignite;
				if (ig < 0.9) a = hash(Math.floor(ig * 22), g.ph) < 0.45 + ig * 0.6 ? 1 : 0.1; // allumage qui grésille
			}
			a *= vis;
			c.globalCompositeOperation = 'lighter';
			// Lumière portée sur le sol
			const sx = s.cx + v[0] * s.R, sy = s.cy + v[1] * s.R, rr = g.size * s.R * 2.2;
			const gl = c.createRadialGradient(sx, sy, 0, sx, sy, rr);
			gl.addColorStop(0, rgba(g.col, 0.2 * a)); gl.addColorStop(1, rgba(g.col, 0));
			c.fillStyle = gl; c.fillRect(sx - rr, sy - rr, 2 * rr, 2 * rr);
			// Tube : halo large, halo serré, cœur presque blanc
			const paths = tracing ? partial(g.paths, 1 - d!.fire / d!.dur) : g.paths;
			([[s.R * 0.075, 0.1], [s.R * 0.032, 0.35], [Math.max(1.4, s.R * 0.012), 1]] as const).forEach(([w, al], q) => {
				c.lineWidth = w; c.strokeStyle = rgba(q === 2 ? mix(g.col, WHITE, 0.55) : g.col, al * a);
				paths.forEach((p) => surfLine(s, p, spin, true));
			});
			c.globalCompositeOperation = 'source-over';
		});
		c.lineCap = 'butt'; c.lineJoin = 'miter';
	},
	// Le drone vise une enseigne éteinte bien visible et suit ses tubes au laser…
	aim(s, time) {
		const d = s.drone!, spin = spinOf(s, time);
		const off = s.neon!.signs.filter((g) => !g.on && view(...g.c, spin)[2] > 0.4);
		if (!off.length) { d.target = pickFront(s, time); return; }
		const g = off[Math.floor(s.rnd() * off.length)];
		d.item = g;
		d.path = toLatLon(g.paths.flat());
		d.target = d.path[0];
	},
	// … elle s'allume ; une enseigne de la face cachée s'éteint pour que le chantier continue
	weld(s, time) {
		const g = s.drone!.item as NeonSign | null, spin = spinOf(s, time);
		if (!g) return;
		g.on = true; g.ignite = time;
		const hidden = s.neon!.signs.filter((x) => x.on && x !== g && view(...x.c, spin)[2] < -0.2);
		if (hidden.length) hidden[Math.floor(s.rnd() * hidden.length)].on = false;
	},
};

