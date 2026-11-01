// Boucle de la star map : chaque scroll redessine la carte (une fois par image) puis programme le
// snap ; la molette rend la main à l'utilisateur ; au tactile, la carte se parcourt aux boutons et un
// swipe n'en sort que par ses bords ; taille d'écran changée et fin de chargement : on recalcule.
import { readViewport } from './state';
import type { MapCtx } from './context';

export function bindScrollLoop({ st, root, coarse, els, scroller, nav, zoom, list, render, relayout }: MapCtx) {
	const { goTo, snap, exitMap } = nav;
	let raf = 0;
	let snapT = 0;
	let wasOut = false;
	let lastY = window.scrollY;
	let touchEndAt = -Infinity; // aucun geste encore (sinon le chargement de la page compterait)
	let swipeY: number | null = null; // début d'un geste commencé dans la carte (tactile)
	const mapRange = () => [st.stageTop + st.T, st.stageTop + st.T + st.Utot * st.STEP];

	const onScroll = () => {
		const y = window.scrollY;
		// Tactile : un swipe lancé hors de la carte s'arrête à son bord,
		// on y entre toujours par le premier ou le dernier projet.
		if (coarse && !scroller.animating && (st.touching || performance.now() - touchEndAt < 1500)) {
			const [a, b] = mapRange();
			const edge = lastY <= a && y > a ? a : lastY >= b && y < b ? b : null;
			if (edge !== null) {
				window.scrollTo({ top: edge, behavior: 'instant' });
				lastY = edge;
				return;
			}
		}
		if (y !== lastY) st.scrollDir = y > lastY ? 1 : -1;
		lastY = y;
		if (!raf) raf = requestAnimationFrame(() => {
			raf = 0;
			// Carte sortie de l'écran (About, footer…) : un dernier rendu puis plus rien,
			// et on met le scintillement en pause.
			const out = window.scrollY > st.stageEnd;
			if (out !== wasOut) root.toggleAttribute('data-off', out);
			if (out && wasOut) return;
			wasOut = out;
			render();
		});
		clearTimeout(snapT);
		snapT = window.setTimeout(snap, 170);
	};
	const onWheel = () => {
		st.navK = null;
		st.hashIdx = -1; // l'utilisateur a pris la main : plus de recalage sur le hash
		if (scroller.animating) scroller.stop();
	};
	// Mobile : la barre d'adresse qui apparaît/disparaît au scroll déclenche un resize
	// (hauteur seule, ~60-120px). On l'ignore, sinon la carte se recalcule et saute.
	const onResize = () => {
		if (coarse && window.innerWidth === st.vw && Math.abs(window.innerHeight - st.screenH) < 160) return;
		readViewport(st);
		relayout();
		render();
		zoom.relayout();
	};

	window.addEventListener('scroll', onScroll, { passive: true });
	window.addEventListener('wheel', onWheel, { passive: true });

	// --- Tactile : dans la carte, navigation par boutons uniquement ---
	// Le swipe ne fait pas défiler les projets ; il sert seulement à sortir de la carte
	// (vers le Hero depuis le premier projet, vers About depuis le dernier).
	window.addEventListener('touchstart', (e) => {
		st.touching = true;
		onWheel();
		const [a, b] = mapRange();
		const y = window.scrollY;
		swipeY = coarse && !list.isOpen && !zoom.isOpen && y > a - 2 && y < b + 2 ? e.touches[0].clientY : null;
	}, { passive: true });
	window.addEventListener('touchmove', (e) => {
		if (!e.cancelable) return;
		// Vue rapprochée : la page ne défile pas, seule sa colonne (si elle déborde) le peut.
		if (zoom.isOpen) {
			if (!(e.target as Element).closest?.('[data-zoom-scroll]')) e.preventDefault();
		} else if (swipeY !== null) e.preventDefault();
	}, { passive: false });
	const onTouchEnd = (e: TouchEvent) => {
		st.touching = false;
		touchEndAt = performance.now();
		if (swipeY !== null) {
			const dy = swipeY - (e.changedTouches[0]?.clientY ?? swipeY);
			swipeY = null;
			if (Math.abs(dy) > 50) exitMap(dy > 0 ? 1 : -1);
		}
		clearTimeout(snapT);
		snapT = window.setTimeout(snap, 170);
	};
	window.addEventListener('touchend', onTouchEnd, { passive: true });
	window.addEventListener('touchcancel', onTouchEnd, { passive: true });
	window.addEventListener('resize', onResize);
	// Polices/images chargées : ce qui précède la carte a pu bouger → on remesure.
	window.addEventListener('load', () => {
		els.measureLabels();
		relayout();
		if (st.hashIdx >= 0) goTo(st.hashIdx, true); // recale sur le projet du hash avec la mesure finale
		render();
	});
}
