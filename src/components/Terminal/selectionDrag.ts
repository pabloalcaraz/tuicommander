/** Finish a drag with its final position even if mouseup beats the next frame. */
export function createSelectionDrag(
	update: (event: MouseEvent) => void,
	requestFrame = requestAnimationFrame,
	cancelFrame = cancelAnimationFrame,
) {
	let frame: number | undefined;
	let pending: MouseEvent | null = null;
	let moved = false;
	const reset = () => {
		if (frame !== undefined) cancelFrame(frame);
		frame = undefined;
		pending = null;
		moved = false;
	};
	return {
		reset,
		move(event: MouseEvent) {
			moved = true;
			pending = event;
			if (frame === undefined) {
				frame = requestFrame(() => {
					frame = undefined;
					const next = pending;
					pending = null;
					if (next) update(next);
				});
			}
		},
		finish(event: MouseEvent) {
			const shouldUpdate = moved;
			reset();
			if (shouldUpdate) update(event);
		},
	};
}
