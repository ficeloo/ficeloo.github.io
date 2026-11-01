// Un projet du portfolio et ses règles. Les projets eux-mêmes sont dans src/data/projects.ts.
import type { ImageMetadata } from 'astro'; // type seul, effacé à la compilation
import type { Localized } from './language';

// Planète de la page projet. La technique de rendu vient du système (category) ;
// la couleur vient de tokens.css (--planet-<slug>), le reste est l'« ADN » du projet.
export interface Planet {
	seed: number; // place les cratères, plaques ou facettes : deux projets d'un même système ne se ressemblent pas
	signature: 'ship' | 'teapot' | 'station' | 'beacon' | 'moon' | 'mic' | 'joystick'; // objet emblématique du projet, en orbite
	retrograde?: boolean; // la signature tourne à contre-sens
	belt?: boolean; // ceinture d'astéroïdes
	rings?: number; // Web : 1 anneau par couche du projet (front, back, BDD…), 3 max
	signs?: string[]; // IRL : enseignes au néon propres au projet (formes dans src/scripts/planet/neon-signs.ts)
}

export interface Highlight<T = Localized> {
	label: T; // catégorie courte (Physics, Flow…)
	title: T;
	text: T;
}

// Les textes (T) s'écrivent "en anglais seulement" ou { en: "…", fr: "…" } : voir language.ts.
// Les composants reçoivent un Project déjà traduit (src/adapters/catalog.ts).
export interface ProjectData<T = Localized> {
	slug: string; //identifiant URL
	title: T;
	description: T;
	longDescription?: T; // HTML
	category: string; // Système de la star map : les projets y sont regroupés par catégorie (clé, non traduite)
	tag: T;
	year: T;
	pitch: T; // Une phrase sous le titre de la page projet
	context: T; // Solo / équipe, cadre (42, jam…), rôle
	duration?: T;
	stack: string[]; // Technos principales (compétences pour un événement) : satellites de la planète + fiche technique
	highlights?: Highlight<T>[];
	planet: Planet;
	inProgress?: boolean; // Projet pas encore terminé : badge « In progress » partout où il apparaît
	ongoing?: boolean; // Engagement toujours actif (association…) : statut « Active » au lieu de « Done » / « Shipped »
	image: ImageMetadata; // Image principale (un GIF reste animé, il n'est pas converti)
	alt: T;
	screenshots?: ImageMetadata[]; // Tableau de screenshots
	links: { itch?: string; github?: string; gdd?: string; replay?: string; site?: string }; // replay : vidéo d'un événement ; site : site du projet
	embedUrl?: string; // Pour les projets jouables sur navigateur (WASM)
}

// event : projet d'un système d'événements (EVENT_SYSTEMS), la fiche parle de compétences et de date
export type Project = ProjectData<string> & { event: boolean };

// Systèmes dont les projets sont des événements ou des engagements (pas du code) :
// stack → compétences, sortie → date.
const EVENT_SYSTEMS = new Set(['IRL']);

/** Vrai si les projets de ce système sont des événements. */
export const isEventSystem = (category: string) => EVENT_SYSTEMS.has(category);

/** Systèmes de la star map, dans l'ordre d'apparition de leur premier projet. */
export const systemsOf = (projects: { category: string }[]) => [...new Set(projects.map((p) => p.category))];
