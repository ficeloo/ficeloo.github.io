# Architecture

Le portfolio suit la *Clean Architecture* de Robert C. Martin, adaptée à un site statique Astro :
des couches en cercles, et **les dépendances ne vont que vers l'intérieur**. Le cœur (ce qu'est
un projet, ses règles) ne sait rien d'Astro, du navigateur ni de l'endroit où sont rangées les données.

```
        ┌──────────────────────────────────────────────┐
        │ pages/        main : routes Astro            │
        │ ┌──────────────────────────────────────────┐ │
        │ │ frameworks/  Astro + navigateur          │ │
        │ │ ┌──────────────────────────────────────┐ │ │
        │ │ │ adapters/   catalogue, i18n, images, │ │ │
        │ │ │             couleurs de système      │ │ │
        │ │ │ ┌──────────────────────────────────┐ │ │ │
        │ │ │ │ usecases/  traduire, ordonner    │ │ │ │
        │ │ │ │ ┌──────────────────────────────┐ │ │ │ │
        │ │ │ │ │ domain/  projet, événement,  │ │ │ │ │
        │ │ │ │ │          langues, math       │ │ │ │ │
        │ │ │ │ └──────────────────────────────┘ │ │ │ │
        │ │ │ └──────────────────────────────────┘ │ │ │
        │ │ └──────────────────────────────────────┘ │ │
        │ └──────────────────────────────────────────┘ │
        └──────────────────────────────────────────────┘
  data/  (les projets et événements écrits à la main) : lus seulement par adapters/catalog.ts
```

## Les couches

| Dossier | Rôle | Contient | Peut importer |
|---|---|---|---|
| `domain/` | **Entités** : ce qu'est un projet, un événement, une langue, et leurs règles | `project.ts` (champs, `isEventSystem`, `systemsOf`), `event.ts`, `language.ts` (`Lang`, `Localized`, `pick`), `math.ts`, `format.ts` | rien d'autre (types seulement d'un paquet, ex. `ImageMetadata`) |
| `usecases/` | **Cas d'usage** : ce que le site fait des données, sans savoir d'où elles viennent | `projects.ts` (`localizeProject`, `inMapOrder`), `events.ts` (`localizeEvent`, `eventsOfProject`) : fonctions pures, données reçues en paramètre | `domain` |
| `adapters/` | **Adaptateurs** : traduisent entre le cœur et l'extérieur | `catalog.ts` (seul lecteur de `data/`, donne aux pages des projets traduits : `getProjects`, `getMapOrder`, `getEvents`…), `i18n/` (textes de l'interface, chemins par langue), `images.ts` (`webSrc`), `system-colors.ts` (variables CSS d'un système) | `domain`, `usecases` (+ `data` pour `catalog.ts` seulement) |
| `frameworks/` | **Astro et navigateur** : tout ce qui affiche ou anime | `components/`, `views/`, `layouts/` (Astro), `scripts/` (carte, zoom, planètes, nébuleuses : canvas et DOM), `styles/` (CSS modules, tokens) | `domain`, `usecases`, `adapters`, `assets` |
| `pages/` | **Main** : les routes, seul endroit qui assemble une page entière | une page = un fichier qui appelle une vue de `frameworks/views/` | tout sauf `data/` |
| `data/` | **Les données** (la « base ») : ce que tu édites | `projects.ts`, `events.ts` : des tableaux, rien d'autre | `domain` (les types), `assets` |
| `assets/` | Images des projets | — | — |

`domain/` et `usecases/` restent **purs** : aucun paquet à l'exécution, aucun `document` / `window`.
On peut donc les tester sans navigateur ni build.

## La règle, vérifiée à chaque build

`tools/check-architecture.mjs` (aussi `npm run check:arch`) relit tous les imports de `src/` avant
`astro build` et refuse le build si une dépendance va dans le mauvais sens, avec le fichier, la
ligne et la règle cassée. Les règles sont le tableau `ALLOWED` en haut du script.

## Ajouter quelque chose

- **Un projet ou un événement** : un élément de plus dans `data/projects.ts` ou `data/events.ts`
  (+ son token `--planet-<slug>` dans `frameworks/styles/tokens.css`). Rien d'autre ne change.
- **Un nouveau champ** : le déclarer dans `domain/project.ts` (ou `event.ts`) ; s'il est traduisible,
  le traduire dans `usecases/` (`localizeProject` / `localizeEvent`).
- **Une nouvelle règle** (ex. un nouveau type de système) : dans `domain/`, en fonction pure.
- **Une nouvelle façon de lire les données** (tri, filtre…) : un cas d'usage dans `usecases/`, exposé
  aux pages par `adapters/catalog.ts`.
- **Un composant, une animation** : dans `frameworks/`. Il demande ses données à `adapters/catalog.ts`,
  jamais à `data/`.
- **Une page** : dans `pages/`, qui appelle une vue de `frameworks/views/`.
