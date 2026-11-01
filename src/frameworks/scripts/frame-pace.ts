// Rythme des animations du site.
// Fenêtre inactive (focus dans une autre fenêtre, ex. une vidéo sur l'autre écran) : les boucles
// canvas passent à 30 images/s et les animations CSS se mettent en pause (html[data-idle],
// voir global.css). Chrome cale toutes ses fenêtres sur celle qui anime : sans ça, une vidéo
// sur un autre écran saccade.
// Rien ne s'exécute à l'import : certains modules qui l'importent sont aussi lus au build.

/** À lancer une fois par page (Layout) : suit le focus de la fenêtre et pose html[data-idle]. */
export function watchFocus() {
	const root = document.documentElement;
	let poll = 0;
	const update = () => {
		const idle = !document.hasFocus();
		root.toggleAttribute('data-idle', idle);
		// Un clic dans une iframe du site (jeu itch.io) lui donne le focus sans quitter le site,
		// mais sa perte n'est pas signalée à la page : on vérifie chaque seconde.
		clearInterval(poll);
		if (!idle && document.activeElement instanceof HTMLIFrameElement) poll = window.setInterval(update, 1000);
	};
	// Pendant l'événement blur, le focus n'est pas encore arrivé dans l'iframe : on lit juste après.
	addEventListener('blur', () => setTimeout(update));
	addEventListener('focus', update);
	update();
}

let coarse: boolean | undefined;

/** Écart minimal entre deux images d'une boucle canvas (ms) : 30 images/s en tactile ou fenêtre inactive. */
export function frameGap() {
	coarse ??= matchMedia('(pointer: coarse)').matches; // tactile : 30 images/s suffisent
	return coarse || document.documentElement.hasAttribute('data-idle') ? 32 : 0;
}
