// Vue rapprochée : chemins vers les planètes voisines, de la planète jusqu'au bord de la place libre,
// le nom au bout (un bouton : clic = planète voisine). Ils se tracent progressivement depuis la
// planète ; celui vers la précédente est orange (parcouru).
import { clamp, easeOutCubic, lerp } from '../../../../domain/math';
import { f1 } from '../../../../domain/format';
import { NODE_R } from './camera';
import type { Spot, ZoomHost } from './types';

const KEYS_H = 110; // bas de l'écran réservé aux raccourcis clavier (écran large)
const GROW = 500; // un chemin se trace en tant de ms

/** place() : où est la planète ; narrow / tall : disposition de la fiche (CSS). */
export function createRoutes(root: HTMLElement, cardsEl: HTMLElement, host: ZoomHost, place: () => Spot, narrow: MediaQueryList, tall: MediaQueryList) {
	const routes = [-1, 1].map((d) => ({
		d,
		path: root.querySelector<SVGPathElement>(`[data-zoom-route="${d}"]`)!,
		label: root.querySelector<HTMLButtonElement>(`[data-zoom-hop="${d}"]`)!,
	}));

	let growRaf = 0;
	/** Chemins depuis la planète du projet idx. */
	function draw(idx: number) {
		cancelAnimationFrame(growRaf);
		const segs: { path: SVGPathElement; x0: number; y0: number; x1: number; y1: number }[] = [];
		const o = root.getBoundingClientRect(), c = cardsEl.getBoundingClientRect();
		const Q = place(), start = Q.zEnd * NODE_R * 1.35, m = 16;
		const box = {
			x0: narrow.matches ? m : c.right - o.left + m, x1: o.width - m,
			y0: tall.matches ? c.bottom - o.top + m : m,
			y1: tall.matches ? o.height - m : narrow.matches ? c.top - o.top - m : o.height - KEYS_H,
		};
		routes.forEach(({ d, path, label }) => {
			const nb = host.neighbor(idx, d), len = nb ? Math.hypot(nb.dx, nb.dy) : 0;
			label.hidden = !nb || !len;
			path.setAttribute('d', '');
			if (!nb || !len) return;
			const ux = nb.dx / len, uy = nb.dy / len;
			let t = Infinity; // jusqu'au premier bord rencontré
			if (ux > 0) t = Math.min(t, (box.x1 - Q.x) / ux);
			if (ux < 0) t = Math.min(t, (box.x0 - Q.x) / ux);
			if (uy > 0) t = Math.min(t, (box.y1 - Q.y) / uy);
			if (uy < 0) t = Math.min(t, (box.y0 - Q.y) / uy);
			const horiz = Math.abs(ux) >= Math.abs(uy);
			label.textContent = horiz ? (ux < 0 ? `← ${nb.label}` : `${nb.label} →`) : uy < 0 ? `↑ ${nb.label}` : `${nb.label} ↓`;
			const lw = label.offsetWidth, lh = label.offsetHeight;
			const x = Q.x + ux * t, y = Q.y + uy * t;
			// Le nom se range contre le bord atteint, le chemin s'arrête juste avant lui. Pas la place
			// (la fiche est de ce côté) : le chemin va jusqu'au bord et le nom se pose au-dessus de sa fin.
			const room = horiz ? lw + 8 : lh + 6, tEnd = t - room / Math.max(Math.abs(horiz ? ux : uy), 0.2);
			const inline = tEnd >= start + 30;
			const tLine = inline ? tEnd : t;
			if (tLine < start + 30) { label.hidden = true; return; }
			path.toggleAttribute('data-done', d < 0);
			segs.push({ path, x0: Q.x + ux * start, y0: Q.y + uy * start, x1: Q.x + ux * tLine, y1: Q.y + uy * tLine });
			const lx = !inline || !horiz ? clamp(x - lw / 2, box.x0, box.x1 - lw) : ux < 0 ? x : x - lw;
			const ly = !inline ? clamp(y - lh - 6, box.y0, box.y1 - lh) : horiz ? clamp(y - lh / 2, box.y0, box.y1 - lh) : uy < 0 ? y : y - lh;
			label.style.transform = `translate(${f1(lx)}px,${f1(ly)}px)`;
		});
		root.setAttribute('data-routes', '');
		const t0 = performance.now();
		const grow = (now: number) => {
			const k = easeOutCubic(Math.min(1, (now - t0) / GROW));
			segs.forEach((g) => g.path.setAttribute('d', `M${f1(g.x0)} ${f1(g.y0)}L${f1(lerp(g.x0, g.x1, k))} ${f1(lerp(g.y0, g.y1, k))}`));
			if (k < 1) growRaf = requestAnimationFrame(grow);
		};
		growRaf = requestAnimationFrame(grow);
	}
	function hide() {
		cancelAnimationFrame(growRaf);
		root.removeAttribute('data-routes');
		routes.forEach(({ path }) => path.setAttribute('d', ''));
	}

	return { draw, hide, routes };
}
