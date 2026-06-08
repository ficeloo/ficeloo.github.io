import stellarDriftGif from '../assets/stellar_drift.gif'
import sdMenu from '../assets/MainMenu.png'
import sdPause from '../assets/PauseMenu.png'
import sdGameOver from '../assets/GameOver.png'
import sdPlaying from '../assets/CoreGameplay.png'
import transcendence from '../assets/ft_transcendance.png'

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
			This project is for educational purposes.
			
			In it, I explore independent game design. Stellar Drift is intentionally minimalist so that I can focus on practicing the technical stack.
			
			It also allows me to learn the <strong>ECS</strong> (Entity Component System) and familiarize myself with **Bevy**, a game engine developed in Rust.
			
			I’m incorporating key concepts to gain a deep understanding of the stages of game development, such as:
			- A physics rendering system, using Rapier2D.
			- Game state management (Menu, Pause, Game).
			- Wave-based progression with increasing difficulty.
			- Asteroid fragmentation (large → medium → small).
			- Audio integration.`,
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
		tag: "Web  ·  TypeScript  ·  Full-stack",
		year: "May 2026",
		image: transcendence,
		alt: "Home page of the Ft_Transcendence project",
		links: { github: "https://github.com/pixel-fight42/ft_transcendance/" },
	},
]
