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

// ---- Satellites : un par projet ---------------------------------------------------------------

/** Écart supplémentaire entre deux systèmes, en « crans » d'orbite (1 cran = 1 projet). */
const SYSTEM_GAP = 0.8;

/**
 * Rang orbital de chaque projet, du plus proche au plus lointain : systèmes dans l'ordre de la
 * carte (ordre d'apparition dans projects.ts), +1 cran par projet, +SYSTEM_GAP entre systèmes.
 * Ce sont des rangs, pas des distances : les distances sont calculées à l'écran.
 */
export function moonSlots(categories: string[]): number[] {
	const systems = [...new Set(categories)];
	const sorted = systems.flatMap((c) => categories.filter((cat) => cat === c));
	let slot = 0;
	return sorted.map((cat, i) => {
		if (i > 0) slot += 1 + (cat !== sorted[i - 1] ? SYSTEM_GAP : 0);
		return slot;
	});
}

/** Vitesse angulaire (rad/s) de l'orbite la plus proche ; les autres suivent Kepler. */
const INNER_SPEED = 0.42;
/** Première orbite : juste après l'anneau (en rayons d'anneau). */
const INNER_ORBIT = 1.18;
/** Dépassement en hauteur de la dernière orbite hors de la section (1 = tient tout juste). */
const OUTER_REACH = 1.3;
/** Demi-hauteur à l'écran d'une orbite de rayon 1, une fois aplatie puis inclinée. */
const HALF_HEIGHT = Math.hypot(Math.sin((TILT * Math.PI) / 180), FLAT * Math.cos((TILT * Math.PI) / 180));

type Moon = {
	slot: number;
	theta: number; // position sur l'orbite (rad)
	r: number; // rayon de l'orbite (px)
	omega: number; // vitesse angulaire (rad/s)
	trail: number; // longueur de la traînée (rad)
	size: number;
	alpha: number;
};

/**
 * Anime les satellites de la section About sur deux canvas : un derrière tout (orbites,
 * satellites, traînées), un posé sur la planète pour ce qui passe devant elle.
 */
