// Textures des nébuleuses de la star map : trois calques (halo de fond, gaz, voile de poussière)
// calculés pixel par pixel une seule fois — dans un worker (nebula.worker.ts), hors du fil
// principal — puis seulement déplacés par transform. Une seule tache au bord irrégulier,
// brumeuse (floutée à la génération), avec de légers filaments.
// Pas de DOM ici : uniquement du calcul sur des tableaux de pixels RGBA.

export type Rgb = [number, number, number];
export type NebulaJob = {
	g: number; // n° du système
	seed: number;
	size: number; // côté des textures, en pixels
	vivid: Rgb; // teinte du système (--rgb-system-…)
	pastel: Rgb; // sa version pastel (--rgb-nebula-…)
	deep: Rgb; // fond le plus profond (--rgb-bg-deep), pour la poussière sombre
};
export type NebulaLayers = { back: Uint8ClampedArray<ArrayBuffer>; mid: Uint8ClampedArray<ArrayBuffer>; front: Uint8ClampedArray<ArrayBuffer> };
type Px = [number, number, number, number] | null;

// ---------- bruit ----------
function hash2(x: number, y: number, s: number) {
	let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967295;
}
function noise(x: number, y: number, s: number) {
	const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
	const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
	const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
	return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, s: number, oct: number) {
	let sum = 0, amp = 0.5, f = 1, norm = 0;
	for (let o = 0; o < oct; o++) {
		sum += amp * noise(x * f, y * f, s + o * 17);
		norm += amp;
		amp *= 0.5;
		f *= 2.03;
	}
	return sum / norm;
}
const smooth = (a: number, b: number, x: number) => {
	const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};
function seeded(seed: number) {
	let s = seed * 9301 + 49297;
	return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// ---------- enveloppe : une seule tache centrée, bord irrégulier ----------
// (nx, ny) dans [-1, 1] ; renvoie la densité 0 → 1, jamais coupée par le bord de l'image.
function envelope(s: number, grow = 1) {
	const R = 0.84 * grow;
	return (nx: number, ny: number) => {
		const x = nx + (fbm(nx * 2.2 + 31, ny * 2.2 + 31, s + 41, 3) - 0.5) * 0.35;
		const y = ny + (fbm(nx * 2.2 - 17, ny * 2.2 + 5, s + 53, 3) - 0.5) * 0.35;
		const r = Math.hypot(x, y), th = Math.atan2(y, x);
		const re = R * (1 + 0.28 * (fbm(Math.cos(th) * 1.4 + 7, Math.sin(th) * 1.4 + 7, s + 3, 4) - 0.5) * 2);
		return smooth(re, re * 0.1, r) * smooth(1, 0.82, Math.hypot(nx, ny));
	};
}

// ---------- pixels ----------
function paint(N: number, fn: (nx: number, ny: number) => Px) {
	const data = new Uint8ClampedArray(N * N * 4);
	for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
		const px = fn((i / N - 0.5) * 2, (j / N - 0.5) * 2);
		if (!px) continue;
		data.set(px, (j * N + i) * 4);
	}
	return data;
}

// Flou : box blur séparable sur couleurs prémultipliées (sinon les bords transparents
// noircissent) ; 2 passes ≈ gaussien.
function blur(data: Uint8ClampedArray, N: number, r: number) {
	const P = new Float32Array(N * N * 4), T = new Float32Array(N * N * 4), w = 2 * r + 1;
	for (let k = 0; k < data.length; k += 4) {
		const a = data[k + 3] / 255;
		P[k] = data[k] * a;
		P[k + 1] = data[k + 1] * a;
		P[k + 2] = data[k + 2] * a;
		P[k + 3] = data[k + 3];
	}
	const pass = (src: Float32Array, dst: Float32Array, horiz: boolean) => {
		for (let line = 0; line < N; line++) for (let c = 0; c < 4; c++) {
			const at = (b: number) => (horiz ? line * N + b : b * N + line) * 4 + c;
			let acc = 0;
			for (let b = 0; b < r; b++) acc += src[at(b)];
			for (let b = 0; b < N; b++) {
				if (b + r < N) acc += src[at(b + r)];
				if (b - r - 1 >= 0) acc -= src[at(b - r - 1)];
				dst[at(b)] = acc / w;
			}
		}
	};
	for (let n = 0; n < 2; n++) {
		pass(P, T, true);
		pass(T, P, false);
	}
	for (let k = 0; k < data.length; k += 4) {
		const a = P[k + 3];
		if (a < 0.5) {
			data[k + 3] = 0;
			continue;
		}
		data[k] = (P[k] * 255) / a;
		data[k + 1] = (P[k + 1] * 255) / a;
		data[k + 2] = (P[k + 2] * 255) / a;
		data[k + 3] = a;
	}
}

// Pose un pixel par-dessus un autre (mélange « source-over » classique).
function over(dst: Uint8ClampedArray, k: number, r: number, g: number, b: number, a: number) {
	const sa = a / 255, da = dst[k + 3] / 255, oa = sa + da * (1 - sa);
	if (oa <= 0) return;
	dst[k] = (r * sa + dst[k] * da * (1 - sa)) / oa;
	dst[k + 1] = (g * sa + dst[k + 1] * da * (1 - sa)) / oa;
	dst[k + 2] = (b * sa + dst[k + 2] * da * (1 - sa)) / oa;
	dst[k + 3] = oa * 255;
}

