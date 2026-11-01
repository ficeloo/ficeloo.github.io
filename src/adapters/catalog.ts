// Catalogue : le seul module qui lit src/data (les projets et événements écrits à la main) et les
// passe aux cas d'usage. Les pages et composants demandent ici leurs données, déjà traduites.
import { projects } from '../data/projects';
import { events } from '../data/events';
import type { Lang } from '../domain/language';
import { systemsOf, type Project } from '../domain/project';
import type { ProjectEvent } from '../domain/event';
import { inMapOrder, localizeProject } from '../usecases/projects';
import { eventsOfProject, localizeEvent } from '../usecases/events';

/** Systèmes de la star map, dans l'ordre d'apparition. */
export const systems = systemsOf(projects);

/** Slugs des projets (une page chacun). */
export const slugs = projects.map((p) => p.slug);

/** Les projets dans une langue (dans l'ordre du tableau). */
export function getProjects(lang: Lang): Project[] {
	return projects.map((p) => localizeProject(p, lang));
}

/** Les projets dans l'ordre de la carte (système par système) : numéros 01, 02…, mini-carte, précédent / suivant. */
export function getMapOrder(lang: Lang): Project[] {
	return inMapOrder(getProjects(lang));
}

/** Chemins des pages événement : /projects/<projet>/<événement>. */
export const eventPaths = events.map((e) => ({ slug: e.project, event: e.slug }));

/** Les événements dans une langue. */
export function getEvents(lang: Lang): ProjectEvent[] {
	return events.map((e) => localizeEvent(e, lang));
}

/** Les événements d'un projet, dans l'ordre du tableau. */
export function getProjectEvents(project: string, lang: Lang): ProjectEvent[] {
	return eventsOfProject(getEvents(lang), project);
}
