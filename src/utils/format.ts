// Mise en forme des nombres affichés ou écrits dans les styles. Fonctions pures, sans DOM.

/** Numéro sur deux chiffres : 3 → « 03 » (compteurs, numéros de projet). */
export const pad = (n: number) => String(n).padStart(2, '0');

/** Une décimale, pour les px écrits dans les transforms. */
export const f1 = (v: number) => v.toFixed(1);