export function paintNebula({ seed: s, size: N, vivid, pastel, deep }: NebulaJob): NebulaLayers {
	const env = envelope(s), envBig = envelope(s, 1.06);
	const br = (r: number) => Math.max(1, Math.round((r * N) / 288)); // rayons de flou réglés pour 288 px
	const warp = (nx: number, ny: number, sc: number) => {
		let x = nx * sc + 10, y = ny * sc + 10;
		x += (fbm(x + 3.1, y + 1.7, s + 11, 4) - 0.5) * 2.8;
		y += (fbm(x - 2.3, y + 4.9, s + 23, 4) - 0.5) * 2.8;
		return [x, y];
	};

	// Fond : halo profond, teinte vive assombrie, qui enveloppe le gaz.
	const halo = vivid.map((v, i) => v + (deep[i] - v) * 0.35);
	const back = paint(N, (nx, ny) => {
		const e = envBig(nx, ny);
		if (e <= 0) return null;
		const d = e * (0.6 + 0.4 * fbm(nx * 1.3 + 5, ny * 1.3 + 5, s + 61, 3));
		return [halo[0], halo[1], halo[2], d * 0.24 * 255];
	});
	blur(back, N, br(6));

	// Milieu : volutes douces, teinte vive → pastel, à peine éclaircie au cœur ; puis flouté.
	const mid = paint(N, (nx, ny) => {
		const e = env(nx, ny);
		if (e <= 0) return null;
		const [x, y] = warp(nx, ny, 1.8);
		let q = fbm(x, y, s, 4);
		q = q + (Math.pow(1 - Math.abs(2 * q - 1), 3) - q) * 0.2;
		const d = smooth(0.02, 0.85, e * (0.45 * e * e + 0.55 * q));
		const lift = Math.pow(d, 1.6);
		const col = pastel.map((p, ch) => {
			const base = (vivid[ch] + p) / 2;
			return lift < 0.5 ? base + (p - base) * lift * 2 : p + (255 - p) * (lift - 0.5) * 0.5;
		});
		return [col[0], col[1], col[2], d * 0.4 * 255];
	});
	blur(mid, N, br(4));
	// Filaments légers, posés par-dessus le gaz flouté (à peine adoucis).
	const fil = paint(N, (nx, ny) => {
		const e = env(nx, ny);
		if (e <= 0.1) return null;
		const [x, y] = warp(nx, ny, 2.1);
		const f = Math.pow(1 - Math.abs(2 * fbm(x, y, s + 5, 5) - 1), 10) * e * e;
		if (f < 0.02) return null;
		return [pastel[0], pastel[1], pastel[2], f * 0.22 * 255];
	});
	blur(fil, N, 1);
	for (let k = 0; k < fil.length; k += 4) if (fil[k + 3]) over(mid, k, fil[k], fil[k + 1], fil[k + 2], fil[k + 3]);
	// Quelques étoiles naissantes, petites et discrètes : cœur blanc → pastel → transparent.
	const rnd = seeded(s);
	const knots: [number, number][] = [];
	for (let n = 0; n < 60 && knots.length < 3; n++) {
		const x = (rnd() - 0.5) * 1.1, y = (rnd() - 0.5) * 1.1;
		if (env(x, y) > 0.9) knots.push([x, y]);
	}
	const kr = N * 0.025;
	for (const [x, y] of knots) {
		const cx = (x / 2 + 0.5) * N, cy = (y / 2 + 0.5) * N;
		for (let j = Math.max(0, Math.floor(cy - kr)); j <= Math.min(N - 1, Math.ceil(cy + kr)); j++) {
			for (let i = Math.max(0, Math.floor(cx - kr)); i <= Math.min(N - 1, Math.ceil(cx + kr)); i++) {
				const t = Math.hypot(i + 0.5 - cx, j + 0.5 - cy) / kr;
				if (t >= 1) continue;
				const k = (j * N + i) * 4;
				if (t < 0.18) {
					const m = t / 0.18;
					over(mid, k, 255 + (pastel[0] - 255) * m, 255 + (pastel[1] - 255) * m, 255 + (pastel[2] - 255) * m, (0.6 - 0.35 * m) * 255);
				} else over(mid, k, pastel[0], pastel[1], pastel[2], 0.25 * (1 - (t - 0.18) / 0.82) * 255);
			}
		}
	}

	// Devant : voile de poussière sombre, bords très doux, lisière de lumière diffuse.
	const front = paint(N, (nx, ny) => {
		const e = env(nx * 1.05, ny * 1.05);
		if (e <= 0.05) return null;
		const [x, y] = warp(nx, ny, 2.2);
		const v = fbm(x + 40, y + 40, s + 77, 4);
		const dust = smooth(0.5, 0.78, v) * e * e;
		const rim = (smooth(0.42, 0.52, v) - smooth(0.52, 0.62, v)) * e;
		if (dust > rim) return [deep[0], deep[1], deep[2], dust * 0.3 * 255];
		if (rim > 0.02) return [pastel[0], pastel[1], pastel[2], rim * 0.12 * 255];
		return null;
	});
	blur(front, N, br(5));

	return { back, mid, front };
}
