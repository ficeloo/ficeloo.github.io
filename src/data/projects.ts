import sdGif from '../assets/stellar-drift/gameplay.gif'
import sdMenu from '../assets/stellar-drift/menu.png'
import sdPause from '../assets/stellar-drift/pause.png'
import sdGameOver from '../assets/stellar-drift/game-over.png'
import sdPlaying from '../assets/stellar-drift/gameplay.png'
import ftHome from '../assets/ft-transcendence/home.png'
import ftAccount from '../assets/ft-transcendence/account.png'
import ftChat from '../assets/ft-transcendence/chat.png'
import ftPrivacy from '../assets/ft-transcendence/privacy-policy.png'
import ftGame from '../assets/ft-transcendence/game.png'
import ftWin from '../assets/ft-transcendence/win.png'

import type { ImageMetadata } from 'astro';

// Planète de la page projet. La technique de rendu vient du système (category) ;
// la couleur vient de tokens.css (--planet-<slug>), le reste est l'« ADN » du projet.
interface Planet {
	seed: number; // place les cratères, plaques ou facettes : deux projets d'un même système ne se ressemblent pas
	signature: 'ship' | 'teapot' | 'station' | 'beacon' | 'moon'; // objet emblématique du projet, en orbite
	retrograde?: boolean; // la signature tourne à contre-sens
	belt?: boolean; // ceinture d'astéroïdes
	rings?: number; // Web : 1 anneau par couche du projet (front, back, BDD…), 3 max
}

interface Highlight {
	label: string; // catégorie courte (Physics, Flow…)
	title: string;
	text: string;
}

interface Project {
	slug: string; //identifiant URL
	title: string;
	description: string;
	longDescription?: string;
	category: string; // Système de la star map : les projets y sont regroupés par catégorie
	tag: string;
	year: string;
	pitch: string; // Une phrase sous le titre de la page projet
	context: string; // Solo / équipe, cadre (42, jam…), rôle
	duration?: string;
	stack: string[]; // Technos principales : satellites de la planète + fiche technique
	highlights?: Highlight[];
	planet: Planet;
	inProgress?: boolean; // Projet pas encore terminé : badge « In progress » partout où il apparaît
	image: ImageMetadata; // Image principale (un GIF reste animé, il n'est pas converti)
	alt: string;
	screenshots?: ImageMetadata[]; // Tableau de screenshots
	links: { itch?: string; github?: string; gdd?: string };
	embedUrl?: string; // Pour les projets jouables sur navigateur (WASM)
}

export const projects: Project[] = [
	{
		slug: "stellar-drift",
		title: "Stellar Drift",
		description: "A minimalist project in Rust and Bevy that recreates Atari's Asteroids game.",
		longDescription: `
			<p>
				This project is for educational purposes.<br>
				<br>
				In it, I explore <span class="accent">independent game design</span>. Stellar Drift is intentionally minimalist so that I can focus on practicing the technical stack.<br>
				<br>
				It also allows me to learn the <strong class="accent">ECS</strong> (Entity Component System) and familiarize myself with <strong class="accent">Bevy</strong>, a game engine developed in Rust.<br>
			</p>
			<p>
				I’m incorporating key concepts to gain a deep understanding of the stages of game development.
			</p>`,
		category: "Game",
		tag: "Game  ·  Rust  ·  Arcade",
		year: "June 2026",
		// TODO Théophile : pitch, durée et textes des highlights à réécrire (brouillons tirés de l'ancienne description)
		pitch: "A minimalist remake of Atari's Asteroids, built in Rust with Bevy to learn the ECS from the ground up.",
		context: "Solo · personal project",
		stack: ["Rust", "Bevy", "ECS", "Rapier2D"],
		highlights: [
			{ label: "Physics", title: "Rapier2D integration", text: "A physics system for the ship and the asteroids, using Rapier2D." },
			{ label: "Flow", title: "Game states", text: "Game state management: Menu, Pause and Game." },
			{ label: "Difficulty", title: "Wave progression", text: "Wave-based progression with increasing difficulty." },
			{ label: "Gameplay", title: "Asteroid fragmentation", text: "Asteroids break apart: large → medium → small." },
			{ label: "Feel", title: "Audio integration", text: "Sound effects and music hooked into the game." },
		],
		planet: { seed: 11, signature: "ship", retrograde: true, belt: true },
		image: sdGif,
		alt: "Stellar Drift gameplay: a spaceship shooting at asteroids",
		screenshots: [sdMenu, sdPlaying, sdPause, sdGameOver],
		links: { itch: "https://ficelo.itch.io/stellar-drift", github: "https://github.com/ficeloo/stellar_drift", gdd: "https://github.com/ficeloo/stellar_drift/blob/master/doc/GDD.md" },
		embedUrl: "https://itch.io/embed-upload/17819152?color=191a1c",
	},
	{
		slug: "ft_transcendence",
		title: "Ft_Transcendence",
		description: "A multiplayer web platform built around our custom game, Pixel Fight. Full-stack project exploring real-time networking and authentication.",
		longDescription: `
				<p>
					<em>This project was created as part of the 42 curriculum by dbhujoo, ocgraf, nbacconn, ebenoist, and tcros.</em><br>
					<br>
					In it, we explore <span class="accent">real-time multiplayer web development</span>. ft_transcendence centers around a custom game, Pixel Fight, serving as a playground to implement a robust, full-stack architecture.<br>
					<br>
					It allowed our team to master the <strong class="accent">Nuxt 3</strong> framework (with SSR) for the frontend, while building a hardened, secure DevOps infrastructure.<br>
				</p>
				<p>
					We’re incorporating industry-standard concepts to cover all stages of modern web and game platform development.
				</p>`,
		category: "Web",
		tag: "Web  ·  TypeScript  ·  Full-stack",
		year: "May 2026",
		// TODO Théophile : pitch, rôle dans l'équipe, durée et textes des highlights à réécrire
		pitch: "A real-time multiplayer web platform built around our own game, Pixel Fight.",
		context: "42 · team of 5",
		stack: ["Nuxt 3", "PostgreSQL", "Prisma", "Nginx"],
		highlights: [
			{ label: "Real-time", title: "Multiplayer sessions", text: "Real-time multiplayer game sessions." },
			{ label: "Social", title: "Friends, chat, presence", text: "A social layer with a friends system, chat and live presence tracking." },
			{ label: "Auth", title: "User authentication", text: "User authentication and secure profile management." },
			{ label: "Data", title: "PostgreSQL + Prisma", text: "Data persistence using a PostgreSQL database with Prisma ORM." },
			{ label: "Security", title: "Hardened infrastructure", text: "Advanced security powered by Nginx, ModSecurity and HashiCorp Vault." },
			{ label: "Ops", title: "Full monitoring stack", text: "Prometheus, Grafana, Alertmanager and dedicated exporters." },
		],
		planet: { seed: 5, signature: "station", rings: 3 },
		image: ftHome,
		alt: "Home page of the Ft_Transcendence project",
		screenshots: [ftAccount, ftGame, ftWin, ftChat, ftPrivacy],
		links: { github: "https://github.com/pixel-fight42/ft_transcendance/" },
	},
]
