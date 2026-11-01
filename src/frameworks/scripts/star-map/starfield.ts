// Étoiles de fond de la star map (140, déterministes) : scintillement, parallaxe sur l'axe du
// parcours, et traînées pendant un saut hyperspace (étirées dans le sens du trajet).
import { softwareRendering } from '../render-mode';
import { css } from './dom-writes';
import { f1 } from '../../../domain/format';
import type { Pt, View } from './layout';

export function createStarfield(starsLayer: HTMLElement, root: HTMLElement, styles: Record<string, string>) {
	// Positions, tailles, opacités et teintes tirées une fois pour toutes (graine fixe).
	const starBase = (() => {
		let s = 7;
		const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
		return Array.from({ length: 140 }, () => {
			const q = r();
			return {
				x: r() * 100,
				y: r() * 100,
				d: r() < 0.85 ? 1 : 2,
				o: +(0.2 + r() * 0.6).toFixed(2),
				z: [0.3, 0.6, 1][Math.floor(r() * 3)],
				c: q < 0.05 ? 'accent' : q < 0.16 ? 'secondary' : 'text', // token --rgb-* (alpha = o)
			};
		});
	})();

	// Scintillement par groupes : 8 calques animés au lieu de 140 étoiles (perf mobile).
	// Chaque groupe a son rythme ; ses étoiles sont dispersées sur tout l'écran.
	const TWINKLE_GROUPS = 8;
	const starGroups = Array.from({ length: TWINKLE_GROUPS }, () => {
		const g = document.createElement('div');
		g.className = styles['star-group'];
		g.style.animationDuration = (2 + Math.random() * 3).toFixed(2) + 's';
		g.style.animationDelay = (-Math.random() * 5).toFixed(2) + 's';
		starsLayer.appendChild(g);
		return g;
	});
	const starEls = starBase.map((s, idx) => {
		const d = document.createElement('div');
		d.className = styles.star;
		// Opacité propre portée par la couleur (le groupe anime sa propre opacité par-dessus).
		// --warp : teinte posée sur le calque pendant un saut hyperspace (sinon couleur propre de l'étoile).
		d.style.background = `rgba(var(--warp, var(--rgb-${s.c})), ${s.o})`;
		d.style.width = s.d + 'px';
		d.style.height = s.d + 'px';
		starGroups[idx % TWINKLE_GROUPS].appendChild(d);
		return d;
	});
	// Sans carte graphique, refusionner 8 calques plein écran à chaque image est très coûteux
	// (21 i/s au lieu de 60 sur la carte) : chaque étoile scintille alors elle-même, au rythme
	// de son groupe. Même rendu, mais seulement 140 petits points à refusionner (voir data-soft dans le CSS).
	if (softwareRendering()) {
		root.setAttribute('data-soft', '');
		starEls.forEach((d, idx) => {
			const g = starGroups[idx % TWINKLE_GROUPS];
			d.style.animationDuration = g.style.animationDuration;
			d.style.animationDelay = g.style.animationDelay;
		});
	}

	return {
		/** Taille d'écran changée : en horizontal, hauteur fixe en % ; en vertical, top: 0 et y via transform. */
		place(vertical: boolean) {
			starEls.forEach((d, i) => (d.style.top = vertical ? '0' : starBase[i].y.toFixed(2) + '%'));
		},
		/** Position à l'image : parallaxe selon la caméra ; wave (0 → 1 → 0) étire en traînée pendant un saut, rot en degrés. */
		render({ vw, vh, vertical }: View, cam: Pt, wave: number, rot: number) {
			// Étoiles : parallaxe sur l'axe du parcours (x en horizontal, y en vertical).
			// En horizontal, top fixe en % (relayout) ; en vertical, top: 0 et y via transform.
			const W0 = vw * 1.1;
			const H0 = vh * 1.1;
			const wrap = (v: number, m: number) => ((v % m) + m) % m;
			const rotS = `rotate(${f1(rot)}deg)`;
			starBase.forEach((s, idx) => {
				const zz = s.z;
				const x = vertical ? (s.x / 100) * vw : wrap((s.x / 100) * W0 - cam.x * 0.08 * zz, W0) - vw * 0.05;
				const y = vertical ? wrap((s.y / 100) * H0 - cam.y * 0.08 * zz, H0) - vh * 0.05 : 0;
				const len = s.d + wave * (40 + s.o * 120) * zz * 1.4;
				// Au repos : taille réelle, coin calé sur un pixel entier — une étoile étirée
				// ou à cheval sur deux pixels est lissée et paraît bien plus terne.
				// En saut : rotation + traînée (étirement depuis la taille réelle).
				const tf = wave === 0 // sans traînée, la rotation d'un point est invisible
					? `translate(${Math.round(x - s.d / 2)}px,${Math.round(y - s.d / 2)}px)`
					: `translate(${f1(x)}px,${f1(y)}px) ${rotS} scaleX(${f1(len / s.d)}) translate(-50%,-50%)`;
				css(starEls[idx], 'transform', tf);
			});
		},
	};
}
