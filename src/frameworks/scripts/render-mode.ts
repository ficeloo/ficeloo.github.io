// Mode de rendu du navigateur.
// Sans carte graphique (vieux PC, machine virtuelle, bureau à distance, ou Chrome qui a coupé
// l'accélération après un souci de pilote), le navigateur dessine tout au processeur avec un
// moteur logiciel : certains effets gratuits pour une carte graphique deviennent alors très
// coûteux. On le détecte au nom du moteur WebGL (SwiftShader pour Chrome, llvmpipe sous Linux…).
// Rien ne s'exécute à l'import.

let soft: boolean | undefined;

/** Vrai si le navigateur dessine sans carte graphique. Inconnu (WebGL indisponible) : faux. */
export function softwareRendering() {
	if (soft !== undefined) return soft;
	soft = false;
	try {
		const gl = document.createElement('canvas').getContext('webgl');
		if (gl) {
			const info = gl.getExtension('WEBGL_debug_renderer_info');
			const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
			soft = /swiftshader|llvmpipe|softpipe|basic render|software/i.test(name);
			gl.getExtension('WEBGL_lose_context')?.loseContext(); // libère le contexte tout de suite
		}
	} catch {
		// détection impossible : on garde le rendu normal
	}
	return soft;
}
