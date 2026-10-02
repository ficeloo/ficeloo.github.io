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

interface Project {
	slug: string; //identifiant URL
	title: string;
	description: string;
	longDescription?: string;
	category: string; // Système de la star map : les projets y sont regroupés par catégorie
	tag: string;
	year: string;
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
			<div>
			I’m incorporating key concepts to gain a deep understanding of the stages of game development.<br>
				<ul style="padding-left: 1.2rem;">
					<li>A physics system, using Rapier2D.</li>
					<li>Game state management (Menu, Pause, Game).</li>
					<li>Wave-based progression with increasing difficulty.</li>
					<li>Asteroid fragmentation (large → medium → small).</li>
					<li>Audio integration.</li>
				</ul>
			</div>`,
		category: "Game",
		tag: "Game  ·  Rust  ·  Arcade",
		year: "June 2026",
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
		category: "Web",
		tag: "Web  ·  TypeScript  ·  Full-stack",
		year: "May 2026",
		image: ftHome,
		alt: "Home page of the Ft_Transcendence project",
		screenshots: [ftAccount, ftGame, ftWin, ftChat, ftPrivacy],
		links: { github: "https://github.com/pixel-fight42/ft_transcendance/" },
	},
]
