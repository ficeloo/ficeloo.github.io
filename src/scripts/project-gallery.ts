// Carrousel du média de la page projet, façon Steam : le média principal puis les captures
// défilent seuls (10 s pour un GIF, 6 s pour une image). La barre orange sous la vignette
// active est une animation CSS : sa fin déclenche l'image suivante.
// Clic sur une vignette ou une flèche : saut puis pause de 8 s. Survol du média : pause.
// Hors écran : pause. Animations réduites : pas de défilement automatique.

const HOLD_MS = 8000;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const pad = (n: number) => String(n).padStart(2, '0');

document.querySelectorAll<HTMLElement>('[data-gallery]').forEach((gallery) => {
	const main = gallery.querySelector<HTMLImageElement>('[data-main]');
	const thumbs = [...gallery.querySelectorAll<HTMLButtonElement>('[data-slide]')];
	const count = gallery.querySelector('[data-count]');
	if (!main || thumbs.length < 2) return;

	const isGif = (src: string) => /\.gif(\?|$)/i.test(src);
	let current = 0;
	let holdTimer = 0;
	let swapTimer = 0;

	function go(index: number) {
		current = (index + thumbs.length) % thumbs.length;
		const thumb = thumbs[current];
		// Fondu : l'image s'efface, change, puis réapparaît
		main!.classList.add('swap');
		clearTimeout(swapTimer);
		swapTimer = window.setTimeout(() => {
			main!.src = thumb.dataset.slide ?? main!.src;
			main!.alt = thumb.dataset.alt ?? '';
			main!.classList.remove('swap');
		}, 200);
		thumbs.forEach((t) => t.removeAttribute('aria-current'));
		thumb.style.setProperty('--slide', isGif(thumb.dataset.slide ?? '') ? '10s' : '6s');
		void thumb.offsetWidth; // relance l'animation de la barre
		thumb.setAttribute('aria-current', 'true');
		if (count) count.textContent = `${pad(current + 1)} / ${pad(thumbs.length)}`;
	}

	// Après une action de l'utilisateur, la barre reste figée un moment
	function hold() {
		gallery.classList.add('held');
		clearTimeout(holdTimer);
		holdTimer = window.setTimeout(() => gallery.classList.remove('held'), HOLD_MS);
	}

	thumbs.forEach((thumb, i) => {
		thumb.addEventListener('click', () => { go(i); hold(); });
		thumb.addEventListener('animationend', () => { if (!reduce) go(current + 1); });
	});
	gallery.querySelector('[data-prev]')?.addEventListener('click', () => { go(current - 1); hold(); });
	gallery.querySelector('[data-next]')?.addEventListener('click', () => { go(current + 1); hold(); });

	const screen = main.parentElement;
	screen?.addEventListener('mouseenter', () => gallery.classList.add('paused'));
	screen?.addEventListener('mouseleave', () => gallery.classList.remove('paused'));
	new IntersectionObserver(([entry]) => gallery.classList.toggle('away', !entry.isIntersecting)).observe(gallery);

	thumbs[0].style.setProperty('--slide', isGif(thumbs[0].dataset.slide ?? '') ? '10s' : '6s');
});
