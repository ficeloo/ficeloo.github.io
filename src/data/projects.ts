import stellarDriftGif from '../assets/stellar_drift.gif'
import sdMenu from '../assets/MainMenu.png'
import sdPause from '../assets/PauseMenu.png'
import sdGameOver from '../assets/GameOver.png'
import sdPlaying from '../assets/CoreGameplay.png'
import transcendence from '../assets/ft_transcendance.png'
import ftTrAccount from '../assets/ftTrAccount.png'
import ftTrChat from '../assets/ftTrChat.png'
import ftTrPrivPol from '../assets/ftTrPrivPol.png'
import ftTrGame from '../assets/ftTrGame.png'
import ftTrWin from '../assets/ftTrWin.png'

import type { ImageMetadata } from 'astro';

interface Project {
	slug: string; //identifiant URL
	title: string;
	description: string;
	longDescription?: string;
	tag: string;
	year: string;
	image: ImageMetadata; // Image principale
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
			<div>
			I’m incorporating key concepts to gain a deep understanding of the stages of game development.<br>
				<ul style="padding-left: 1.2rem;">
					<li>A physics rendering system, using Rapier2D.</li>
					<li>Game state management (Menu, Pause, Game).</li>
					<li>Wave-based progression with increasing difficulty.</li>
					<li>Asteroid fragmentation (large → medium → small).</li>
					<li>Audio integration.</li>
				</ul>
			</div>`,
		tag: "Game  ·  Rust  ·  Arcade",
		year: "June 2026",
		image: stellarDriftGif,
		alt: "Short video of Stellar Drift gameplay",
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
					In it, we explore <span class="accent">real-time multiplayer web development</span>. ft_transcendance centers around a custom game, Pixel Fight, serving as a playground to implement a robust, full-stack architecture.<br>
					<br>
					It allowed our team to master the <strong class="accent">Nuxt 3</strong> framework (with SSR) for the frontend, while building a hardened, secure DevOps infrastructure.<br>
				</p>
				<div>
					We’re incorporating industry-standard concepts to cover all stages of modern web and game platform development:<br>
					<ul style="padding-left: 1.2rem;">
						<li><strong>Real-time multiplayer</strong> game sessions.</li>
						<li><strong>Social layer</strong> featuring a friends system, chat, and live presence tracking.</li>
						<li><strong>User authentication</strong> and secure profile management.</li>
						<li><strong>Data persistence</strong> using a PostgreSQL database with Prisma ORM.</li>
						<li><strong>Advanced security</strong> powered by Nginx, ModSecurity, and HashiCorp Vault.</li>
						<li><strong>Full monitoring stack</strong> using Prometheus, Grafana, Alertmanager, and dedicated exporters.</li>
					</ul>
				</div>`,
		tag: "Web  ·  TypeScript  ·  Full-stack",
		year: "May 2026",
		image: transcendence,
		alt: "Home page of the Ft_Transcendence project",
		screenshots: [ftTrAccount, ftTrGame, ftTrWin, ftTrChat, ftTrPrivPol],
		links: { github: "https://github.com/pixel-fight42/ft_transcendance/" },
	},
]
