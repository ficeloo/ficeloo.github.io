// Vérifie le sens des dépendances entre les couches de src/ (voir src/ARCHITECTURE.md).
// Lancé avant chaque build (npm run build) et seul avec npm run check:arch. Aucune dépendance npm.
// Sortie en erreur (code 1) à la première règle cassée, avec fichier:ligne et la règle.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

// Couche → couches qu'elle peut importer. Une couche n'importe que vers l'intérieur.
const ALLOWED = {
	domain: ['domain'],
	usecases: ['domain', 'usecases'],
	adapters: ['domain', 'usecases', 'adapters'],
	data: ['domain', 'assets'],
	frameworks: ['domain', 'usecases', 'adapters', 'frameworks', 'assets'],
	pages: ['domain', 'usecases', 'adapters', 'frameworks', 'pages', 'assets'],
};
// Seul le catalogue lit les données (src/data) : tout le reste passe par lui.
const DATA_GATEWAY = 'adapters/catalog.ts';
// Couches pures : pas de paquet externe à l'exécution (types seulement), pas de navigateur.
const PURE = new Set(['domain', 'usecases']);
const BROWSER = /\b(document|window|navigator|localStorage|requestAnimationFrame)\s*[.(]/;

const IMPORT = /(?:^|[\s;])(import\s+type\s|import\s|export\s+(?:type\s+)?\{[^}]*\}\s+from\s|export\s+\*\s+from\s)[^'"]*?(['"])([^'"]+)\2|import\(\s*(['"])([^'"]+)\4|new URL\(\s*(['"])([^'"]+)\6/g;

const files = [];
(function walk(dir) {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p);
		else if (/\.(ts|astro|mjs|js)$/.test(name)) files.push(p);
	}
})(SRC);

const layerOf = (abs) => relative(SRC, abs).split(sep)[0];
const errors = [];

for (const file of files) {
	const rel = relative(SRC, file).split(sep).join('/');
	const layer = layerOf(file);
	const rules = ALLOWED[layer];
	if (!rules) continue; // assets…
	const text = readFileSync(file, 'utf8');
	const lineOf = (i) => text.slice(0, i).split('\n').length;

	for (const m of text.matchAll(IMPORT)) {
		const spec = m[3] ?? m[5] ?? m[7];
		const typeOnly = /^import\s+type\s/.test(m[1] ?? '') || /^export\s+type\s/.test(m[1] ?? '');
		const at = `src/${rel}:${lineOf(m.index)}`;
		if (!spec.startsWith('.')) {
			if (PURE.has(layer) && !typeOnly) errors.push(`${at} — ${layer} doit rester pur : « ${spec} » seulement en import type`);
			continue;
		}
		const target = layerOf(resolve(dirname(file), spec));
		if (target === 'data' && rel !== DATA_GATEWAY && layer !== 'data') {
			errors.push(`${at} — src/data se lit seulement par src/${DATA_GATEWAY} (importer depuis adapters/catalog)`);
		} else if (target !== 'data' && !rules.includes(target)) {
			errors.push(`${at} — ${layer} ne peut pas dépendre de ${target} (autorisé : ${rules.join(', ')})`);
		}
	}
	if (PURE.has(layer)) {
		const code = text.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
		const hit = BROWSER.exec(code);
		if (hit) errors.push(`src/${rel} — ${layer} doit rester pur : « ${hit[1]} » (navigateur) interdit`);
	}
}

if (errors.length) {
	console.error(`Architecture : ${errors.length} dépendance(s) dans le mauvais sens\n` + errors.map((e) => `  ✗ ${e}`).join('\n'));
	process.exit(1);
}
console.log(`Architecture : ${files.length} fichiers vérifiés, dépendances dans le bon sens.`);
