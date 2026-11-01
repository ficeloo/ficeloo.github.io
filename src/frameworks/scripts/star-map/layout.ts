// Disposition de la star map : où sont les systèmes et les projets, en coordonnées « monde »,
// et l'avancement du scroll (U) à chaque projet. Calcul pur (aucun DOM) : il ne dépend que des
// projets et de la taille de l'écran ; le moteur le refait au redimensionnement.
import { clamp, hash } from '../../../domain/math';

export type Pt = { x: number; y: number };
/** Position d'un projet, son système (g) et le centre de ce système. */
export type Node = Pt & { g: number; gx: number; gy: number };
/** Un système : catégorie, numéro, projets (indices), centre, rayon, positions des projets. */
export type Group = { c: string; g: number; mem: number[]; gx: number; gy: number; Rc: number; pos: Pt[] | null };
/** Taille de la vue ; vertical = écran en portrait, la carte se parcourt de haut en bas. */
export type View = { vw: number; vh: number; vertical: boolean };

/** Un saut inter-systèmes vaut LEG pas de scroll (un pas = d'un projet au suivant). */
export const LEG = 2.5;

/** P : projets (indice i, catégorie cat) dans l'ordre des données. Renvoie systèmes (G), projets dans
 *  l'ordre de la carte (ord, W) et l'avancement du scroll à chaque projet (U, en pas). */
export function layoutMap<T extends { i: number; cat: string }>(P: T[], { vw, vh, vertical }: View) {
	const cats = [...new Set(P.map((p) => p.cat))];
	const ord = cats.flatMap((c) => P.filter((p) => p.cat === c).map((p) => p.i));
	// Calcul sur un axe principal (sens du parcours) et un axe transverse ;
	// en vertical on permute les deux à la fin.
	const main = vertical ? vh : vw;
	const cross = vertical ? vw : vh;
	const Dx = clamp(main * 1.15, 1000, 1650);
	const G: Group[] = cats.map((c, g) => {
		const mem = ord.filter((q) => P[q].cat === c);
		return { c, g, mem, gx: g * Dx, gy: (g % 2 ? -1 : 1) * cross * 0.06, Rc: 110 + mem.length * 26, pos: null };
	});
	const W: Node[] = ord.map((pi) => {
		const g0 = G.find((x) => x.c === P[pi].cat)!;
		const n = g0.mem.length;
		const j = g0.mem.indexOf(pi);
		if (!g0.pos) {
			const amp = Math.min(g0.Rc * 0.8, cross * 0.24);
			const wts = Array.from({ length: Math.max(0, n - 1) }, (_, q) => 0.4 + hash(g0.g * 41 + q * 9.3) * 1.2);
			const tot = wts.reduce((a, b) => a + b, 0) || 1;
			let acc = 0;
			let prev: number | null = null;
			g0.pos = Array.from({ length: n }, (_, q) => {
				if (q > 0) acc += wts[q - 1];
				let v = n === 1 ? 0 : hash(g0.g * 19 + q * 5.1 + 2) * 2 - 1;
				if (prev !== null && Math.abs(v - prev) * amp < 64) v = prev > 0 ? prev - 64 / amp - 0.2 : prev + 64 / amp + 0.2;
				v = clamp(v, -1, 1);
				prev = v;
				return { x: g0.gx - g0.Rc * 0.9 + g0.Rc * 1.8 * (n > 1 ? acc / tot : 0.5), y: g0.gy + v * amp };
			});
		}
		return { x: g0.pos[j].x, y: g0.pos[j].y, g: g0.g, gx: g0.gx, gy: g0.gy };
	});
	if (vertical) {
		G.forEach((g0) => ([g0.gx, g0.gy] = [g0.gy, g0.gx]));
		W.forEach((w) => {
			[w.x, w.y] = [w.y, w.x];
			[w.gx, w.gy] = [w.gy, w.gx];
		});
	}
	const U = [0];
	for (let k = 1; k < W.length; k++) U.push(U[k - 1] + (W[k].g === W[k - 1].g ? 1 : LEG));
	return { P, cats, ord, G, W, U, N: ord.length };
}

/** Résultat de layoutMap. */
export type MapLayout<T extends { i: number; cat: string }> = ReturnType<typeof layoutMap<T>>;

/** Point du trajet entre le projet q et le suivant (t de 0 à 1), en coordonnées monde. */
export const legPoint = (W: Pt[], q: number, t: number): Pt => ({ x: W[q].x + (W[q + 1].x - W[q].x) * t, y: W[q].y + (W[q + 1].y - W[q].y) * t });
