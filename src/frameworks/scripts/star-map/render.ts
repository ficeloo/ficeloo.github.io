// Rendu de la star map : à chaque image, place chemins, étoiles, systèmes, nœuds, poussière et
// éléments du saut hyperspace à partir de l'image calculée (frame.ts) ; au redimensionnement, refait
// ce qui ne dépend que de la taille d'écran (relayout). Le chrome (HUD…) est dans hud.ts.
import { clamp, hash } from '../../../domain/math';
import { f1, pad } from '../../../domain/format';
import { systemColor, systemRgb } from '../../../adapters/system-colors';
import { attr, css, txt } from './dom-writes';
import { ACCENT, TEXT, TEXT_DIM, mixRgb } from './colors';
import { computeFrame, type Frame } from './frame';
import { legPoint, type Pt } from './layout';
import { metrics, type MapState } from './state';
import type { MapEls } from './dom';
import type { createStarfield } from './starfield';
import type { createNebulas } from './nebulas';
import type { createHud } from './hud';
import type { Text } from './types';

type Deps = {
	st: MapState;
	els: MapEls;
	stars: ReturnType<typeof createStarfield>;
	nebulas: ReturnType<typeof createNebulas>;
	hud: ReturnType<typeof createHud>;
	starsLayer: HTMLElement;
	text: Text;
	white: number[]; // blanc et teintes pastel des systèmes, en nombres (traînées des sauts)
	pastels: Map<string, number[]>;
};

