// Cas d'usage des événements : ce que les pages en font, sans savoir d'où ils viennent
// (src/adapters/catalog.ts leur passe les données de src/data/events.ts).
import { pick, type Lang } from '../domain/language';
import type { EventData, Photo, ProjectEvent } from '../domain/event';

/** Un événement dans une langue (texte absent de cette langue : anglais). */
export function localizeEvent(e: EventData, lang: Lang): ProjectEvent {
	const photo = (p: Photo) => ({ ...p, alt: pick(p.alt, lang) });
	return {
		...e,
		title: pick(e.title, lang),
		description: pick(e.description, lang),
		tag: pick(e.tag, lang),
		date: pick(e.date, lang),
		pitch: pick(e.pitch, lang),
		overview: pick(e.overview, lang),
		place: pick(e.place, lang),
		players: pick(e.players, lang),
		games: e.games.map((g) => ({ ...g, name: pick(g.name, lang), note: pick(g.note, lang) })),
		role: pick(e.role, lang),
		prep: pick(e.prep, lang),
		cover: photo(e.cover),
		days: e.days.map((d) => ({ date: pick(d.date, lang), title: pick(d.title, lang), text: pick(d.text, lang), photo: d.photo && photo(d.photo) })),
		difficulties: e.difficulties?.map((c) => ({ label: pick(c.label, lang), title: pick(c.title, lang), text: pick(c.text, lang) })),
		backstage: e.backstage?.map(photo),
		crew: e.crew && photo(e.crew),
		thanks: pick(e.thanks, lang),
	};
}

/** Les événements d'un projet, dans l'ordre donné. */
export const eventsOfProject = (events: ProjectEvent[], project: string) => events.filter((e) => e.project === project);
