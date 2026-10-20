// Rythme des animations du site.
// Fenêtre inactive (focus dans une autre fenêtre, ex. une vidéo sur l'autre écran) : les boucles
// canvas passent à 30 images/s et les animations CSS se mettent en pause (html[data-idle],
// voir global.css). Chrome cale toutes ses fenêtres sur celle qui anime : sans ça, une vidéo
// sur un autre écran saccade.
// Un clic dans une iframe du site (jeu itch.io) lui donne le focus sans quitter le site :
// la page n'est pas inactive pour autant.

const root = document.documentElement;
const coarse = matchMedia('(pointer: coarse)').matches; // tactile : 30 images/s suffisent
let idle = false;
let poll = 0;

function update() {
	idle = !document.hasFocus();
	root.toggleAttribute('data-idle', idle);
	// Focus dans une iframe : sa perte n'est pas signalée à la page, on vérifie chaque seconde.
	clearInterval(poll);
	if (!idle && document.activeElement instanceof HTMLIFrameElement) poll = window.setInterval(update, 1000);
}

// Pendant l'événement blur, le focus n'est pas encore arrivé dans l'iframe : on lit juste après.
addEventListener('blur', () => setTimeout(update));
addEventListener('focus', update);
update();

/** Écart minimal entre deux images d'une boucle canvas (ms) : 30 images/s en tactile ou fenêtre inactive. */
export function frameGap() {
	return coarse || idle ? 32 : 0;
}
