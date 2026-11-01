// État partagé du moteur de la star map : taille de l'écran, disposition en cache, position du
// parcours et gestes en cours. Un seul objet, que chaque partie du moteur reçoit.
import { clamp } from '../../../domain/math';
import { layoutMap, type MapLayout, type Pt, type View } from './layout';
import type { Proj } from './types';

export interface MapState extends View {
	screenH: number; // window.innerHeight au dernier calcul (barre d'adresse mobile)
	// Cache de disposition : tout ce qui ne dépend que de la taille d'écran est calculé au
	// relayout (init, resize, load) et plus à chaque image de scroll.
	L: MapLayout<Proj>;
	stageTop: number; // haut de la carte dans la page
	stageEnd: number; // bas de la carte
	T: number; // longueur du passage Hero → carte (px de scroll)
	STEP: number; // un pas : d'un projet au suivant (px de scroll)
	Utot: number; // longueur du parcours, en pas
	legPts: (Pt[] | null)[]; // points échantillonnés des sauts entre systèmes (monde)
	// Parcours
	zoomOn: boolean; // vue rapprochée ouverte
	lastU: number; // avancement au rendu précédent…
	dir: number; // … d'où le sens du parcours (affichage des sauts)
	// Gestes
	moved: boolean; // le geste en cours est un drag (pas un clic)
	dragging: boolean;
	touching: boolean; // doigt posé : pas de snap avant qu'il soit levé
	scrollDir: number; // sens du dernier scroll (1 = vers le bas)
	navK: number | null; // projet visé par les flèches pendant l'animation
	hashIdx: number; // projet de l'adresse (#project-<slug>) à recaler au chargement, -1 sinon
}

export function createState(projects: Proj[]): MapState {
	// Retour depuis une page projet (« ← Back ») : /#project-<slug> → carte calée sur ce projet.
	const hashSlug = /^#project-(.+)$/.exec(decodeURIComponent(location.hash))?.[1];
	const view = { vw: 1280, vh: 800, vertical: false };
	return {
		...view,
		screenH: 0,
		L: layoutMap(projects, view),
		stageTop: 0,
		stageEnd: 0,
		T: 0,
		STEP: 0,
		Utot: 0,
		legPts: [],
		zoomOn: false,
		lastU: 0,
		dir: 1,
		moved: false,
		dragging: false,
		touching: false,
		scrollDir: 1,
		navK: null,
		hashIdx: hashSlug ? projects.findIndex((p) => p.slug === hashSlug) : -1,
	};
}

/** Où en est le parcours : disposition + avancement dans la carte (u, en pas), passage Hero → carte (p),
 *  projet le plus proche (kN). */
export type Metrics = MapLayout<Proj> & {
	stageTop: number; T: number; STEP: number; Utot: number; local: number; u: number; p: number; kN: number;
};

export function metrics(st: MapState): Metrics {
	const local = window.scrollY - st.stageTop;
	const u = clamp((local - st.T) / st.STEP, 0, st.Utot);
	const p = clamp(local / st.T, 0, 1);
	let kN = 0;
	st.L.U.forEach((v, k) => {
		if (Math.abs(v - u) < Math.abs(st.L.U[kN] - u)) kN = k;
	});
	return { ...st.L, stageTop: st.stageTop, T: st.T, STEP: st.STEP, Utot: st.Utot, local, u, p, kN };
}
