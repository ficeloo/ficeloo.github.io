// Données de la star map, préparées au build par StarMap.astro (JSON dans la page).

/** Un projet tel que l'envoie StarMap.astro. */
export type Raw = {
	slug: string;
	title: string;
	description: string;
	cat: string;
	tag: string;
	year: string;
	wip: boolean; // projet en cours : badge « In progress »
	img: string;
	alt: string;
	link: string; // page projet, dans la langue de la page
};

/** Un projet dans le moteur : son indice (ordre des données) et son numéro affiché (« 03 »). */
export type Proj = Raw & { i: number; num: string };

/** Textes de l'interface, traduits au build (StarMap.astro) : {name} et {n} y sont remplacés. */
export type Text = { entering: string; system: string; selected: string; project: string; projects: string; targeting: string; lock: string };
