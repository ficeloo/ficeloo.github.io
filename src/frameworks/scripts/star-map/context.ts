// Ce que les gestionnaires d'entrées (input.ts, scroll-loop.ts) reçoivent du moteur (index.ts).
import type { MapEls } from './dom';
import type { MapState } from './state';
import type { createNavigation } from './navigation';
import type { createProjectList } from './project-list';
import type { createScroller } from './scroller';
import type { createZoom } from './zoom';

export type MapCtx = {
	st: MapState;
	root: HTMLElement; // la section de la carte ([data-starmap])
	mapUi: HTMLElement; // calque interactif de la carte
	coarse: boolean; // écran tactile : dans la carte, navigation par boutons
	els: MapEls;
	scroller: ReturnType<typeof createScroller>;
	nav: ReturnType<typeof createNavigation>;
	zoom: ReturnType<typeof createZoom>;
	list: ReturnType<typeof createProjectList>;
	render: () => void;
	relayout: () => void; // taille d'écran changée
};
