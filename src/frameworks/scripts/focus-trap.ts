// Fenêtre ouverte par-dessus la page (overlay « View all », vue rapprochée de la carte) :
// Tab et Maj+Tab bouclent sur ses contrôles au lieu de partir dans la page derrière.

/** items : les contrôles atteignables au moment de l'appui (visibles, actifs…), dans l'ordre. */
export function trapTab(container: HTMLElement, items: () => HTMLElement[]) {
	container.addEventListener('keydown', (e) => {
		if (e.key !== 'Tab') return;
		const list = items();
		const first = list[0];
		const last = list[list.length - 1];
		if (!first) return;
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	});
}
