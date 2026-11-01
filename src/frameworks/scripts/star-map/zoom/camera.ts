// Vue rapprochée : où la caméra amène la planète (au centre de la place laissée libre par la fiche),
// la caméra elle-même (carte, nébuleuses et étoiles déplacées par un transform, via ZoomHost.camera)
// et le fond : l'intérieur de la nébuleuse du système, qui glisse d'une planète à l'autre.
import { clamp, lerp, smoothstep } from '../../../../domain/math';
import { f1 } from '../../../../domain/format';
import type { Pt, Spot, ZoomHost } from './types';

export const NODE_R = 8; // rayon du nœud actif sur la carte (16 px de diamètre)
const STARS_PAN = 0.35; // les étoiles, lointaines, ne suivent qu'une partie du déplacement…
const STARS_ZOOM = 0.12; // … et du zoom (exposant)
const BACK_OP = 0.9; // opacité du fond (intérieur de la nébuleuse) une fois arrivé : la fiche reste lisible
const BACK_PAN = 0.11; // décalage du fond par rayon de système, en part du plus grand côté de l'écran

type Els = {
	root: HTMLElement; // la vue
	cardsEl: HTMLElement; // colonne de la fiche
	planetsEl: HTMLElement; // scène des planètes (déplacée là où la caméra les amène)
	backdrop: HTMLElement; // fond (deux canvas, pour le fondu d'un système à l'autre)
	boxes: HTMLElement[]; // une planète par projet
};

/** narrow : fiche en bas ou en haut (CSS) ; tall : fiche en haut, planète dessous (CSS). */
export function createCamera(host: ZoomHost, { root, cardsEl, planetsEl, backdrop, boxes }: Els, narrow: MediaQueryList, tall: MediaQueryList) {
	const backCvs = [...backdrop.querySelectorAll('canvas')];

	// --- Géométrie : où la caméra amène la planète. Au centre de la place laissée libre par la fiche
	// (à sa droite ; au-dessus sur écran étroit), pour que les chemins des deux côtés aient la place. ---
	let viewMax = 0; // plus grand côté de la vue, relevé ici (pas à chaque image : relire la mise en page coûte)
	function place(): Spot {
		const o = root.getBoundingClientRect(), c = cardsEl.getBoundingClientRect();
		viewMax = Math.max(o.width, o.height);
		const W = planetsEl.offsetWidth, H = planetsEl.offsetHeight, m = 12;
		const R = Math.min(W, H) * 0.3; // rayon de la planète (src/frameworks/scripts/planet/index.ts)
		const x = narrow.matches ? o.width / 2 : Math.max((c.right - o.left + o.width) / 2, c.right - o.left + W * 0.4);
		const below = c.bottom - o.top; // écran haut : la planète dans la place sous la fiche
		const y = tall.matches ? clamp((below + o.height) / 2, below + H * 0.44 + m, o.height - H * 0.56 - m)
			: narrow.matches ? clamp((c.top - o.top) / 2, H * 0.44 + m, c.top - o.top - H * 0.56) : o.height / 2;
		return { x, y, zEnd: Math.max(1, R / NODE_R) };
	}
	function setSpot(q: Pt) {
		planetsEl.style.transform = `translate(${f1(q.x - planetsEl.offsetWidth / 2)}px,${f1(q.y - planetsEl.offsetHeight * 0.44)}px)`;
	}

	/** Caméra : le point A de la carte (position d'un nœud) est montré au point S de l'écran, zoom Z
	 *  (zEnd = zoom d'arrivée). Les étoiles suivent en partie (parallaxe). En approchant, la carte
	 *  s'efface, puis sa nébuleuse laisse place au fond (intérieur de la nébuleuse), qui grandit. */
	function setCamera(A: Pt, S: Pt, Z: number, zEnd: number) {
		const Zs = Math.pow(Z, STARS_ZOOM), sx = A.x + (S.x - A.x) * STARS_PAN, sy = A.y + (S.y - A.y) * STARS_PAN;
		const near = Math.log(Math.max(1, Z)) / Math.log(Math.max(1.01, zEnd)); // 0 = carte, 1 = arrivé
		const inside = smoothstep(0.45, 0.92, near);
		host.camera(
			`translate(${f1(S.x - A.x * Z)}px,${f1(S.y - A.y * Z)}px) scale(${Z.toFixed(4)})`,
			1 - smoothstep(2.5, 8, Z),
			1 - inside,
			`translate(${f1(sx - A.x * Zs)}px,${f1(sy - A.y * Zs)}px) scale(${Zs.toFixed(4)})`,
		);
		backdrop.style.opacity = (inside * BACK_OP).toFixed(3);
		backScale = lerp(1.35, 1, inside);
		moveBackdrop();
	}
	// Le fond glisse selon la place de la planète dans son système : d'une planète à l'autre, il
	// défile (impression de déplacement) ; il ne change qu'en passant dans un autre système.
	let backScale = 1;
	let backPos = { x: 0, y: 0 };
	function moveBackdrop() {
		const k = viewMax * BACK_PAN;
		const x = clamp(-backPos.x, -1.2, 1.2) * k, y = clamp(-backPos.y, -1.2, 1.2) * k;
		backdrop.style.setProperty('--bx', f1(x) + 'px');
		backdrop.style.setProperty('--by', f1(y) + 'px');
		backdrop.style.setProperty('--bs', backScale.toFixed(3));
	}
	// Fond : l'intérieur de la nébuleuse du système de i, en fondu depuis celui d'avant
	let backFor: HTMLCanvasElement | null = null;
	function showInterior(i: number) {
		const src = host.interior(i);
		if (src === backFor) return;
		backFor = src;
		const next = backCvs.find((cv) => !cv.hasAttribute('data-on')) ?? backCvs[0];
		if (src) {
			next.width = next.height = src.width;
			next.getContext('2d')!.drawImage(src, 0, 0);
		}
		backCvs.forEach((cv) => cv.toggleAttribute('data-on', cv === next && !!src));
	}
	/** Planète du projet i (nœud Pi) suivant la caméra : là où son nœud tombe, à la taille du zoom. */
	function placePlanet(i: number, Pi: Pt, A: Pt, S: Pt, Z: number, Q: Spot) {
		const x = S.x + (Pi.x - A.x) * Z, y = S.y + (Pi.y - A.y) * Z;
		boxes[i].style.transform = `translate(${f1(x - Q.x)}px,${f1(y - Q.y)}px) scale(${(Z / Q.zEnd).toFixed(4)})`;
		return { x, y };
	}

	/** Plongée à l'avancement e (0 = carte, 1 = planète) : le nœud P glisse vers la cible Q en grossissant. */
	function cameraAt(i: number, P: Pt, Q: Spot, e: number) {
		const Z = Math.pow(Q.zEnd, e), S = { x: lerp(P.x, Q.x, e), y: lerp(P.y, Q.y, e) };
		setCamera(P, S, Z, Q.zEnd);
		placePlanet(i, P, P, S, Z, Q);
		boxes[i].style.opacity = smoothstep(0.08, 0.35, e).toFixed(3);
		return { cx: S.x, cy: S.y, Z };
	}

	return {
		place,
		setSpot,
		setCamera,
		moveBackdrop,
		showInterior,
		cameraAt,
		/** Place de la planète dans son système (écart au centre, en rayons) : décalage du fond. */
		get backPos() {
			return backPos;
		},
		set backPos(p: Pt) {
			backPos = p;
		},
	};
}
