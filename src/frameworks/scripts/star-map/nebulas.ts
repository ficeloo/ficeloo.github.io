// Nébuleuses de la star map : une par système, en 3 calques (fond / gaz / poussière) dont les textures
// sont calculées une fois, hors du fil principal (nebula.worker.ts), puis seulement déplacées par
// transform. Plus l'« intérieur » de chaque nébuleuse : le fond de la vue rapprochée (zoom.ts).
import { INTERIOR_TEX, type NebulaJob, type NebulaLayers } from './nebula-texture';
import { css } from './dom-writes';
import { tokenRgb } from './colors';
import { f1 } from '../../../domain/format';
import { systemKey } from '../../../adapters/system-colors';
import type { Pt, View } from './layout';

const NEB_BOX = 600; // taille réelle (px) de l'élément nébuleuse, mis à l'échelle par transform
const NEB_K = 2.55; // rayon de la nébuleuse / rayon de l'anneau du système
const NEB_TEX = 320; // côté des textures (px) : brumeuses, inutile d'aller plus fin
// Relief : calques fond / gaz / poussière. Le gaz suit le système ; le fond et la poussière glissent
// un peu à l'opposé l'un de l'autre, de NEB_PAR px de boîte au plus (atteint vers NEB_RANGE écran
// d'écart au centre) : le relief reste à l'intérieur de la nébuleuse.
const NEB_LAYERS = ['back', 'mid', 'front'] as const;
const NEB_SHIFT = [-0.9, 0, 1];
const NEB_PAR = 47;
const NEB_RANGE = 0.33;

const at = (x: number, y: number) => `translate(${f1(x)}px,${f1(y)}px)`;

/** cats : catégories des systèmes, dans l'ordre de la carte. */
export function createNebulas(mapUi: HTMLElement, mapLayer: HTMLElement, styles: Record<string, string>, cats: string[]) {
	// Calque à part, sous la carte. Le zoom sur une planète le déplace comme la carte mais ne
	// l'efface pas : une fois arrivé, on est dans la nébuleuse, à l'endroit du point.
	const layer = document.createElement('div');
	layer.className = styles.nebulas;
	mapUi.insertBefore(layer, mapLayer);

	// 3 calques (canvas) par nébuleuse, remplis quand le worker a calculé leurs textures.
	const nebulas = cats.map(() => {
		const nebula = document.createElement('div');
		nebula.className = styles.nebula;
		const layers = NEB_LAYERS.map(() => {
			const cv = document.createElement('canvas');
			cv.className = styles['nebula-layer'];
			cv.width = cv.height = NEB_TEX;
			nebula.appendChild(cv);
			return cv;
		});
		layer.appendChild(nebula);
		return { nebula, layers };
	});
	const interiors: (HTMLCanvasElement | null)[] = cats.map(() => null); // intérieur de chaque nébuleuse (worker)

	// Textures calculées une fois, hors du fil principal (worker), quand le navigateur est libre ;
	// chaque nébuleuse apparaît en fondu dès que la sienne est prête.
	// Sans worker : pas de nébuleuse, le système garde son anneau et sa poussière.
	const load = () => {
		let worker: Worker;
		try {
			worker = new Worker(new URL('./nebula.worker.ts', import.meta.url), { type: 'module' });
		} catch {
			return;
		}
		let left = cats.length;
		worker.onmessage = (e: MessageEvent<{ g: number; interior: Uint8ClampedArray<ArrayBuffer> } & NebulaLayers>) => {
			const { g } = e.data;
			nebulas[g].layers.forEach((cv, k) => cv.getContext('2d')?.putImageData(new ImageData(e.data[NEB_LAYERS[k]], NEB_TEX, NEB_TEX), 0, 0));
			const inside = document.createElement('canvas'); // fond de la vue rapprochée (intérieur de la nébuleuse)
			inside.width = inside.height = INTERIOR_TEX;
			inside.getContext('2d')?.putImageData(new ImageData(e.data.interior, INTERIOR_TEX, INTERIOR_TEX), 0, 0);
			interiors[g] = inside;
			nebulas[g].nebula.toggleAttribute('data-ready', true);
			if (--left === 0) worker.terminate();
		};
		worker.onerror = () => worker.terminate();
		cats.forEach((c, g) => {
			const job: NebulaJob = {
				g,
				seed: 11 + 37 * g,
				size: NEB_TEX,
				vivid: tokenRgb(`--rgb-system-${systemKey(c)}`),
				pastel: tokenRgb(`--rgb-nebula-${systemKey(c)}`),
				deep: tokenRgb('--rgb-bg-deep'),
			};
			worker.postMessage(job);
		});
	};
	if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 1500 });
	else setTimeout(load, 300);

	return {
		/** Le calque des nébuleuses (déplacé avec la carte par la caméra du zoom). */
		layer,
		/** Intérieur de la nébuleuse du système g, une fois calculé (sinon null). */
		interior: (g: number) => interiors[g] ?? null,
		/** Place la nébuleuse du système g autour de son centre s (écran), R = rayon de son anneau ;
		 *  masquée hors écran, sauf si all (vue rapprochée : la caméra peut traverser plusieurs systèmes). */
		render(g: number, s: Pt, R: number, all: boolean, { vw, vh, vertical }: View) {
			const { nebula, layers } = nebulas[g];
			// Taille fixe, mise à l'échelle par transform.
			const Rn = R * NEB_K;
			const on = all || (s.x + Rn > 0 && s.x - Rn < vw && s.y + Rn > 0 && s.y - Rn < vh);
			css(nebula, 'display', on ? 'block' : 'none');
			if (!on) return;
			css(nebula, 'transform', `${at(s.x - Rn, s.y - Rn)} scale(${((Rn * 2) / NEB_BOX).toFixed(4)})`);
			// Relief : décalage selon l'écart au centre de l'écran, sur l'axe du parcours.
			const off = Math.tanh((vertical ? s.y - vh / 2 : s.x - vw / 2) / ((vertical ? vh : vw) * NEB_RANGE)) * NEB_PAR;
			layers.forEach((cv, k) => {
				if (NEB_SHIFT[k]) css(cv, 'transform', `translate${vertical ? 'Y' : 'X'}(${f1(off * NEB_SHIFT[k])}px)`);
			});
		},
	};
}
