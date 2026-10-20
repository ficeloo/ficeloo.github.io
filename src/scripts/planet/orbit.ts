// Ce qui tourne autour de la planète : orbites des satellites (la stack), ceinture d'astéroïdes,
// objet emblématique du projet. Chaque élément est dessiné en deux moitiés (derrière / devant la planète).

import { C, TAU, WHITE, mix, proj, rgba, type Scene } from './kit';
import { SIGNATURES } from './signatures';

export function orbitEllipse(s: Scene, r: number, front: boolean) {
	const c = s.ctx;
	c.beginPath();
	const from = front ? 0 : Math.PI;
	for (let a = from; a <= from + Math.PI + 0.01; a += 0.04) {
		const [x, y] = proj(s, r, a);
		a === from ? c.moveTo(x, y) : c.lineTo(x, y);
	}
	c.stroke();
}

export function drawBelt(s: Scene, time: number, front: boolean) {
	const c = s.ctx, col = mix(s.color, WHITE, 0.25);
	s.belt!.forEach((b) => {
		const [x, y, d] = proj(s, b.r, b.a0 + time * 0.33 * Math.pow(b.r / 0.52, -1.5));
		if (d > 0 !== front) return;
		c.fillStyle = rgba(col, front ? 0.85 : 0.35);
		c.fillRect(x - b.size / 2, y - b.size / 2, b.size, b.size);
	});
}

export function drawSignature(s: Scene, time: number, front: boolean) {
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
	draw(c, Math.max(6, s.R * 0.13) * (front ? 1 : 0.8), time, s.color);
	c.restore();
}
