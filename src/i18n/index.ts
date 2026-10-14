import { en, type UiKey } from './en';
import { fr } from './fr';

// Langues du site. L'anglais est à la racine (/), les autres sous /<code>/ (voir astro.config.mjs).
// live: false → les pages de la langue sont générées (pour traduire en local), mais
// aucun lien n'y mène et elles sont exclues des moteurs de recherche.
export const languages = {
	en: { label: 'English', short: 'EN', live: true },
	fr: { label: 'Français', short: 'FR', live: false },
} as const;

export type Lang = keyof typeof languages;
export const defaultLang: Lang = 'en';
export const langs = Object.keys(languages) as Lang[];

const dictionaries: Record<Lang, Partial<Record<UiKey, string>>> = { en, fr };

/** Langue de la page, depuis Astro.currentLocale. */
export function getLang(locale: string | undefined): Lang {
	return locale && locale in languages ? (locale as Lang) : defaultLang;
}

/** t('map.system', { name: 'Game' }) → « Game system ». Clé non traduite → texte anglais. */
export function useTranslations(lang: Lang) {
	return (key: UiKey, vars: Record<string, string | number> = {}) =>
		(dictionaries[lang][key] ?? en[key]).replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Chemin du site dans une langue : localizePath('/projects/scop', 'fr') → '/fr/projects/scop'. */
export function localizePath(path: string, lang: Lang) {
	if (lang === defaultLang) return path;
	return `/${lang}${path.startsWith('/') ? path : `/${path}`}`;
}

/** La même page dans une autre langue (pour le sélecteur de langue). */
export function switchPath(pathname: string, to: Lang) {
	const prefix = langs.find((l) => l !== defaultLang && (pathname === `/${l}` || pathname.startsWith(`/${l}/`)));
	const base = prefix ? pathname.slice(prefix.length + 1) || '/' : pathname;
	return localizePath(base, to);
}

// Texte de contenu (projects.ts) : une simple chaîne = anglais seulement,
// ou une version par langue. Une langue absente s'affiche en anglais.
export type Localized = string | ({ [L in typeof defaultLang]: string } & { [L in Lang]?: string });

export function pick(text: Localized, lang: Lang): string;
export function pick(text: Localized | undefined, lang: Lang): string | undefined;
export function pick(text: Localized | undefined, lang: Lang) {
	if (text === undefined || typeof text === 'string') return text;
	return text[lang] ?? text[defaultLang];
}
