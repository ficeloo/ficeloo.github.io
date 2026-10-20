// Planète d'un projet : un astre par projet, sa stack en satellites, sa signature en orbite.
// Utilisée par les pages projet (PlanetScene.astro) et la vue rapprochée de la star map (map-zoom.ts).
//
// - Le système (catégorie) donne la technique de rendu, un fichier par système :
//   Game = rocky.ts (cratères), Graphics = facets.ts (low-poly), Web = plated.ts (plaques + anneaux).
// - Le projet donne son « ADN » (data-* posés par PlanetScene.astro) : couleur (token
//   --planet-<slug>), graine, signature (signatures.ts), ceinture, nombre d'anneaux.
// - Un projet In progress a un drone de chantier au travail (drone.ts), avec un geste propre au système.
//
// Ce fichier monte la scène et dessine chaque image dans l'ordre : derrière la planète, la planète, devant.

import { frameGap } from '../frame-pace';
import { C, TAU, proj, reduce, rgba, rootStyle, seeded, token, type PlanetSystem, type Scene, type Vec3 } from './kit';
import { HALO, atmoEdge, buildHalo, rim } from './atmosphere';
import { drawBelt, drawSignature, orbitEllipse } from './orbit';
import { drawBuilder, drawFreeDrone, droneUpdate, newDrone } from './drone';
import { rocky } from './rocky';
import { facets } from './facets';
import { plated, drawRings } from './plated';

/** Système de la star map (category de projects.ts) → rendu de sa planète. */
const SYSTEMS: Record<string, PlanetSystem> = { Game: rocky, Graphics: facets, Web: plated };

function setup(box: HTMLElement): Scene {
	const ds = box.dataset;
	const cv = box.querySelector('canvas')!;
	const sysKey = (ds.system ?? '').toLowerCase();
	const s: Scene = {
		box, cv, ctx: cv.getContext('2d')!,
		sys: SYSTEMS[ds.system ?? ''] ?? rocky,
		color: rootStyle.getPropertyValue(`--planet-${ds.slug}`) ? token(`--planet-${ds.slug}`) : C.secondary, // projet sans token : vert-gris du site
		ringColor: rootStyle.getPropertyValue(`--planet-${ds.slug}-ring`) ? token(`--planet-${ds.slug}-ring`) : C.accent, // anneaux Web : orange par défaut
		// Pas d'atmosphère sur un projet en construction ; système sans token : vert-gris du site
		atmo: !('wip' in ds) && rootStyle.getPropertyValue(`--system-${sysKey}`) ? token(`--system-${sysKey}`) : C.secondary,
		wip: 'wip' in ds,
		rnd: seeded(Number(ds.seed) || 11),
		W: 0, H: 0, R: 0, cx: 0, cy: 0,
		orbitStart: 'belt' in ds ? 0.78 : 0.72,
		sats: [],
		signature: ds.signature ?? 'moon',
		sigDir: 'retrograde' in ds ? -1 : 1,
		sigR: 'belt' in ds ? 0.63 : 0.55,
	};
	s.sats = [...box.querySelectorAll<HTMLElement>('[data-sat]')].map((el, i) => ({ el, r: s.orbitStart + i * 0.12, a0: i * 2.1 + 0.6 }));
	s.sys.init?.(s, ds);
	if ('belt' in ds) s.belt = Array.from({ length: 170 }, () => ({ r: 0.57 + s.rnd() * 0.12, a0: s.rnd() * TAU, size: 0.6 + s.rnd() ** 3 * 1.8 }));
	if (s.wip && s.sys.builder) s.builder = { pos: [0, -1.4, 0], target: [0, 0, 1], firing: false, alpha: () => 1 };
	else if (s.wip) s.drone = newDrone();
	box.toggleAttribute('data-live', true);
	return s;
}

function resize(s: Scene) {
	const dpr = devicePixelRatio || 1;
	s.W = s.box.clientWidth; s.H = s.box.clientHeight;
	s.cv.width = Math.round(s.W * dpr); s.cv.height = Math.round(s.H * dpr);
	s.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	s.R = Math.min(s.W, s.H) * 0.3;
	s.cx = s.W * 0.5; s.cy = s.H * 0.44;
	if (!s.wip) buildHalo(s, dpr);
}

