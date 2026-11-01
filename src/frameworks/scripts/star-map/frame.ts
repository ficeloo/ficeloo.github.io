// Une image de la star map : à partir de l'avancement du scroll, où en est le parcours (projet
// atteint, saut en cours), où est la caméra et comment le monde est projeté à l'écran.
// Calcul pur, sans DOM : render.ts et hud.ts dessinent ensuite à partir de cette image.
import { clamp, lerp } from '../../../domain/math';
import { legPoint, type Pt, type View } from './layout';
import type { Metrics } from './state';

export type Frame = {
	m: Metrics;
	u: number; // avancement dans la carte, en pas
	p: number; // passage Hero → carte (0 → 1)
	ease: number; // p adouci
	j: number; // dernier projet atteint (ordre de la carte)
	f: number; // avancement vers le suivant (0 → 1)
	leg: boolean; // en plein saut hyperspace (le suivant est dans un autre système)
	cam: Pt; // caméra (coordonnées monde)
	wave: number; // 0 → 1 → 0 pendant un saut
	z: number; // zoom de la caméra (elle recule pendant un saut)
	ox: number; // point de l'écran où se trouve la caméra
	oy: number;
	navW: number; // largeur réservée à la nav des systèmes, à droite
	S: (q: Pt) => Pt; // monde → écran
	curG: number; // système du projet le plus proche (stable au retour)
	rot: number; // direction du saut (degrés)
	fArr: number; // avancement du saut dans le sens du voyage (f en avant, 1-f en arrière)
	arrOp: number; // opacité de la carte d'arrivée dans un système
	dim: number; // atténuation de la carte pendant cette arrivée
};

/** dir : sens du parcours (1 en avant, -1 en arrière), il décide du système d'arrivée d'un saut. */
export function computeFrame(m: Metrics, { vw, vh, vertical }: View, dir: number): Frame {
	const { W, U, N } = m;
	const u = m.u;
	const p = m.p;
	const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

	let j = 0;
	while (j < N - 1 && U[j + 1] <= u) j++;
	const last = j >= N - 1;
	const f = last ? 0 : (u - U[j]) / (U[j + 1] - U[j]);
	const leg = !last && W[j + 1].g !== W[j].g;
	// Caméra : suit le nœud dans le sens du parcours, le centre du système en travers.
	const camF = (q: number): Pt =>
		vertical
			? { x: W[q].x * 0.45 + W[q].gx * 0.55, y: W[q].y * 0.7 + W[q].gy * 0.3 }
			: { x: W[q].x * 0.7 + W[q].gx * 0.3, y: W[q].y * 0.45 + W[q].gy * 0.55 };
	let cam: Pt;
	if (last) cam = camF(N - 1);
	else if (!leg) {
		const a = camF(j);
		const b = camF(j + 1);
		cam = { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) };
	} else {
		const q = legPoint(W, j, f);
		const a = camF(j);
		const b = camF(j + 1);
		cam = { x: q.x + (1 - f) * (a.x - W[j].x) + f * (b.x - W[j + 1].x), y: q.y + (1 - f) * (a.y - W[j].y) + f * (b.y - W[j + 1].y) };
	}
	const wave = leg ? Math.sin(Math.PI * f) : 0;
	const z = 1 - wave * 0.5;
	const hudW = Math.min(300, vw * 0.3);
	// Vertical : carte un peu à gauche (labels à droite des nœuds), un peu plus haut
	// (bandeau HUD en bas), pas de nav systèmes.
	const ox = vertical ? vw * 0.36 : vw >= 1200 ? vw / 2 + hudW * 0.3 - 60 : vw / 2;
	const navW = vertical ? 0 : vw >= 1200 ? 280 : 120;
	const oy = vh * (vertical ? 0.42 : 0.45) + (1 - ease) * vh * 0.9;
	const S = (q: Pt): Pt => ({ x: ox + (q.x - cam.x) * z, y: oy + (q.y - cam.y) * z });

	const curG = W[m.kN].g;
	const rot = leg ? (Math.atan2(W[j + 1].y - W[j].y, W[j + 1].x - W[j].x) * 180) / Math.PI : 0;
	const fArr = dir >= 0 ? f : 1 - f;
	// Carte système en plateau : apparaît tôt (dès 5% du saut), pleine opacité
	// de 20% à 78%, puis fond — laisse le temps de lire le nom du système.
	const arrOp = leg ? Math.min(clamp((fArr - 0.05) / 0.15, 0, 1), clamp((0.88 - fArr) / 0.1, 0, 1)) : 0;
	const dim = 1 - arrOp * 0.9;
	return { m, u, p, ease, j, f, leg, cam, wave, z, ox, oy, navW, S, curG, rot, fArr, arrOp, dim };
}