export function initOrbits(section: HTMLElement) {
	const back = section.querySelector<HTMLCanvasElement>('[data-orbits-back]');
	const front = section.querySelector<HTMLCanvasElement>('[data-orbits-front]');
	const planet = section.querySelector<SVGSVGElement>('[data-planet]');
	const bctx = back?.getContext('2d');
	const fctx = front?.getContext('2d');
	if (!back || !front || !planet || !bctx || !fctx) return;

	// Le canvas ne lit pas les variables CSS : on récupère les couleurs une fois.
	const css = getComputedStyle(document.documentElement);
	const accent = css.getPropertyValue('--rgb-accent').trim();
	const secondary = css.getPropertyValue('--rgb-secondary').trim();

	const rot = (TILT * Math.PI) / 180;
	const cos = Math.cos(rot);
	const sin = Math.sin(rot);

	const slots: number[] = JSON.parse(section.dataset.moons ?? '[]');
	// Départs répartis à l'angle d'or, pour que les satellites ne partent pas groupés.
	const moons: Moon[] = slots.map((slot, i) => ({
		slot, theta: (i * 2.399) % (Math.PI * 2), r: 0, omega: 0, trail: 0, size: 0, alpha: 0,
	}));
	const lastSlot = slots[slots.length - 1] ?? 0;

	let W = 0, H = 0, dpr = 1;
	let cx = 0, cy = 0, R = 0; // centre et rayon de la planète dans la section (px)
	let fx = 0, fy = 0; // coin du canvas de devant dans la section

	function layout() {
		dpr = Math.min(window.devicePixelRatio || 1, 2);
		const s = section.getBoundingClientRect();
		const p = planet!.getBoundingClientRect();
		W = s.width;
		H = s.height;
		const scale = p.width / VIEWBOX.width;
		cx = p.left - s.left - VIEWBOX.x * scale;
		cy = p.top - s.top - VIEWBOX.y * scale;
		R = PLANET_R * scale;

		back!.width = Math.round(W * dpr);
		back!.height = Math.round(H * dpr);
		// Le canvas de devant ne couvre que la planète : seul endroit où un satellite la cache.
		fx = cx - R;
		fy = cy - R;
		front!.style.left = `${fx}px`;
		front!.style.top = `${fy}px`;
		front!.style.width = front!.style.height = `${2 * R}px`;
		front!.width = front!.height = Math.round(2 * R * dpr);

		// Distances relatives : 1re orbite après l'anneau, dernière vers le bord droit de la
		// section, progression géométrique entre les deux (comme les planètes d'un vrai système).
		// La dernière dépasse un peu de la section en hauteur (OUTER_REACH) : son satellite sort
		// et revient. Pas plus, sinon on ne voit qu'un morceau d'ellipse qui ne suit plus le plan.
		const rMin = RING_OUTER * scale * INNER_ORBIT;
		const fitHeight = (Math.min(cy, H - cy) * OUTER_REACH) / HALF_HEIGHT;
		const rMax = Math.max(rMin * 1.5, Math.min((W - cx) * 1.02, fitHeight));
		moons.forEach((m, i) => {
			const rank = moons.length > 1 ? i / (moons.length - 1) : 0;
			m.r = rMin * (rMax / rMin) ** (lastSlot ? m.slot / lastSlot : 0);
			m.omega = INNER_SPEED * (m.r / rMin) ** -1.5; // 3e loi de Kepler : T² ∝ r³
			m.trail = Math.max(36, m.omega * m.r * 1.2) / m.r; // traînée ∝ vitesse linéaire
			m.size = 3.8 - 1.8 * rank; // plus loin = plus petit et plus pâle (lisibilité du texte)
			m.alpha = 1 - 0.62 * rank;
		});
	}

	// Orbite = cercle de rayon r dans le plan de l'anneau, vu en perspective puis incliné.
	function point(r: number, th: number): [number, number] {
		const x = r * Math.cos(th);
		const y = r * FLAT * Math.sin(th);
		return [cx + x * cos - y * sin, cy + x * sin + y * cos];
	}

	// frontOnly : seulement la moitié avant des orbites (sin > 0, côté spectateur).
	function drawMoons(ctx: CanvasRenderingContext2D, frontOnly: boolean) {
		const SEGMENTS = 18;
		for (const m of moons) {
			ctx.beginPath();
			ctx.ellipse(cx, cy, m.r, m.r * FLAT, rot, 0, frontOnly ? Math.PI : Math.PI * 2);
			ctx.setLineDash([3, 6]);
			ctx.strokeStyle = `rgba(${secondary}, ${0.42 * m.alpha})`;
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.setLineDash([]);

			// Traînée : petits segments de plus en plus opaques vers le satellite.
			ctx.lineCap = 'round';
			ctx.lineWidth = m.size * 0.75;
			for (let i = 0; i < SEGMENTS; i++) {
				const a0 = m.theta - m.trail * (1 - i / SEGMENTS);
				const a1 = m.theta - m.trail * (1 - (i + 1) / SEGMENTS);
				if (frontOnly && Math.sin((a0 + a1) / 2) <= 0) continue;
				const [x0, y0] = point(m.r, a0);
				const [x1, y1] = point(m.r, a1);
				ctx.beginPath();
				ctx.moveTo(x0, y0);
				ctx.lineTo(x1, y1);
				ctx.strokeStyle = `rgba(${accent}, ${m.alpha * 0.7 * ((i + 1) / SEGMENTS) ** 1.6})`;
				ctx.stroke();
			}

			if (frontOnly && Math.sin(m.theta) <= 0) continue;
			const [x, y] = point(m.r, m.theta);
			ctx.fillStyle = `rgba(${accent}, ${m.alpha * 0.22})`; // halo
			ctx.beginPath();
			ctx.arc(x, y, m.size * 2.6, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = `rgba(${accent}, ${m.alpha})`;
			ctx.beginPath();
			ctx.arc(x, y, m.size, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	function draw() {
		bctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
		bctx!.clearRect(0, 0, W, H);
		drawMoons(bctx!, false);

		// Devant la planète : même scène décalée dans le petit canvas, limitée au disque.
		fctx!.setTransform(dpr, 0, 0, dpr, -fx * dpr, -fy * dpr);
		fctx!.clearRect(fx, fy, 2 * R, 2 * R);
		fctx!.save();
		fctx!.beginPath();
		fctx!.arc(cx, cy, R, 0, Math.PI * 2);
		fctx!.clip();
		drawMoons(fctx!, true);
		fctx!.restore();
	}

	// Boucle : en pause hors écran ; reduced-motion = une image fixe.
	const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	let visible = false;
	let running = false;
	let last = 0;

	function frame(now: number) {
		if (!visible) {
			running = false;
			return;
		}
		const dt = Math.min(0.05, (now - last) / 1000); // pas de bond après une pause
		last = now;
		for (const m of moons) m.theta += m.omega * dt;
		draw();
		requestAnimationFrame(frame);
	}

	function start() {
		if (running || reduce || !visible) return;
		running = true;
		last = performance.now();
		requestAnimationFrame(frame);
	}

	// La planète peut bouger sans que la section change de taille (polices, mise en page).
	const ro = new ResizeObserver(() => {
		layout();
		draw();
	});
	ro.observe(section);
	ro.observe(planet);

	new IntersectionObserver(([entry]) => {
		visible = entry.isIntersecting;
		start();
	}).observe(section);
}