function frame(s: Scene, ms: number) {
	if (!s.W) return;
	const c = s.ctx, time = reduce ? 0 : ms / 1000;
	c.clearRect(0, 0, s.W, s.H);
	if (s.halo) c.drawImage(s.halo, s.cx - HALO * s.R, s.cy - HALO * s.R, 2 * HALO * s.R, 2 * HALO * s.R);
	const sats = s.sats.map((o) => proj(s, o.r, o.a0 + time * 0.55 * Math.pow(o.r / 0.52, -1.5)));
	const dot = ([x, y, d]: Vec3) => { c.beginPath(); c.arc(x, y, d > 0 ? 4 : 3, 0, TAU); c.fillStyle = rgba(C.accent, d > 0 ? 1 : 0.45); c.fill(); };
	if (s.drone) droneUpdate(s, time);

	// Arrière-plan : moitiés arrière des orbites, de la ceinture, des anneaux ; ce qui est derrière la planète
	c.lineWidth = 1; c.setLineDash([3, 5]); c.strokeStyle = rgba(C.secondary, 0.45);
	s.sats.forEach((o) => orbitEllipse(s, o.r, false));
	c.setLineDash([]);
	if (s.rings) drawRings(s, time, false);
	if (s.belt) drawBelt(s, time, false);
	drawSignature(s, time, false);
	if (s.drone) drawFreeDrone(s, time, false);
	if (s.builder) drawBuilder(s, time, false);
	sats.forEach((p) => { if (p[2] <= 0) dot(p); });

	// Planète
	c.save();
	if (s.sys.disc) { c.beginPath(); c.arc(s.cx, s.cy, s.R, 0, TAU); c.clip(); }
	s.sys.draw(s, time);
	c.restore();
	// Low-poly : pas de disque plein (et facettes effacées pendant le chantier), donc ni bord teinté ni liseré
	if (s.sys.disc) { if (!s.wip) atmoEdge(s); rim(s); }

	// Premier plan
	if (s.rings) drawRings(s, time, true);
	if (s.belt) drawBelt(s, time, true);
	drawSignature(s, time, true);
	if (s.drone) drawFreeDrone(s, time, true);
	if (s.builder) drawBuilder(s, time, true);
	c.setLineDash([3, 5]); c.strokeStyle = rgba(C.secondary, 0.7); c.lineWidth = 1;
	s.sats.forEach((o) => orbitEllipse(s, o.r, true));
	c.setLineDash([]);
	sats.forEach((p) => { if (p[2] > 0) dot(p); });

	// Étiquettes des satellites (HTML) : estompées derrière, masquées derrière le disque
	s.sats.forEach((o, i) => {
		const [x, y, d] = sats[i];
		const hidden = d <= 0 && Math.hypot(x - s.cx, y - s.cy) < s.R * 1.05;
		o.el.style.transform = `translate(${x}px, ${y - 16}px) translate(-50%, -50%)`;
		o.el.style.opacity = d > 0 ? '1' : hidden ? '0' : '0.45';
		o.el.style.zIndex = d > 0 ? '2' : '0';
	});
}

// ---------- Montage ----------

/** Une planète montée sur un élément [data-planet-scene] (ADN lu dans ses data-*). */
export interface Planet {
	box: HTMLElement;
	resize(): void;
	frame(ms: number): void;
}

export function createPlanet(box: HTMLElement): Planet {
	const s = setup(box);
	resize(s);
	return { box, resize: () => resize(s), frame: (ms) => frame(s, ms) };
}

/** Pages projet : anime les planètes visibles (pause hors écran, 30 images/s en tactile ou fenêtre inactive, figées en mouvement réduit). */
export function animatePlanets(boxes: Iterable<HTMLElement>) {
	const planets = [...boxes].map(createPlanet);
	if (!planets.length) return;
	const visible = new Set<Planet>();
	const io = new IntersectionObserver((entries) => entries.forEach((e) => {
		const p = planets.find((pl) => pl.box === e.target);
		if (p) e.isIntersecting ? visible.add(p) : visible.delete(p);
	}));
	planets.forEach((p) => { io.observe(p.box); p.frame(performance.now()); });
	new ResizeObserver(() => planets.forEach((p) => { p.resize(); p.frame(performance.now()); })).observe(document.body);
	if (reduce) return;
	let last = 0;
	const loop = (ms: number) => {
		if (ms - last > frameGap()) { last = ms; visible.forEach((p) => p.frame(ms)); }
		requestAnimationFrame(loop);
	};
	requestAnimationFrame(loop);
}
