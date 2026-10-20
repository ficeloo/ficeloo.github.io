// Système Game : astre rocheux (mers sombres, cratères).
// In progress : protoplanète, la croûte n'a pas fini de refroidir ; le drone trace au laser
// des fissures de lave qui pulsent.

import { C, TAU, WHITE, baseFill, fromLatLon, mix, pickFront, reduce, rgba, shade, spinOf, surfLine, type LatLon, type PlanetSystem, type Scene } from './kit';

function randomPath(r: () => number, lat: number, lon: number, n: number, dLat: number, dLon: number, turn: number): LatLon[] {
	let h = r() * TAU;
	return Array.from({ length: n }, () => {
		const pt: LatLon = [lat, lon];
		h += (r() - 0.5) * turn; lat += Math.sin(h) * dLat; lon += Math.cos(h) * dLon;
		return pt;
	});
}

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

export const rocky: PlanetSystem = {
	spin: 0.06,
	disc: true,
	fireDur: 0.75,
	init(s) {
		const r = s.rnd;
		s.craters = Array.from({ length: 30 }, () => ({ lat: (r() - 0.5) * 2.6, lon: r() * TAU, size: 0.05 + r() ** 2 * 0.16 }));
		s.maria = Array.from({ length: 5 }, () => ({ lat: (r() - 0.5) * 2, lon: r() * TAU, size: 0.3 + r() * 0.25 }));
		if (s.wip) s.cracks = Array.from({ length: 6 }, () => ({ t: -1e9, pts: randomPath(r, (r() - 0.5) * 2.4, r() * TAU, 9, 0.13, 0.17, 1.2) }));
	},
	draw(s, time) {
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
	},
	// Le drone part d'un point visible et balaie un tracé courbe…
	aim(s, time) {
		const d = s.drone!;
		d.target = pickFront(s, time);
		d.path = randomPath(s.rnd, d.target[0], d.target[1], 12, 0.07, 0.09, 0.9);
	},
	// … qui devient une fissure ; les plus anciennes se referment
	weld(s, time) {
		const d = s.drone!;
		if (!d.path) return;
		s.cracks!.push({ t: time, pts: d.path });
		s.cracks = s.cracks!.slice(-12);
	},
};
