// Worker des nébuleuses : calcule les textures d'un système (nebula-texture.ts) hors du fil
// principal, pour que la carte ne saccade jamais pendant la génération, et renvoie les pixels
// sans copie (tampons transférés).
import { paintNebula, type NebulaJob } from './nebula-texture';

const scope = self as unknown as {
	onmessage: ((e: MessageEvent<NebulaJob>) => void) | null;
	postMessage(message: unknown, transfer: Transferable[]): void;
};

scope.onmessage = (e) => {
	const layers = paintNebula(e.data);
	scope.postMessage({ g: e.data.g, ...layers }, [layers.back.buffer, layers.mid.buffer, layers.front.buffer]);
};
