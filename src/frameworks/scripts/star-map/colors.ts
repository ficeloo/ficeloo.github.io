// Couleurs des tokens (tokens.css) en nombres, pour les calculs de la carte (textures, mélanges).
import type { Rgb } from './nebula-texture';

const root = () => getComputedStyle(document.documentElement);

/** Canaux d'un token --rgb-* : « 255, 90, 200 » → [255, 90, 200]. */
export const rgbOf = (name: string) => root().getPropertyValue(name).split(',').map(Number);

/** Idem, avec la couleur neutre du site si le token n'existe pas (système sans couleur). */
export const tokenRgb = (name: string) => (root().getPropertyValue(name) ? rgbOf(name) : rgbOf('--rgb-secondary')) as Rgb;

/** Mélange de a vers b (k de 0 à 1), en chaîne « r, g, b » pour rgba(). */
export const mixRgb = (a: number[], b: number[], k: number) => a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(', ');
