// Chrome de la star map : passage Hero → carte (le Hero recule et s'efface, la carte apparaît),
// compteur, boutons précédent / suivant, HUD du projet courant, nav des systèmes, barre de touches.
import { clamp } from '../../../domain/math';
import { f1, pad } from '../../../domain/format';
import { changed, css, txt } from './dom-writes';
import { ACCENT, TEXT, TEXT_DIM } from './colors';
import type { Frame } from './frame';
import type { MapEls } from './dom';
import type { MapState } from './state';
import type { Text } from './types';

export function createHud(st: MapState, els: MapEls, heroWrap: HTMLElement | null | undefined, mapUi: HTMLElement, text: Text) {
	const { counterEl, hudEl, hud, navRows, navBars, keysEl, keyEnds, goPrev, goNext } = els;

	/** Transition Hero → carte, et apparition de la carte et de la barre de touches. */
	function heroTransition({ p, ease }: Frame) {
		if (heroWrap) {
			css(heroWrap, 'transform', `translateY(${f1(-ease * st.vh * 0.35)}px) scale(${(1 - ease * 0.12).toFixed(3)})`);
			const heroOp = clamp(1 - p * 1.6, 0, 1);
			css(heroWrap, 'opacity', heroOp.toFixed(3));
			// Hero invisible : ses animations (canvas, shimmer) se mettent en pause.
			if (changed(heroWrap, '#hidden', String(heroOp === 0))) heroWrap.toggleAttribute('data-hidden', heroOp === 0);
			css(heroWrap, 'pointer-events', p < 0.3 ? 'auto' : 'none');
		}
		const wheelOp = clamp((p - 0.35) / 0.5, 0, 1);
		css(mapUi!, 'opacity', wheelOp.toFixed(3));
		css(mapUi!, 'pointer-events', p > 0.8 ? 'auto' : 'none');
		if (keysEl) {
			css(keysEl, 'opacity', wheelOp.toFixed(3));
			if (changed(keysEl, '#zoom', String(st.zoomOn))) keysEl.toggleAttribute('data-zoom', st.zoomOn);
		}
	}

	/** Compteur, boutons, HUD du projet courant et nav des systèmes (textes réécrits seulement quand le projet change). */
	function render({ m, u, p, curG }: Frame) {
		const { P, ord, U, N, kN } = m;
		txt(counterEl, pad(kN + 1) + ' / ' + pad(N));
		if (goPrev && changed(goPrev, '#disabled', String(kN === 0))) goPrev.disabled = kN === 0;
		if (goNext && changed(goNext, '#disabled', String(kN === N - 1))) goNext.disabled = kN === N - 1;
		// Barre de touches : ← ou → grisée au premier / dernier projet (carte et vue rapprochée)
		keyEnds.forEach((b) => { const off = b.dataset.key === 'ArrowLeft' ? kN === 0 : kN === N - 1; if (changed(b, '#disabled', String(off))) b.disabled = off; });
		const inWheel = p > 0.96;
		const hudOp = inWheel && !st.zoomOn ? clamp(1 - Math.abs(u - U[kN]) * 3, 0, 1) : 0;
		if (hudEl) css(hudEl, 'opacity', hudOp.toFixed(3));
		const cur = P[ord[kN]];
		txt(hud.cat, text.selected + ' · ' + cur.num + ' · ' + cur.cat);
		if (hud.img && hud.img.getAttribute('src') !== cur.img) hud.img.src = cur.img;
		txt(hud.title, cur.title);
		txt(hud.tag, cur.tag);
		txt(hud.year, cur.year);
		if (hud.wip && changed(hud.wip, '#hidden', String(!cur.wip))) hud.wip.hidden = !cur.wip;
		navRows.forEach((rowEl, gi) => {
			const on = gi === curG;
			css(rowEl, 'color', on ? TEXT : TEXT_DIM);
			const bar = navBars[gi];
			if (bar) {
				css(bar, 'width', (on ? 28 : 12) + 'px');
				css(bar, 'background', on ? ACCENT : 'rgba(var(--rgb-secondary), 0.5)');
			}
		});
	}

	return { heroTransition, render };
}
