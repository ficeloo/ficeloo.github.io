// Navigation dans la star map : snap à la fin d'un scroll, aller à un projet, projet précédent /
// suivant, sortie de la carte au tactile. Tout passe par le scroll de la page (scroller.ts).
import { clamp } from '../../../domain/math';
import { metrics, type MapState } from './state';
import type { createScroller } from './scroller';

// Rythme du snap (réglages à affiner à l'usage ; longueur d'un pas : STEP_K dans state.ts, d'un saut : LEG dans layout.ts) :
const SNAP_BIAS = 0.15; // dès 15 % de pas dans un sens, le snap finit vers le projet suivant
const EDGE_PX = 40; // idem aux bords de la carte (Hero ↔ carte ↔ About), en pixels

/** aboutEl : section qui suit la carte (le snap s'y arrête). */
export function createNavigation(st: MapState, scroller: ReturnType<typeof createScroller>, aboutEl: HTMLElement | null) {
	// Haut de About, borné au bas de page (About + footer peuvent être plus courts que l'écran).
	const aboutTop = () =>
		Math.min(aboutEl!.getBoundingClientRect().top + window.scrollY, document.documentElement.scrollHeight - window.innerHeight);

	// Snap directionnel : on termine le mouvement dans le sens du scroll plutôt que de
	// revenir au plus proche (sinon 1-2 crans de molette sont annulés).
	function snap() {
		if (scroller.animating || st.dragging || st.touching) return;
		const m = metrics(st);
		const y = window.scrollY;
		const mapStart = m.stageTop + m.T;
		// Avant la carte : tout en haut, rien à faire ; entre le Hero et le 1er système,
		// jamais d'entre-deux.
		if (y < mapStart - 2) {
			if (y <= 0) return;
			// Un petit mouvement suffit (intention claire).
			const toMap = st.scrollDir > 0 ? y > EDGE_PX : y > mapStart - EDGE_PX;
			scroller.to(toMap ? mapStart : 0);
			return;
		}
		// Après le dernier projet : entre la carte et la section About, jamais d'entre-deux.
		const mapEnd = mapStart + m.Utot * m.STEP;
		if (y > mapEnd + 2) {
			if (!aboutEl) return;
			const aboutY = aboutTop();
			if (y >= aboutY - 2) return;
			const toAbout = st.scrollDir > 0 ? y > mapEnd + EDGE_PX : y > aboutY - EDGE_PX;
			scroller.to(toAbout ? aboutY : mapEnd);
			return;
		}
		const { U, u } = m;
		let k = 0;
		if (st.scrollDir > 0) {
			k = U.findIndex((v) => v >= u - SNAP_BIAS);
		} else {
			for (let q = 0; q < U.length; q++) if (U[q] <= u + SNAP_BIAS) k = q;
		}
		const target = mapStart + U[k] * m.STEP;
		if (Math.abs(target - y) > 2) scroller.to(target);
	}

	function goTo(i: number, instant = false) {
		const m = metrics(st);
		const k = Math.max(0, m.ord.indexOf(i));
		const target = m.stageTop + m.T + m.U[k] * m.STEP;
		if (instant) window.scrollTo({ top: target, behavior: 'instant' });
		else scroller.to(target);
	}

	// Projet précédent (-1) ou suivant (+1) : flèches du clavier et boutons tactiles.
	function navigate(d: number, fast = false) {
		const m = metrics(st);
		const base = scroller.animating && st.navK != null ? st.navK : m.kN;
		const nk = clamp(base + d, 0, m.N - 1);
		if (nk === base) return;
		st.navK = nk;
		scroller.to(m.stageTop + m.T + m.U[nk] * m.STEP, fast);
	}

	// Tactile : un swipe sort de la carte depuis son premier projet (vers le Hero) ou son dernier (vers About).
	function exitMap(d: number) {
		const m = metrics(st);
		if (d > 0 && m.kN === m.N - 1 && aboutEl) scroller.to(aboutTop());
		else if (d < 0 && m.kN === 0) scroller.to(0);
	}

	return { snap, goTo, navigate, exitMap };
}
