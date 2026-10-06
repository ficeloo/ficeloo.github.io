// Planète f. de la section About : une géante gazeuse à anneau, et un satellite par projet.
// Ce fichier est la source unique du « plan » partagé par l'anneau (SVG, généré au build
// par HomePlanet.astro) et les orbites (canvas, animées ici) : les deux restent alignés.

/** Inclinaison du plan à l'écran, en degrés (négatif = monte vers la droite). */
export const TILT = -13;
/** Aplatissement du plan vu en perspective : un cercle de rayon r devient une ellipse r × r·FLAT. */
export const FLAT = 0.27;

/** Repère du SVG : la planète est centrée en (0, 0). */
export const VIEWBOX = { x: -170, y: -100, width: 340, height: 200 };
export const PLANET_R = 58;

/** Bandes de l'anneau, de l'intérieur vers l'extérieur. tone : couleur (poussière ou glace). */
export const RING_BANDS: { r: number; tone: 'dust' | 'ice'; opacity: number; width: number }[] = [
	{ r: 76, tone: 'dust', opacity: 0.35, width: 2 },
	{ r: 84, tone: 'ice', opacity: 0.16, width: 5 },
	{ r: 94, tone: 'dust', opacity: 0.55, width: 9 },
	{ r: 104, tone: 'ice', opacity: 0.12, width: 2 },
	{ r: 114, tone: 'dust', opacity: 0.4, width: 12 },
	{ r: 128, tone: 'ice', opacity: 0.2, width: 4 },
	{ r: 138, tone: 'dust', opacity: 0.3, width: 7 },
	{ r: 150, tone: 'ice', opacity: 0.1, width: 1.5 },
];
export const RING_OUTER = RING_BANDS[RING_BANDS.length - 1].r;

// On regarde le plan de l'anneau d'un peu au-dessus : sin(élévation) = FLAT.
const SIN_VIEW = FLAT;
const COS_VIEW = Math.sqrt(1 - FLAT * FLAT);

/**
 * Point de la surface de la planète (latitude, longitude en radians ; longitude π/2 = face
 * au spectateur), projeté dans le repère du plan (avant inclinaison).
 * Renvoie [x, y vers le bas, profondeur] ; profondeur > 0 = face visible.
 */
export function projectSphere(lat: number, lon: number): [number, number, number] {
	const x = PLANET_R * Math.cos(lat) * Math.cos(lon);
	const toViewer = PLANET_R * Math.cos(lat) * Math.sin(lon);
	const up = PLANET_R * Math.sin(lat);
	return [x, -up * COS_VIEW + toViewer * SIN_VIEW, toViewer * COS_VIEW + up * SIN_VIEW];
}

/** Tracé SVG de la partie visible d'un parallèle (latitude en degrés). */
export function latitudePath(latDeg: number): string {
	const lat = (latDeg * Math.PI) / 180;
	let d = '';
	let pen = false;
	for (let i = 0; i <= 120; i++) {
		const [x, y, depth] = projectSphere(lat, (i * Math.PI) / 60);
		if (depth > 0) {
			d += `${pen ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)} `;
			pen = true;
		} else pen = false;
	}
	return d.trim();
}
