// Éléments de la star map, créés une seule fois : chemins (SVG), systèmes (anneau, nom), nœuds
// des projets, poussière, éléments du saut hyperspace ; plus les références du « chrome » rendu au
// build par StarMap.astro (compteur, HUD, nav des systèmes, touches). Le rendu ne fait ensuite que
// les déplacer (render.ts).
import { hash } from '../../../domain/math';
import { nebulaRgb, systemRgb } from '../../../adapters/system-colors';
import { ACCENT } from './colors';
import type { Proj, Text } from './types';

/** onNode(i) : clic sur le nœud ou le nom du projet i. */
export function buildMap(root: HTMLElement, mapLayer: HTMLElement, styles: Record<string, string>, projects: Proj[], cats: string[], text: Text, onNode: (i: number) => void) {
	const NS = 'http://www.w3.org/2000/svg';
	const svg = document.createElementNS(NS, 'svg');
	svg.setAttribute('class', styles.paths);
	const mkPath = (dash?: string, w = '1') => {
		const p = document.createElementNS(NS, 'path');
		p.setAttribute('fill', 'none');
		p.style.stroke = 'rgba(var(--rgb-secondary), 0.6)';
		p.setAttribute('stroke-width', w);
		p.setAttribute('vector-effect', 'non-scaling-stroke'); // trait constant malgré le zoom du <g>
		if (dash) {
			p.setAttribute('stroke-dasharray', dash);
			p.setAttribute('stroke-linecap', 'round');
		}
		return p;
	};
	const legPath = mkPath('2 7', '1.2');
	const sysPath = mkPath();
	const sysTPath = mkPath(undefined, '1.5');
	sysTPath.style.stroke = ACCENT;
	sysTPath.setAttribute('stroke-opacity', '0.75');
	const legTPath = mkPath('2 7', '1.2');
	legTPath.style.stroke = ACCENT;
	legTPath.setAttribute('stroke-opacity', '0.8');
	// Chemins en coordonnées "monde", construits une fois ; seul le <g> bouge (caméra).
	const pathsG = document.createElementNS(NS, 'g');
	pathsG.append(legPath, sysPath, sysTPath, legTPath);
	svg.appendChild(pathsG);
	mapLayer.appendChild(svg);

	// Systèmes : anneau et nom.
	const groupEls = cats.map((c) => {
		const ring = document.createElement('div');
		ring.className = styles.ring;
		ring.style.borderColor = `rgba(${systemRgb(c)}, 0.35)`;
		const label = document.createElement('div');
		label.className = styles['sys-label'];
		mapLayer.appendChild(ring);
		mapLayer.appendChild(label);
		return { ring, label };
	});

	const nodeEls = projects.map((pr, idx) => {
		const dot = document.createElement('div');
		dot.className = styles.node;
		const label = document.createElement('div');
		label.className = styles['node-label'];
		const numSpan = document.createElement('span');
		numSpan.className = styles.num;
		numSpan.textContent = pr.num;
		label.append(numSpan, document.createTextNode('  ' + pr.title));
		const onClick = () => onNode(idx);
		dot.addEventListener('click', onClick);
		label.addEventListener('click', onClick);
		mapLayer.appendChild(dot);
		mapLayer.appendChild(label);
		return { dot, label };
	});

	// Largeur réelle de chaque étiquette, pour 1 px de police (mesurée au canvas, sans relire la mise
	// en page) : l'étiquette se place du côté où elle tient, ou passe sur deux lignes.
	const ruler = document.createElement('canvas').getContext('2d')!;
	const labelEm: number[] = [];
	function measureLabels() {
		ruler.font = `100px ${getComputedStyle(nodeEls[0].label).fontFamily}`;
		nodeEls.forEach(({ label }, q) => {
			const t = (label.textContent ?? '').replace(/\s+/g, ' ').toUpperCase();
			labelEm[q] = (ruler.measureText(t).width + t.length * 14) / 100; // + letter-spacing 0.14em
		});
	}
	measureLabels();

	// Poussière (16 grains par système).
	// Taille/opacité fixes ; position monde (wx, wy) recalculée au relayout.
	const dustEls: { el: HTMLElement; g: number; d: number; o: number; sz: number; wx: number; wy: number }[] = [];
	for (let g = 0; g < cats.length; g++) {
		for (let d = 0; d < 16; d++) {
			const el = document.createElement('div');
			el.className = styles.dust;
			const sz = hash(d * 11.3 + g) < 0.8 ? 2 : 3;
			el.style.width = sz + 'px';
			el.style.height = sz + 'px';
			el.style.background = `rgb(${nebulaRgb(cats[g])})`;
			mapLayer.appendChild(el);
			dustEls.push({ el, g, d, o: 0.25 + hash(d * 7.9 + g * 3) * 0.45, sz, wx: 0, wy: 0 });
		}
	}

	// Saut hyperspace : sonde, pulse d'arrivée, carte d'arrivée.
	const probeEl = document.createElement('div');
	probeEl.className = styles.probe;
	const pulseEl = document.createElement('div');
	pulseEl.className = styles.pulse;
	mapLayer.appendChild(probeEl);
	mapLayer.appendChild(pulseEl);

	const arrivalEl = document.createElement('div');
	arrivalEl.className = styles.arrival;
	const arrLabel = document.createElement('div');
	arrLabel.className = styles['arrival-label'];
	arrLabel.textContent = text.entering;
	const arrTitle = document.createElement('div');
	arrTitle.className = styles['arrival-title'];
	const arrNum = document.createElement('span');
	arrNum.className = styles.num;
	const arrName = document.createTextNode('');
	arrTitle.append(arrNum, arrName);
	const arrCount = document.createElement('div');
	arrCount.className = styles['arrival-count'];
	arrivalEl.append(arrLabel, arrTitle, arrCount);
	mapLayer.appendChild(arrivalEl);

	// Références du chrome (rendu côté serveur dans StarMap.astro).
	const counterEl = root.querySelector<HTMLElement>('[data-counter]');
	const hudEl = root.querySelector<HTMLElement>('[data-hud]');
	const hud = {
		cat: root.querySelector<HTMLElement>('[data-hud-cat]'),
		img: root.querySelector<HTMLImageElement>('[data-hud-img]'),
		title: root.querySelector<HTMLElement>('[data-hud-title]'),
		tag: root.querySelector<HTMLElement>('[data-hud-tag]'),
		year: root.querySelector<HTMLElement>('[data-hud-year]'),
		wip: root.querySelector<HTMLElement>('[data-hud-wip]'),
	};
	const navRows = Array.from(root.querySelectorAll<HTMLElement>('[data-nav-row]'));
	const navBars = navRows.map((r) => r.querySelector<HTMLElement>('[data-nav-bar]'));

	const keysEl = root.querySelector<HTMLElement>('[data-keys]');
	const keyEnds = [...root.querySelectorAll<HTMLButtonElement>('[data-keys] [data-key^="Arrow"]')];
	const goPrev = root.querySelector<HTMLButtonElement>('[data-go="prev"]');
	const goNext = root.querySelector<HTMLButtonElement>('[data-go="next"]');

	return {
		svg, pathsG, sysPath, legPath, sysTPath, legTPath,
		groupEls, nodeEls, dustEls,
		labelEm, // largeur des étiquettes des nœuds pour 1 px de police (measureLabels)
		measureLabels,
		probeEl, pulseEl, arrivalEl, arrTitle, arrNum, arrName, arrCount,
		counterEl, hudEl, hud, navRows, navBars, keysEl, keyEnds, goPrev, goNext,
	};
}

export type MapEls = ReturnType<typeof buildMap>;
