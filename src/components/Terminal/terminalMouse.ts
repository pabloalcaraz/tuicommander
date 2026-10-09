/** SGR mouse reporting is interaction state, scoped to one terminal canvas. */
export function createMouseReporter(options: {
	canvas: HTMLCanvasElement;
	enabled: () => boolean;
	mode: () => { mouseMode: number; sgrMouse: boolean } | null;
	preferSelection?: () => boolean;
	position: (event: MouseEvent) => { col: number; row: number };
	write: (data: string) => void;
	requestFrame?: (callback: FrameRequestCallback) => number;
	cancelFrame?: (id: number) => void;
}) {
	const requestFrame = options.requestFrame ?? requestAnimationFrame;
	const cancelFrame = options.cancelFrame ?? cancelAnimationFrame;
	let pressed: number | null = null;
	let pending: MouseEvent | null = null;
	let frame: number | undefined;
	let lastMotion: string | null = null;

	const reporting = () => {
		const mode = options.mode();
		return options.enabled() && mode !== null && mode.mouseMode > 0 && mode.sgrMouse;
	};
	const ownsTarget = (event: MouseEvent) => event.target instanceof Node && options.canvas.contains(event.target);
	const sequence = (button: number, event: MouseEvent, press = true) => {
		const { col, row } = options.position(event);
		const modifiers = (event.shiftKey ? 4 : 0) | (event.altKey ? 8 : 0) | (event.ctrlKey ? 16 : 0);
		return `\x1b[<${button + modifiers};${col + 1};${row + 1}${press ? "M" : "m"}`;
	};
	const flush = () => {
		if (frame !== undefined) cancelFrame(frame);
		frame = undefined;
		const event = pending;
		pending = null;
		if (!event || !reporting()) return;
		const mode = options.mode()!.mouseMode;
		if (pressed === null && (!ownsTarget(event) || event.shiftKey || mode < 3)) return;
		if (pressed !== null && mode < 2) return;
		const motion = sequence(32 + (pressed ?? 3), event);
		if (motion !== lastMotion) {
			lastMotion = motion;
			options.write(motion);
		}
	};
	const reset = () => {
		if (frame !== undefined) cancelFrame(frame);
		frame = undefined;
		pending = null;
		pressed = null;
		lastMotion = null;
	};

	return {
		press(event: MouseEvent): boolean {
			if (!reporting() || event.shiftKey || !ownsTarget(event)) return false;
			if (event.button === 0 && options.preferSelection?.() && !event.altKey) return false;
			flush();
			pressed = event.button;
			lastMotion = null;
			options.write(sequence(event.button, event));
			return true;
		},
		move(event: MouseEvent): boolean {
			if (!reporting()) {
				reset();
				return false;
			}
			if (pressed === null && (!ownsTarget(event) || event.shiftKey)) {
				pending = null;
				lastMotion = null;
				return false;
			}
			if (pressed === null && options.preferSelection?.() && !event.altKey) return false;
			const mode = options.mode()!.mouseMode;
			if (mode < 3 && pressed === null) return false;
			if (mode >= 3 || (mode >= 2 && pressed !== null)) {
				pending = event;
				if (frame === undefined) frame = requestFrame(flush);
			}
			return true;
		},
		release(event: MouseEvent): boolean {
			if (pressed === null || event.button !== pressed) return false;
			flush();
			if (reporting()) options.write(sequence(pressed, event, false));
			reset();
			return true;
		},
		wheel(event: WheelEvent): boolean {
			if (!reporting() || event.shiftKey || event.deltaY === 0) return false;
			flush();
			options.write(sequence(event.deltaY < 0 ? 64 : 65, event as unknown as MouseEvent));
			return true;
		},
		reset,
	};
}
