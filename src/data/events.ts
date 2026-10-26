import xlanCover from '../assets/getnextlan/xlan-2026/cover.jpg'
import xlanCrew from '../assets/getnextlan/xlan-2026/crew.jpg'
import xlanOnAirStage from '../assets/getnextlan/xlan-2026/on-air-stage.jpg'
import xlanOnAirStandings from '../assets/getnextlan/xlan-2026/on-air-standings.jpg'
import xlanStudio from '../assets/getnextlan/xlan-2026/studio.jpg'
import xlanControlRoom from '../assets/getnextlan/xlan-2026/control-room.jpg'
import xlanRack from '../assets/getnextlan/xlan-2026/rack.jpg'
import xlanSwitcher from '../assets/getnextlan/xlan-2026/switcher.jpg'
import xlanGreenScreen from '../assets/getnextlan/xlan-2026/green-screen.jpg'

import type { ImageMetadata } from 'astro';
import { pick, type Lang, type Localized } from '../i18n';

// Événements d'un projet IRL (une association et ses LAN…) : une page chacun,
// sous celle du projet (/projects/<projet>/<événement>). Mêmes règles de texte que projects.ts.

interface Photo<T = Localized> {
	image: ImageMetadata;
	alt: T;
	caption?: T;
}

interface Day<T = Localized> {
	date: T; // « 18 Oct »
	title: T;
	text: T;
}

interface Card<T = Localized> {
	label: T; // catégorie courte, comme les Highlights
	title: T;
	text: T;
}

interface EventData<T = Localized> {
	slug: string; // identifiant URL
	project: string; // slug du projet parent (projects.ts)
	title: T;
	description: T; // balise meta
	tag: T;
	date: T;
	pitch: T; // une phrase sous le titre
	place: T;
	players: T;
	games: T;
	role: T; // pendant l'événement
	prep: T; // pendant la préparation
	cover: Photo<T>; // image à côté de la fiche
	days: Day<T>[];
	onAir?: Photo<T>[]; // captures du stream
	difficulties?: Card<T>[];
	backstage?: Photo<T>[]; // mosaïque : une photo très large prend 2 colonnes, une photo en hauteur 2 rangées
	crew?: Photo<T>;
	thanks?: T; // HTML
	links: { replay?: string; site?: string };
}

const events: EventData[] = [
	{
		slug: "xlan-2026",
		project: "getnextlan",
		title: "XLAN 2026",
		// TODO (Théophile) : textes à écrire à ta voix ; reste le lien du replay.
		// (Buvette au « Dernier café avant la fin du monde » : à placer dans un texte si tu veux.)
		description: "[PLACEHOLDER] XLAN 2026, the multigaming LAN of GetNextLan at 42 Paris, streamed live on two days.",
		tag: "IRL  ·  Event  ·  Multigaming LAN",
		date: "18–19 Oct 2026",
		pitch: {
			en: "The biggest multigaming LAN party at École 42 Paris!",
			fr: "La plus grande LAN multigaming de l'école 42 Paris !",
		},
		place: "42 Paris · final in the Xavier Niel amphitheater",
		players: "16 players · 8 teams",
		games: "MicroWorks · Brawlhalla · Spot The Bug · StarCraft II · Trackmania · Minecraft Bingo · Totally Accurate Battlegrounds · a mystery game (a dictation, at the start of the final)",
		role: "Main caster · Host · Scene switching",
		prep: "Partnerships · Website front-end · Twitch scenes",
		cover: { image: xlanCover, alt: "The XAVLAN end screen on the control rack monitor" },
		days: [
			{
				date: "18 Oct",
				title: "Green-screen studio",
				text: "[PLACEHOLDER] Main caster and host: co-casters and players on set, and I picked the scenes the stream showed. A friend handled the sound.",
			},
			{
				date: "19 Oct",
				title: "The final, on stage",
				text: "[PLACEHOLDER] On stage with a small mic and no sound return, while the crew in the control room ran my mic, the sound and the live cameras.",
			},
		],
		onAir: [
			{ image: xlanOnAirStage, alt: "The stage during the final, both teams' games on the XAVLAN wall", caption: "[PLACEHOLDER] Caption" },
			{ image: xlanOnAirStandings, alt: "Casting on stage in front of the team standings", caption: "[PLACEHOLDER] Caption" },
		],
		difficulties: [
			{ label: "Last minute", title: "From three days to two", text: "[PLACEHOLDER] The event was cut by one day at the last minute." },
			{ label: "[PLACEHOLDER]", title: "[PLACEHOLDER] Difficulty 2", text: "[PLACEHOLDER]" },
			{ label: "[PLACEHOLDER]", title: "[PLACEHOLDER] Difficulty 3", text: "[PLACEHOLDER]" },
		],
		backstage: [
			{ image: xlanStudio, alt: "The green-screen studio, wide angle" },
			{ image: xlanControlRoom, alt: "The control room, a hand on the video switcher" },
			{ image: xlanRack, alt: "The control rack showing the live stage" },
			{ image: xlanSwitcher, alt: "The video switcher and the multiview screens" },
			{ image: xlanGreenScreen, alt: "Two crew members working in front of the green screen" },
		],
		crew: { image: xlanCrew, alt: "The XLAN 2026 crew on stage" },
		thanks: `<p>[PLACEHOLDER] Thanks to the team.</p>`,
		links: { site: "https://getnextlan.fr" }, // TODO (Théophile) : lien du replay s'il existe (replay: "…")
	},
]

/** Les événements dans une langue. */
export function getEvents(lang: Lang): ProjectEvent[] {
	const photo = (p: Photo) => ({ ...p, alt: pick(p.alt, lang), caption: pick(p.caption, lang) });
	return events.map((e) => ({
		...e,
		title: pick(e.title, lang),
		description: pick(e.description, lang),
		tag: pick(e.tag, lang),
		date: pick(e.date, lang),
		pitch: pick(e.pitch, lang),
		place: pick(e.place, lang),
		players: pick(e.players, lang),
		games: pick(e.games, lang),
		role: pick(e.role, lang),
		prep: pick(e.prep, lang),
		cover: photo(e.cover),
		days: e.days.map((d) => ({ date: pick(d.date, lang), title: pick(d.title, lang), text: pick(d.text, lang) })),
		onAir: e.onAir?.map(photo),
		difficulties: e.difficulties?.map((c) => ({ label: pick(c.label, lang), title: pick(c.title, lang), text: pick(c.text, lang) })),
		backstage: e.backstage?.map(photo),
		crew: e.crew && photo(e.crew),
		thanks: pick(e.thanks, lang),
	}));
}

/** Les événements d'un projet, dans l'ordre du tableau. */
export function getProjectEvents(project: string, lang: Lang): ProjectEvent[] {
	return getEvents(lang).filter((e) => e.project === project);
}

export const eventPaths = events.map((e) => ({ slug: e.project, event: e.slug }));
export type ProjectEvent = EventData<string>;
