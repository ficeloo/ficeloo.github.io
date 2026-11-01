// Animations de la vue rapprochée : une étape = (durée, pas), enchaînables ; « finish » saute à la
// fin (un clic pendant le zoom l'achève tout de suite).

export type Anim = { finish(): void };

export function createAnimator() {
	let anim: Anim | null = null; // étape en cours

	/** Joue step(t) de t = 0 à 1 en dur ms, puis done. */
	function play(dur: number, step: (t: number) => void, done?: () => void): Anim {
		const t0 = performance.now();
		let raf = 0;
		const a: Anim & { done: boolean } = {
			done: false,
			finish() {
				if (a.done) return;
				a.done = true;
				cancelAnimationFrame(raf);
				step(1);
				if (anim === a) anim = null;
				done?.();
			},
		};
		const tick = (now: number) => {
			const t = Math.min(1, (now - t0) / dur);
			if (t >= 1) a.finish();
			else { step(t); raf = requestAnimationFrame(tick); }
		};
		anim = a;
		step(0);
		raf = requestAnimationFrame(tick);
		return a;
	}
	/** Étapes jouées l'une après l'autre, puis done. */
	function chain(steps: [number, (t: number) => void][], done?: () => void) {
		const next = (k: number) => (k < steps.length ? play(steps[k][0], steps[k][1], () => next(k + 1)) : done?.());
		next(0);
	}
	/** Termine tout ce qui est en cours, enchaînement compris (chaque fin lance l'étape suivante). */
	function skip() {
		while (anim) anim.finish();
	}

	return {
		play,
		chain,
		skip,
		/** Une animation est en cours. */
		get busy() {
			return anim !== null;
		},
	};
}