export function createRenderer({ st, els, stars, nebulas, hud, starsLayer, text, white, pastels }: Deps) {
	const { svg, pathsG, sysPath, legPath, sysTPath, legTPath, groupEls, nodeEls, dustEls, labelEm } = els;
	const { probeEl, pulseEl, arrivalEl, arrTitle, arrNum, arrName, arrCount } = els;
	const sysName = (c: string) => text.system.replace('{name}', c);
	const nodePos: Pt[] = []; // position écran des nœuds au dernier rendu (ordre de la carte)
	// Tracé SVG d'une suite de points ; point du trajet entre le projet q et le suivant.
	const D = (arr: Pt[]) => (arr.length ? 'M' + arr.map((s) => f1(s.x) + ' ' + f1(s.y)).join(' L') + ' ' : '');
	const lp = (q: number, t: number) => legPoint(st.L.W, q, t);
	const at = (x: number, y: number) => `translate(${f1(x)}px,${f1(y)}px)`;

	/** Taille d'écran changée (après layoutStage) : chemins de base, poussière, noms des systèmes. */
	function relayout() {
		const { W, G, N } = st.L;
		stars.place(st.vertical);

		// Chemins de base (statiques en coordonnées monde).
		let sysD = '';
		let legD = '';
		st.legPts = [];
		for (let q = 0; q < N - 1; q++) {
			if (W[q + 1].g !== W[q].g) {
				st.legPts[q] = Array.from({ length: 49 }, (_, s) => lp(q, s / 48));
				legD += D(st.legPts[q]!);
			} else {
				st.legPts[q] = null;
				sysD += D([W[q], W[q + 1]]);
			}
		}
		sysPath.setAttribute('d', sysD);
		legPath.setAttribute('d', legD);
		attr(svg, 'width', String(st.vw));
		attr(svg, 'height', String(st.vh));

		// Poussière : position monde autour de son système.
		dustEls.forEach((du) => {
			const g0 = G[du.g];
			const a = hash(g0.g * 97 + du.d * 3.1) * Math.PI * 2;
			const rr = Math.sqrt(hash(g0.g * 53 + du.d * 5.7)) * g0.Rc * 1.15;
			du.wx = g0.gx + Math.cos(a) * rr * (st.vertical ? 0.8 : 1.1);
			du.wy = g0.gy + Math.sin(a) * rr * (st.vertical ? 1.1 : 0.8);
		});

		G.forEach((g0, gi) => txt(groupEls[gi].label, pad(g0.g + 1) + ' · ' + sysName(g0.c)));
	}

	function render() {
		const m = metrics(st);
		// Sens du parcours (pour l'affichage des sauts entre systèmes).
		if (m.u > st.lastU) st.dir = 1;
		else if (m.u < st.lastU) st.dir = -1;
		st.lastU = m.u;
		const fr = computeFrame(m, st, st.dir);
		hud.heroTransition(fr);
		renderPaths(fr);
		stars.render(st, fr.cam, fr.wave, fr.rot);
		renderWarp(fr);
		renderSystems(fr);
		renderNodes(fr);
		renderDust(fr);
		renderHyperspace(fr);
		hud.render(fr);
	}

	/** Chemins : la base est statique (relayout), seul le <g> suit la caméra ; portions parcourues en orange. */
	function renderPaths({ m, u, cam, z, ox, oy }: Frame) {
		const { W, U, N } = m;
		// S(q) = (ox - cam·z, oy - cam·z) + q·z  →  translate + scale.
		attr(pathsG, 'transform', `translate(${f1(ox - cam.x * z)} ${f1(oy - cam.y * z)}) scale(${z.toFixed(3)})`);
		// U croissant : on s'arrête au premier projet non atteint.
		let sysT = '';
		let legT = '';
		for (let q = 0; q < N - 1 && u > U[q]; q++) {
			const ff = clamp((u - U[q]) / (U[q + 1] - U[q]), 0, 1);
			const pts = st.legPts[q];
			if (pts) legT += D(pts.slice(0, Math.max(1, Math.round(ff * 48)) + 1));
			else sysT += D([W[q], lp(q, ff)]);
		}
		attr(sysTPath, 'd', sysT);
		attr(legTPath, 'd', legT);
	}

	/** Pendant un saut, les traînées prennent la teinte du système quitté, passent au blanc,
	 *  puis prennent celle du système d'arrivée (dans le sens du trajet). Une seule variable
	 *  sur le calque, arrondie au 20e pour ne réécrire que quand la teinte change vraiment. */
	function renderWarp({ m, j, leg, fArr }: Frame) {
		const { G, W } = m;
		let warp = '';
		if (leg) {
			const from = G[st.dir >= 0 ? W[j].g : W[j + 1].g];
			const to = G[st.dir >= 0 ? W[j + 1].g : W[j].g];
			const kFrom = Math.min(clamp(fArr / 0.1, 0, 1), clamp((0.4 - fArr) / 0.3, 0, 1));
			const kTo = Math.min(clamp((fArr - 0.6) / 0.3, 0, 1), clamp((1 - fArr) / 0.1, 0, 1));
			const k = Math.round(Math.max(kFrom, kTo) * 20) / 20;
			if (k > 0) warp = mixRgb(white, pastels.get(kFrom > kTo ? from.c : to.c)!, k);
		}
		css(starsLayer!, '--warp', warp);
	}

	/** Systèmes : anneau, nébuleuse et nom. */
	function renderSystems({ m, S, z, curG, dim }: Frame) {
		m.G.forEach((g0, gi) => {
			const s = S({ x: g0.gx, y: g0.gy });
			const R = (g0.Rc + 46) * z;
			const { ring, label } = groupEls[gi];
			// Taille : ne change que pendant un saut (z) ; position : transform.
			css(ring, 'width', f1(R * 2) + 'px');
			css(ring, 'height', f1(R * 2) + 'px');
			css(ring, 'transform', at(s.x - R, s.y - R));
			nebulas.render(gi, s, R, st.zoomOn, st);
			// Vertical : toujours au-dessus de l'anneau (dessous = chemin vers le suivant).
			// En vertical, seul le système courant reste calé sous la barre du haut
			// (sinon les labels de deux systèmes se superposent).
			const ly = st.vertical
				? g0.g === curG ? Math.max(110, s.y - R - 28) : s.y - R - 28
				: g0.g % 2 ? Math.max(110, s.y - R - 28) : s.y + R + 12;
			css(label, 'transform', at(s.x, ly) + ' translateX(-50%)');
			css(label, 'color', g0.g === curG ? systemColor(g0.c) : `rgba(${systemRgb(g0.c)}, 0.55)`);
			css(label, 'opacity', dim.toFixed(3));
		});
	}

	/** Nœuds des projets et leurs étiquettes (hors écran : masqués, on n'écrit rien d'autre). */
	function renderNodes({ m, u, S, navW, dim }: Frame) {
		const { ord, W, U } = m;
		ord.forEach((_, q) => {
			const s = S(W[q]);
			nodePos[q] = s;
			const { dot, label } = nodeEls[q];
			const on = s.x > -240 && s.x < st.vw + 240 && s.y > -120 && s.y < st.vh + 120;
			css(dot, 'display', on ? 'block' : 'none');
			css(label, 'display', on ? 'block' : 'none');
			if (!on) return;
			const act = Math.max(0, 1 - Math.abs(u - U[q]) * 1.4);
			const hi = act > 0.5;
			const w = 8 + 8 * act; // diamètre : 16px de base (CSS) mis à l'échelle
			const op = clamp(1.25 - Math.hypot(s.x - st.vw / 2, s.y - st.vh / 2) / (Math.max(st.vw, st.vh) * 0.6), 0.15, 1) * dim;
			css(dot, 'transform', `${at(s.x, s.y)} translate(-50%,-50%) scale(${(w / 16).toFixed(3)})`);
			css(dot, 'background', hi ? ACCENT : TEXT);
			css(dot, 'box-shadow', hi ? '0 0 0 6px rgba(var(--rgb-accent), 0.18), 0 0 24px rgba(var(--rgb-accent), 0.5)' : 'none');
			css(dot, 'opacity', op.toFixed(3));
			css(dot, 'z-index', hi ? '5' : '2');
			// Côté de l'étiquette : celui du nœud dans son système, sauf si elle n'y tient pas ;
			// si elle ne tient d'aucun côté (titre long sur téléphone), deux lignes du côté le plus large.
			const lw = labelEm[q] * (hi ? 15 : 12), gap = 16 + 6 * act;
			const roomR = st.vw - navW - 16 - (s.x + gap), roomL = s.x - gap - 16;
			const wrap = lw > roomR && lw > roomL;
			const flip = wrap ? roomL > roomR : W[q].x < W[q].gx - 1 ? lw <= roomL || lw > roomR : lw > roomR;
			const lx = flip ? s.x - gap : s.x + gap;
			css(label, 'transform', at(lx, s.y - 9) + (flip ? ' translateX(-100%)' : ''));
			css(label, 'white-space', wrap ? 'normal' : 'nowrap');
			css(label, 'max-width', wrap ? `${Math.floor(Math.max(roomL, roomR))}px` : 'none');
			css(label, 'text-align', flip ? 'right' : 'left');
			css(label, 'opacity', op.toFixed(3));
			css(label, 'z-index', hi ? '5' : '2');
			css(label, 'font-size', (hi ? 15 : 12) + 'px');
			css(label, 'color', hi ? ACCENT : TEXT_DIM);
		});
	}

	/** Poussière des systèmes, calée au pixel entier. */
	function renderDust({ S, dim }: Frame) {
		dustEls.forEach(({ el, o, sz, wx, wy }) => {
			const s = S({ x: wx, y: wy });
			const on = s.x > -20 && s.x < st.vw + 20 && s.y > -20 && s.y < st.vh + 20;
			css(el, 'display', on ? 'block' : 'none');
			if (!on) return;
			css(el, 'transform', `translate(${Math.round(s.x - sz / 2)}px,${Math.round(s.y - sz / 2)}px)`); // pixel entier
			css(el, 'opacity', (o * dim).toFixed(3));
		});
	}

	/** Saut hyperspace : sonde sur le trajet, pulse et carte d'arrivée (système de destination selon la direction). */
	function renderHyperspace({ m, j, f, leg, S, z, fArr, arrOp }: Frame) {
		const { G, W } = m;
		const pq = leg ? S(lp(j, f)) : { x: -99, y: -99 };
		css(probeEl, 'transform', `${at(pq.x, pq.y)} translate(-50%,-50%)`);
		css(probeEl, 'opacity', (leg ? clamp(Math.min(f, 1 - f) * 10, 0, 1) : 0).toFixed(3));
		if (leg) {
			const dg = G[st.dir >= 0 ? W[j + 1].g : W[j].g];
			const ds = S({ x: dg.gx, y: dg.gy });
			const qp = clamp((fArr - 0.72) / 0.28, 0, 1);
			const pr = (dg.Rc + 20 + qp * 160) * z;
			css(pulseEl, 'width', f1(pr * 2) + 'px');
			css(pulseEl, 'height', f1(pr * 2) + 'px');
			css(pulseEl, 'transform', at(ds.x - pr, ds.y - pr));
			css(pulseEl, 'opacity', (qp > 0 ? (1 - qp) * 0.8 : 0).toFixed(3));
			txt(arrNum, pad(dg.g + 1));
			txt(arrName, ' ' + sysName(dg.c));
			css(arrTitle, 'color', systemColor(dg.c));
			txt(arrCount, (dg.mem.length > 1 ? text.projects : text.project).replace('{n}', pad(dg.mem.length)));
			css(arrivalEl, 'opacity', arrOp.toFixed(3));
		} else {
			css(pulseEl, 'opacity', '0');
			css(arrivalEl, 'opacity', '0');
		}
	}

	return { relayout, render, nodePos };
}
