// Liste « View all » de la star map : tous les projets par-dessus la carte, filtrables par système,
// avec l'aperçu (image, description) du projet survolé ou focalisé. Un clic emmène à sa planète.
// La liste elle-même est rendue au build (StarMap.astro) ; ce module l'ouvre, la ferme et la tient à jour.
import { trapTab } from '../focus-trap';

type Item = { img: string; alt: string; description: string };
type Hooks = {
	current: () => number; // projet courant de la carte (ouvert en premier dans la liste)
	choose: (i: number) => void; // projet choisi dans la liste
};

export function createProjectList(root: HTMLElement, projects: Item[], { current, choose }: Hooks) {
	const overlayEl = root.querySelector<HTMLElement>('[data-overlay]');
	const seeAllBtn = root.querySelector<HTMLElement>('[data-see-all]');
	const listClose = root.querySelector<HTMLElement>('[data-list-close]');
	const chips = Array.from(root.querySelectorAll<HTMLElement>('[data-filter]'));
	const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-row-idx]'));
	const previewImg = root.querySelector<HTMLImageElement>('[data-preview-img]');
	const previewDesc = root.querySelector<HTMLElement>('[data-preview-desc]');

	let listOpen = false;
	let filter = 'All';
	let hovIdx = 0;

	function applyFilter() {
		chips.forEach((ch) => ch.toggleAttribute('data-active', ch.dataset.filter === filter));
		rows.forEach((r) => (r.hidden = filter !== 'All' && r.dataset.cat !== filter));
	}
	function applyHover() {
		rows.forEach((r) => r.toggleAttribute('data-hover', Number(r.dataset.rowIdx) === hovIdx));
		const pr = projects[hovIdx] || projects[0];
		if (previewImg && previewImg.getAttribute('src') !== pr.img) {
			previewImg.src = pr.img;
			previewImg.alt = pr.alt;
		}
		if (previewDesc) previewDesc.textContent = pr.description;
	}
	function open() {
		hovIdx = current();
		filter = 'All';
		listOpen = true;
		document.body.style.overflow = 'hidden';
		if (overlayEl) {
			overlayEl.style.opacity = '1';
			overlayEl.style.pointerEvents = 'auto';
			overlayEl.inert = false;
		}
		applyFilter();
		applyHover();
		// Focus sur le projet courant de la liste.
		rows.find((r) => Number(r.dataset.rowIdx) === hovIdx)?.focus({ preventScroll: true });
	}
	// restoreFocus : rendre le focus au bouton « View all » (sauf si on part vers un projet).
	function close(restoreFocus = true) {
		if (!listOpen) return;
		listOpen = false;
		document.body.style.overflow = '';
		if (overlayEl) {
			overlayEl.style.opacity = '0';
			overlayEl.style.pointerEvents = 'none';
			overlayEl.inert = true;
		}
		if (restoreFocus) seeAllBtn?.focus({ preventScroll: true });
		else (document.activeElement as HTMLElement | null)?.blur();
	}

	seeAllBtn?.addEventListener('click', open);
	listClose?.addEventListener('click', () => close());
	// Overlay ouvert : Tab boucle sur ses boutons au lieu de partir dans la page derrière.
	if (overlayEl) trapTab(overlayEl, () => [...overlayEl.querySelectorAll<HTMLElement>('button')].filter((b) => !b.hidden));
	chips.forEach((ch) => {
		ch.addEventListener('click', () => {
			filter = ch.dataset.filter || 'All';
			applyFilter();
		});
	});
	rows.forEach((r) => {
		const i = Number(r.dataset.rowIdx);
		const hover = () => {
			hovIdx = i;
			applyHover();
		};
		r.addEventListener('mouseenter', hover);
		r.addEventListener('focus', hover); // au clavier, l'aperçu suit le focus
		r.addEventListener('click', () => {
			close(false);
			choose(i);
		});
	});

	return {
		get isOpen() {
			return listOpen;
		},
		open,
		close,
	};
}
