// Drone de chantier des projets In progress (sprite A : quadcopter de chantier).
// - Drone libre (Game, Web…) : vol chaotique, arrêt devant la planète, tir, puis il repart.
//   Ce qu'il vise et ce que produit son tir sont propres au système (aim / weld de son fichier).
// - Drone bâtisseur (Graphics) : sa position est calculée par le système, ici il est seulement dessiné.

import { C, TAU, WHITE, cT, fromLatLon, mix, reduce, rgba, sT, spinOf, toScreen, type Drone, type Scene, type Vec3 } from './kit';

/** Sprite : quadcopter de chantier (bandes de signalisation, gyrophare, buse). Centré, ~36 unités de large. */
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

export const newDrone = (): Drone => ({ clock: 0, last: null, phase: 'fly', until: 2, fire: 0, dur: 0.5, target: [0, 0], path: null, panel: null });

// ---------- Drone libre ----------

function dronePos(d: Drone): Vec3 {
	const t = d.clock, a = 0.55 * t + 0.6 * Math.sin(0.37 * t), rad = 1.55 + 0.18 * Math.sin(1.3 * t + 1);
	const x = rad * Math.cos(a), z = rad * Math.sin(a), y = 0.42 * Math.sin(0.8 * t) + 0.22 * Math.sin(2.1 * t + 2);
	return [x * cT - y * sT, x * sT + y * cT, z];
}
export function droneUpdate(s: Scene, time: number) {
	const d = s.drone!, dt = d.last === null ? 0 : Math.min(0.1, time - d.last);
	d.last = time;
	if (reduce) return;
	if (d.phase === 'fly') {
		d.clock += dt; d.until -= dt;
		if (d.until <= 0 && dronePos(d)[2] > 0.2) {
			d.path = null; d.panel = null;
			s.sys.aim?.(s, time);
			d.phase = 'aim'; d.fire = 0.25;
		}
	} else if (d.phase === 'aim') {
		d.fire -= dt;
		if (d.fire <= 0) { d.phase = 'fire'; d.dur = d.fire = s.sys.fireDur ?? 0.5; }
	} else {
		d.fire -= dt;
		if (d.fire <= 0) {
			s.sys.weld?.(s, time);
			d.path = null; d.panel = null;
			d.phase = 'fly'; d.until = 1.6 + s.rnd() * 1.6;
		}
	}
}
export function drawFreeDrone(s: Scene, time: number, front: boolean) {
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

// ---------- Drone bâtisseur ----------

/** Laser tracé dans la passe du drone, la planète masque ce qui passe derrière. */
export function drawBuilder(s: Scene, time: number, front: boolean) {
	const b = s.builder!;
	if (b.pos[2] > 0 !== front) return;
	const [x, y] = toScreen(s, b.pos);
	if (b.firing) { const [tx, ty] = toScreen(s, b.target); drawLaser(s, x, y + droneSize(s) * 0.25, tx, ty, front && b.target[2] > 0); }
	drawDrone(s.ctx, x, y, droneSize(s), time, front, b.firing);
}
