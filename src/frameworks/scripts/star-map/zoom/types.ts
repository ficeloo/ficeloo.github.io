// Types partagés par les parties de la vue rapprochée.

export type Pt = { x: number; y: number };

/** Où la caméra amène la planète (px, repère de la vue) et le zoom d'arrivée. */
export type Spot = Pt & { zEnd: number };

/** Ce que la carte fournit au zoom. Coordonnées en px, dans le repère de l'écran de la carte. */
export interface ZoomHost {
	count: number;
	nodePoint(i: number): Pt; // position actuelle du nœud du projet i
	label(i: number): string; // « 03 Scop » (texte du viseur)
	camera(map: string, opacity: number, nebula: number, stars: string): void; // calques carte, nébuleuses, étoiles ('' = au repos)
	interior(i: number): HTMLCanvasElement | null; // intérieur de la nébuleuse du système du projet i (si calculé)
	inSystem(i: number): Pt; // place du projet dans son système (écart au centre, en rayons)
	jumpTo(i: number): void; // cale la carte (cachée) sur le projet i
	neighbor(i: number, d: number): { dx: number; dy: number; label: string } | null; // projet voisin (d = ±1) : direction sur la carte, nom
	lock(on: boolean): void; // scroll bloqué, chrome de la carte masqué
}
