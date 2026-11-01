// Couleurs d'un système de la star map (tokens.css : --system-<catégorie en minuscules>,
// --rgb-system-…, --rgb-nebula-…). Système sans token : couleurs neutres du site.
// Fonctions pures (chaînes CSS) : utilisées au build (pages, carte) comme dans le navigateur.

/** Clé des tokens d'un système : « Game » → « game ». */
export const systemKey = (category: string) => category.toLowerCase();

/** Teinte du système. */
export const systemColor = (category: string) => `var(--system-${systemKey(category)}, var(--color-secondary))`;

/** Teinte du système en canaux RGB, pour rgba(…, alpha). */
export const systemRgb = (category: string) => `var(--rgb-system-${systemKey(category)}, var(--rgb-secondary))`;

/** Teinte pastel de sa nébuleuse, en canaux RGB. */
export const nebulaRgb = (category: string) => `var(--rgb-nebula-${systemKey(category)}, var(--rgb-secondary))`;

/** Variables --sys / --sys-rgb d'une page projet ou événement (lueur de fond, nom du système, mini-carte). */
export const systemStyle = (category: string) => `--sys: ${systemColor(category)}; --sys-rgb: ${systemRgb(category)}`;
