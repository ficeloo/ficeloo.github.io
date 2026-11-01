// Écritures DOM de la carte, seulement quand la valeur change.
// Perf : on mémorise la dernière valeur écrite par élément et on ne touche au DOM
// que si elle change — chaque écriture peut relancer un recalcul côté navigateur.

const written = new WeakMap<object, Map<string, string>>();

/** Vrai si la valeur v de la clé key de el est nouvelle (et la mémorise). */
export const changed = (el: object, key: string, v: string) => {
	let m = written.get(el);
	if (!m) written.set(el, (m = new Map()));
	if (m.get(key) === v) return false;
	m.set(key, v);
	return true;
};

/** Propriété CSS (ou variable --x) en style inline. */
export const css = (el: HTMLElement | SVGElement, prop: string, v: string) => {
	if (changed(el, prop, v)) el.style.setProperty(prop, v);
};

/** Attribut. */
export const attr = (el: Element, name: string, v: string) => {
	if (changed(el, '@' + name, v)) el.setAttribute(name, v);
};

/** Texte. */
export const txt = (el: { textContent: string | null } | null, v: string) => {
	if (el && changed(el, '#text', v)) el.textContent = v;
};
