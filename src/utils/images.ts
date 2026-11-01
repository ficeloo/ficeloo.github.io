// Images des projets, préparées au build (astro:assets).
import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';

/** URL de l'image en webp à la largeur donnée. Un GIF est servi tel quel : la conversion lui ferait perdre son animation. */
export async function webSrc(img: ImageMetadata, width: number) {
	return img.format === 'gif' ? img.src : (await getImage({ src: img, width, format: 'webp' })).src;
}
