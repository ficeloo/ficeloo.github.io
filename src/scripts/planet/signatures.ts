// Objets emblématiques des projets, en orbite autour de leur planète (champ planet.signature de projects.ts).
// Chaque objet est dessiné centré, sz ≈ sa demi-taille en px.

import { C, TAU, WHITE, mix, reduce, rgba } from './kit';

export const SIGNATURES: Record<string, (c: CanvasRenderingContext2D, sz: number, t: number) => void> = {
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
