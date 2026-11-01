// Atmosphère de la planète, de la couleur de son système : halo autour, bord teinté, liseré.

import { TAU, rgba, type Scene } from './kit';

/** Halo brumeux dessiné une fois par taille dans un canvas hors écran, puis simplement recopié
 *  à chaque image. Il s'arrête à 1,4 R : au-delà, il serait coupé par le haut du canvas
 *  (centre à 44 % de la hauteur, R = 30 % du plus petit côté). */
export const HALO = 1.4;
export function buildHalo(s: Scene, dpr: number) {
	const ext = s.R * HALO;
	const cv = s.halo ?? document.createElement('canvas');
	cv.width = cv.height = Math.max(1, Math.ceil(ext * 2 * dpr));
	const c = cv.getContext('2d')!;
	c.setTransform(dpr, 0, 0, dpr, 0, 0);
	let g = c.createRadialGradient(ext, ext, s.R * 0.9, ext, ext, s.R * HALO);
	g.addColorStop(0, rgba(s.atmo, 0.2)); g.addColorStop(0.3, rgba(s.atmo, 0.08)); g.addColorStop(1, rgba(s.atmo, 0));
	c.fillStyle = g; c.fillRect(0, 0, ext * 2, ext * 2);
	// voile plus large, décalé vers la lumière (haut gauche)
	const lx = ext - s.R * 0.15, ly = ext - s.R * 0.15;
	g = c.createRadialGradient(lx, ly, 0, lx, ly, s.R * (HALO - 0.22));
	g.addColorStop(0, rgba(s.atmo, 0.07)); g.addColorStop(1, rgba(s.atmo, 0));
	c.fillStyle = g; c.fillRect(0, 0, ext * 2, ext * 2);
	s.halo = cv;
}

export function rim(s: Scene) {
	const c = s.ctx;
	c.beginPath(); c.arc(s.cx, s.cy, s.R + 1, 0, TAU);
	c.strokeStyle = rgba(s.atmo, s.wip ? 0.55 : 0.4); c.lineWidth = 1.5; c.stroke(); // en construction : liseré neutre d'origine
}

/** Bord du disque teinté par l'atmosphère (lumière diffusée par l'air, par-dessus la surface). */
export function atmoEdge(s: Scene) {
	const c = s.ctx;
	const g = c.createRadialGradient(s.cx, s.cy, s.R * 0.72, s.cx, s.cy, s.R);
	g.addColorStop(0, rgba(s.atmo, 0)); g.addColorStop(1, rgba(s.atmo, 0.14));
	c.fillStyle = g; c.beginPath(); c.arc(s.cx, s.cy, s.R, 0, TAU); c.fill();
}
