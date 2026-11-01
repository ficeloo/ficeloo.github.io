// Vue rapprochée : fiche du projet (une par projet, une seule affichée) et son mini diaporama
// (image principale puis captures ; les images ne se chargent qu'à la première ouverture).

const SHOT = 3500; // mini diaporama : une capture
const SHOT_GIF = 6000; // un GIF (animé) reste plus longtemps

export function createCards(root: HTMLElement, count: number) {
	const cards = [...root.querySelectorAll<HTMLElement>('[data-zoom-card]')];
	const prevBtn = root.querySelector<HTMLButtonElement>('[data-zoom-go="-1"]');
	const nextBtn = root.querySelector<HTMLButtonElement>('[data-zoom-go="1"]');

	let shotT = 0;
	/** Affiche la fiche i ; enter (±1) : elle glisse depuis le côté du voyage. */
	function show(i: number, enter = 0) {
		cards.forEach((c, k) => {
			c.hidden = k !== i;
			c.removeAttribute('data-enter');
		});
		const card = cards[i];
		if (enter) card.setAttribute('data-enter', String(enter));
		const imgs = [...card.querySelectorAll<HTMLImageElement>('img[data-src]')];
		imgs.forEach((img) => { if (!img.getAttribute('src')) img.src = img.dataset.src!; });
		clearTimeout(shotT);
		let k = 0;
		const next = () => {
			imgs.forEach((img, n) => img.toggleAttribute('data-on', n === k));
			if (imgs.length < 2) return;
			shotT = window.setTimeout(() => { k = (k + 1) % imgs.length; next(); }, 'gif' in imgs[k].dataset ? SHOT_GIF : SHOT);
		};
		next();
		if (prevBtn) prevBtn.disabled = i === 0;
		if (nextBtn) nextBtn.disabled = i === count - 1;
	}

	return {
		cards,
		prevBtn,
		nextBtn,
		show,
		/** Arrête le diaporama (retour à la carte). */
		stop: () => clearTimeout(shotT),
		/** Lien « View project » de la fiche i. */
		link: (i: number) => cards[i].querySelector<HTMLAnchorElement>('[data-zoom-link]'),
	};
}
