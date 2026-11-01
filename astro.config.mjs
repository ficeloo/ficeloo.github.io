// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://ficelo.dev',
	// Anglais à la racine (/), français sous /fr/. Langues : src/domain/language.ts, textes de l'interface : src/adapters/i18n/.
	i18n: {
		locales: ['en', 'fr'],
		defaultLocale: 'en',
		routing: { prefixDefaultLocale: false },
	},
});
