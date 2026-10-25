// Mosaïque d'une page événement : un clic sur une photo l'ouvre en grand dans le <dialog>,
// ← → (touches ou boutons) passent à la précédente / suivante, Échap ou ✕ ferment.

for (const section of document.querySelectorAll<HTMLElement>('[data-lightbox]')) {
	const tiles = [...section.querySelectorAll<HTMLButtonElement>('[data-full]')];
	const dialog = section.querySelector('dialog')!;
	const view = dialog.querySelector<HTMLImageElement>('[data-view]')!;
	let current = 0;

	const show = (i: number) => {
		current = (i + tiles.length) % tiles.length;
		view.src = tiles[current].dataset.full!;
		view.alt = tiles[current].dataset.alt ?? '';
	};

	tiles.forEach((tile, i) =>
		tile.addEventListener('click', () => {
			show(i);
			dialog.showModal();
		}),
	);

	dialog.querySelector('[data-prev]')!.addEventListener('click', () => show(current - 1));
	dialog.querySelector('[data-next]')!.addEventListener('click', () => show(current + 1));
	dialog.querySelector('[data-close]')!.addEventListener('click', () => dialog.close());

	// Clic à côté de la photo : ferme
	dialog.addEventListener('click', (e) => {
		if (e.target === dialog) dialog.close();
	});

	dialog.addEventListener('keydown', (e) => {
		if (e.key === 'ArrowLeft') show(current - 1);
		else if (e.key === 'ArrowRight') show(current + 1);
		else return;
		e.preventDefault();
	});

	// Retour sur la photo d'où l'on vient
	dialog.addEventListener('close', () => tiles[current].focus());
}
