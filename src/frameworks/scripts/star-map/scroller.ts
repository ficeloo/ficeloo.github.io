// Scroll animé de la carte (snap, flèches, boutons) : la page glisse jusqu'à une position,
// en un temps proportionnel à la distance (en pas de la carte).
import { clamp, easeInOutCubic } from '../../../domain/math';

/** step() : distance de scroll d'un pas (d'un projet au suivant), elle change avec la taille de l'écran. */
export function createScroller(step: () => number) {
	let animating = false;
	let end = 0;
	let raf = 0;
	return {
		/** Une animation est en cours. */
		get animating() {
			return animating;
		},
		/** Fin prévue de l'animation en cours (horloge de performance.now()). */
		get end() {
			return end;
		},
		/** Glisse jusqu'à target ; fast : plus court et sans accélération (touche gardée enfoncée, boutons). */
		to(target: number, fast = false) {
			cancelAnimationFrame(raf);
			const from = window.scrollY;
			const d = target - from;
			if (Math.abs(d) < 2) {
				animating = false;
				return;
			}
			const units = Math.abs(d) / step(); // durée proportionnelle au nombre de pas
			const dur = fast ? clamp(160 + units * 170, 160, 1400) : clamp(450 + units * 300, 450, 3600);
			const t0 = performance.now();
			animating = true;
			end = t0 + dur;
			const frame = (t: number) => {
				const q = clamp((t - t0) / dur, 0, 1);
				const e = fast ? 1 - Math.pow(1 - q, 2) : easeInOutCubic(q);
				window.scrollTo({ top: from + d * e, behavior: 'instant' });
				if (q < 1) raf = requestAnimationFrame(frame);
				else animating = false;
			};
			raf = requestAnimationFrame(frame);
		},
		/** Arrête l'animation en cours (l'utilisateur reprend la main). */
		stop() {
			cancelAnimationFrame(raf);
			animating = false;
		},
	};
}
