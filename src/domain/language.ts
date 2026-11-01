// Langues du contenu. L'anglais est la langue de référence : un texte peut n'exister qu'en anglais.
// (Libellés des langues, publication et textes de l'interface : src/adapters/i18n.)

export const langs = ['en', 'fr'] as const;
export type Lang = (typeof langs)[number];
export const defaultLang: Lang = 'en';

// Texte de contenu (projects.ts, events.ts) : une simple chaîne = anglais seulement,
// ou une version par langue. Une langue absente s'affiche en anglais.
export type Localized = string | ({ [L in typeof defaultLang]: string } & { [L in Lang]?: string });

/** Le texte dans la langue voulue (anglais si cette version manque). */
export function pick(text: Localized, lang: Lang): string;
export function pick(text: Localized | undefined, lang: Lang): string | undefined;
export function pick(text: Localized | undefined, lang: Lang) {
	if (text === undefined || typeof text === 'string') return text;
	return text[lang] ?? text[defaultLang];
}
