// Cas d'usage des projets : ce que les pages en font, sans savoir d'où ils viennent
// (src/adapters/catalog.ts leur passe les données de src/data/projects.ts).
import { pick, type Lang } from '../domain/language';
import { isEventSystem, systemsOf, type Project, type ProjectData } from '../domain/project';

/** Un projet dans une langue (texte absent de cette langue : anglais). */
export function localizeProject(p: ProjectData, lang: Lang): Project {
	return {
		...p,
		title: pick(p.title, lang),
		description: pick(p.description, lang),
		longDescription: pick(p.longDescription, lang),
		tag: pick(p.tag, lang),
		year: pick(p.year, lang),
		pitch: pick(p.pitch, lang),
		context: pick(p.context, lang),
		duration: pick(p.duration, lang),
		highlights: p.highlights?.map((h) => ({ label: pick(h.label, lang), title: pick(h.title, lang), text: pick(h.text, lang) })),
		alt: pick(p.alt, lang),
		event: isEventSystem(p.category),
	};
}

/** Les projets dans l'ordre de la carte (système par système) : numéros 01, 02…, mini-carte, précédent / suivant. */
export function inMapOrder<P extends { category: string }>(projects: P[]): P[] {
	return systemsOf(projects).flatMap((c) => projects.filter((p) => p.category === c));
}
