// Entrées de la star map : clavier (← → Entrée Échap) et barre de touches cliquable, drag à la
// souris, clic sur un nœud ou sur le HUD, nav des systèmes, boutons tactiles.
import { metrics } from './state';
import type { MapCtx } from './context';

export function bindInput({ st, root, mapUi, coarse, els, scroller, nav, zoom, list }: MapCtx) {
	const { goTo, navigate, snap } = nav;

	// Clic sur un projet : le projet courant s'ouvre en vue rapprochée, un autre fait voyager jusqu'à lui.
	function clickItem(i: number) {
		if (st.moved) return;
		const m = metrics(st);
		const k = m.ord.indexOf(i);
		if (Math.abs(m.u - m.U[k]) < 0.08) zoom.open(i);
		else goTo(i);
	}

	function onKey(e: KeyboardEvent) {
		// Entrée sur un bouton ou un lien focalisé : on laisse le navigateur faire.
		if (e.key === 'Enter' && (e.repeat || (e.target as Element).closest?.('a, button'))) return;
		if (press(e.key, e.repeat, true) && e.key.startsWith('Arrow')) e.preventDefault();
	}
	/** Action d'une touche, au clavier ou au clic sur la barre de touches ; true si elle a servi. */
	function press(key: string, repeat = false, byKey = false): boolean {
		if (key === 'Escape') {
			zoom.close();
			list.close();
			return true;
		}
		// Vue rapprochée : ← → de planète en planète, Entrée ouvre la page du projet
		if (zoom.isOpen) {
			if (key === 'ArrowRight' || key === 'ArrowLeft') {
				if (!repeat || !zoom.busy) zoom.hop(key === 'ArrowRight' ? 1 : -1);
				return true;
			}
			if (key === 'Enter') location.href = zoom.link();
			return key === 'Enter';
		}
		if (list.isOpen) return false;
		const m = metrics(st);
		if (m.local < m.T * 0.9 || m.local > m.T + m.Utot * m.STEP + m.STEP) return false;
		if (key === 'ArrowRight' || key === 'ArrowLeft') {
			if (!(repeat && scroller.animating && scroller.end - performance.now() > 90)) navigate(key === 'ArrowRight' ? 1 : -1, repeat);
			return true;
		}
		if (key === 'Enter') {
			// 1er appui : zoom sur la planète du projet courant ; 2e appui (vue rapprochée) : sa page.
			if (Math.abs(m.u - m.U[m.kN]) < 0.1) zoom.open(m.ord[m.kN], byKey);
			return true;
		}
		return false;
	}

	// Drag horizontal à la souris : 150 px = un projet, puis snap.
	function onDown(e: PointerEvent) {
		if (e.button !== 0 || st.vertical || coarse) return; // vertical : scroll natif ; tactile : boutons
		const startX = e.clientX;
		const startS = window.scrollY;
		const px = st.STEP / 150; // 150px de drag = un projet
		st.moved = false;
		st.dragging = true;
		const mv = (ev: PointerEvent) => {
			const dx = ev.clientX - startX;
			if (Math.abs(dx) > 6) st.moved = true;
			if (st.moved) window.scrollTo({ top: startS - dx * px, behavior: 'instant' });
		};
		const up = () => {
			window.removeEventListener('pointermove', mv);
			window.removeEventListener('pointerup', up);
			st.dragging = false;
			snap();
			setTimeout(() => {
				st.moved = false;
			}, 0);
		};
		window.addEventListener('pointermove', mv);
		window.addEventListener('pointerup', up);
	}

	// Nav : clic → voyage vers le premier projet du système.
	els.navRows.forEach((rowEl, gi) => {
		rowEl.addEventListener('click', () => {
			const g0 = st.L.G[gi];
			if (g0) goTo(g0.mem[0]);
		});
	});
	window.addEventListener('keydown', onKey);
	// Barre de touches (grand écran) : un clic sur une touche fait la même chose que la touche.
	els.keysEl?.addEventListener('click', (e) => {
		const key = (e.target as Element).closest<HTMLElement>('[data-key]')?.dataset.key;
		if (key) press(key);
	});
	mapUi.addEventListener('pointerdown', onDown);
	els.hudEl?.addEventListener('click', () => {
		if (st.moved) return;
		const m = metrics(st);
		zoom.open(m.ord[m.kN]);
	});
	// Boutons tactiles : haut de page, projet précédent / suivant, bas de page.
	root.querySelectorAll<HTMLElement>('[data-go]').forEach((btn) => {
		btn.addEventListener('click', () => {
			const go = btn.dataset.go;
			if (go === 'prev' || go === 'next') navigate(go === 'next' ? 1 : -1);
			else scroller.to(go === 'top' ? 0 : document.documentElement.scrollHeight - window.innerHeight, true);
		});
	});

	return { clickItem };
}
