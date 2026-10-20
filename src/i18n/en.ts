// Textes de l'interface en anglais : la langue de référence, toutes les clés sont ici.
// {name} est remplacé à l'affichage (voir t() dans src/i18n/index.ts).
// Les valeurs qui contiennent du HTML (<span class="accent">…) sont affichées telles quelles.
export const en = {
	// Balises <title> et meta description
	'meta.home.title': 'ficelo — Junior Game Designer & Developer',
	'meta.home.description': 'Portfolio of ficelo, a junior game designer & developer at 42 Paris. Small games and projects made with Rust, Bevy, C/C++ and Godot.',
	'meta.legal.title': 'Legal Notices — ficelo',
	'meta.legal.description': "Legal notices of ficelo's portfolio: publisher, hosting, personal data and credits.",
	'meta.project.title': '{title} — ficelo',

	// Header
	'nav.work': 'Work',
	'nav.about': 'About',
	'nav.contact': 'Contact',
	'nav.back': 'Back',
	'nav.aria': 'Main',
	'header.indicator': 'Portfolio / {year}',
	'crumb.project': 'Project / {title}',
	'crumb.legal': 'Legal',
	'lang.aria': 'Language',

	// Footer
	'footer.title': 'Let\'s <span class="accent">Talk</span> !',
	'footer.made': 'Made with Astro',
	'footer.legal': 'Legal Notices',

	// Hero
	'hero.learning': 'Currently learning · Rust · Bevy',
	'hero.greeting': "I'm",
	'hero.role': 'a junior game designer & developer.',
	'hero.lede': "With my games, I'm exploring ways to leave a mark. Small projects and a lot of fun — trying to do better every time.",
	'hero.based': 'Based',
	'hero.basedValue': 'Paris, Fr',
	'hero.school': 'School',
	'hero.schoolValue': '42 (In progress)',
	'hero.skilled': 'Skilled in',
	'hero.lookingFor': 'Looking for',
	'hero.lookingForValue': 'Internship / work-study · Available now',
	'hero.ctaWork': 'See my work',
	'hero.ctaHi': 'Say hi !',

	// Star map
	'map.title': '<span class="accent">Discover</span> my Work',
	'map.viewAll': 'View all',
	'map.systems': 'Systems',
	'map.system': '{name} system',
	'map.selected': 'Selected',
	'map.entering': 'Entering system',
	'map.project': '{n} project',
	'map.projects': '{n} projects',
	'map.aboutLink': 'About me',
	'map.touchAria': 'Projects',
	'map.top': 'Back to top',
	'map.prev': 'Prev',
	'map.next': 'Next',
	'map.bottom': 'Go to the bottom of the page',
	'map.close': 'Close',
	'map.viewProject': 'View project',
	'map.zoomAria': 'Project close-up',
	'map.prevPlanet': 'Previous planet',
	'map.nextPlanet': 'Next planet',
	'map.backToMap': 'Back to map',
	'map.targeting': 'Targeting',
	'map.lock': 'Lock',
	'map.keyNavigate': 'navigate',
	'map.keyOpen': 'open',
	'map.keyViewProject': 'view project',
	'map.keyClose': 'close',
	'map.allProjects': 'All <span class="accent">projects</span>',
	'map.filterAll': 'All',

	// Badge des projets en cours
	'badge.inProgress': 'In progress',

	// About
	'about.label': 'About',
	'about.title': 'About <span class="accent">me</span>',
	'about.body': `
		<p>I'm <span class="accent">Théophile</span>, a student at 42 Paris, passionate about game design and game development.</p>
		<p>To me, game development is a pure form of artistic expression: I want to create worlds people can fill their dreams with.</p>
		<p>I build games in <span class="accent">Rust</span> with <span class="accent">Bevy</span>, and dig into graphics programming with <span class="accent">Vulkan</span>.</p>
		<p>I'm looking for a <span class="accent">first internship or work-study position</span> in game development, for at least 6 months — <span class="accent">available now</span>.</p>`,
	'about.moon': 'moon',
	'about.moons': 'moons',
	'about.projectWord': 'project',
	'about.projectsWord': 'projects',

	// Page projet
	'project.file': 'Project file',
	'project.logged': 'Logged',
	'project.overview': 'Overview',
	'project.highlights': 'Highlights',
	'project.body': 'body',
	'project.bodies': 'bodies',
	'project.here': 'You are here',
	'project.stackAria': 'Tech stack: {list}',
	'project.stackOrbit': 'Stack in orbit',
	'project.skillsAria': 'Skills: {list}',
	'project.skillsOrbit': 'Skills in orbit',
	'project.satellites': '{n} satellites',
	'media.rec': 'REC · Gameplay',
	'media.preview': 'Preview',
	'media.prev': 'Previous image',
	'media.next': 'Next image',
	'media.show': 'Show image {n}',
	'media.screenshot': '{title}, screenshot {n}',
	'spec.title': 'Spec sheet',
	'spec.shipped': 'Shipped',
	'spec.done': 'Done',
	'spec.context': 'Context',
	'spec.duration': 'Duration',
	'spec.started': 'Started',
	'spec.released': 'Released',
	'spec.date': 'Date',
	'spec.stack': 'Stack',
	'spec.skills': 'Skills',
	'spec.play': '▷ Play in browser',
	'spec.source': '</> Source code',
	'spec.gdd': '🗎 Game design doc',
	'spec.replay': '▷ Watch the replay',
	'spec.site': '↗ Website',
	'landing.label': 'Landing zone',
	'landing.title': 'Take the controls',
	'landing.browser': '{title} runs right in your browser.',
	'landing.itch': '{title} is available on itch.io.',
	'landing.best': 'Best played on a computer, with a keyboard.',
	'landing.open': 'Open on itch.io ↗',
	'landing.play': 'Play {title}',
	'landing.dialog': '{title}, playable in the browser',
	'landing.build': '{title} · in-browser build',
	'landing.close': 'Close ✕',
	'pager.aria': 'Other projects',
	'pager.prev': 'Previous body',
	'pager.next': 'Next body',

	// Mentions légales
	'legal.title': 'Legal Notices',
	'legal.body': `
		<section>
			<h2>Publisher</h2>
			<address>
				<p>Théophile CROS</p>
				<p>Non-commercial individual</p>
				<p><a href="mailto:contact@ficelo.dev">contact@ficelo.dev</a></p>
			</address>
		</section>

		<section>
			<h2>Host</h2>
			<p>GitHub Pages</p>
			<p>GitHub, Inc., 88 Colin P Kelly Jr St, San Francisco, CA 94107, USA</p>
			<p><a href="https://github.com" target="_blank" rel="noopener noreferrer">https://github.com</a></p>
		</section>

		<section>
			<h2>Personal Data</h2>
			<p>No personal data is collected on this website.</p>
			<p>There are no analytics, cookies, or forms of any kind.</p>
		</section>

		<section>
			<h2>Intellectual property</h2>
			<p>
				All content on this website — including texts, graphics, logos, and source code — is the exclusive property of the website owner, unless otherwise stated.
			</p>
			<p>© 2026 Théophile Cros. All rights reserved.</p>
		</section>

		<section>
			<h2>Credits</h2>
			<p>Syne and Syne Mono (Open Font License, by <a href="https://www.bonjourmonde.net" target="_blank" rel="noopener noreferrer">Bonjour Monde</a>)</p>
			<p>Built with <a href="https://astro.build" target="_blank" rel="noopener noreferrer">Astro</a>.</p>
			<p>Portfolio structure inspired by the <a href="https://generalistprogrammer.com/tutorials/game-development-portfolio-complete-career-guide-2025" target="_blank" rel="noopener noreferrer">Game Development Portfolio Guide</a> (Generalist Programmer).</p>
		</section>`,
};

export type UiKey = keyof typeof en;
