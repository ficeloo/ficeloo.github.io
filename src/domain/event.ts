// Un événement d'un projet IRL (une association et ses LAN…) : une page chacun, sous celle du projet
// (/projects/<projet>/<événement>). Les événements eux-mêmes sont dans src/data/events.ts.
import type { ImageMetadata } from 'astro'; // type seul, effacé à la compilation
import type { Localized } from './language';

export interface Photo<T = Localized> {
	image: ImageMetadata;
	alt: T;
}

export interface Day<T = Localized> {
	date: T; // « 18 Oct »
	title: T;
	text: T; // HTML : paragraphes <p>, <strong> pour les infos clés
	photo?: Photo<T>; // à côté du récit
}

export interface Card<T = Localized> {
	label: T; // catégorie courte, comme les Highlights
	title: T;
	text: T;
}

export interface Game<T = Localized> {
	name: T;
	note?: T; // précision sous le nom
	mystery?: boolean; // carte « ? » mise en avant
}

export interface EventData<T = Localized> {
	slug: string; // identifiant URL
	project: string; // slug du projet parent (projects.ts)
	title: T;
	description: T; // balise meta
	tag: T;
	date: T;
	pitch: T; // une phrase sous le titre
	overview?: T; // HTML, section Overview sous la fiche
	place: T;
	players: T;
	games: Game<T>[]; // section des jeux, sous les jours
	role: T; // pendant l'événement
	prep: T; // pendant la préparation
	cover: Photo<T>; // image à côté de la fiche
	days: Day<T>[];
	difficulties?: Card<T>[];
	backstage?: Photo<T>[]; // mosaïque : une photo très large prend 2 colonnes, une photo en hauteur 2 rangées
	crew?: Photo<T>;
	thanks?: T; // HTML
	links: { replay?: string; site?: string };
}

export type ProjectEvent = EventData<string>;
