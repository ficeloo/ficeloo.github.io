// Petits outils de calcul partagés (carte, zoom, planètes, nébuleuses). Fonctions pures, sans DOM :
// utilisables au build, dans le navigateur et dans le worker des nébuleuses.

/** v ramené entre a et b. */
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** De a (t = 0) à b (t = 1). */
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 0 avant a, 1 après b, transition douce entre les deux. */
export const smoothstep = (a: number, b: number, x: number) => {
	const t = clamp((x - a) / (b - a), 0, 1);
	return t * t * (3 - 2 * t);
};

/** Accélère puis freine (cubique). */
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Part vite puis freine (cubique). */
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Bruit stable entre 0 et 1 : même entrée, même valeur. */
export const hash = (a: number, b = 1) => {
	const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
	return x - Math.floor(x);
};
