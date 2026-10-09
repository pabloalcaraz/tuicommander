import { describe, expect, it, vi } from "vitest";
import { createSelectionDrag } from "../../components/Terminal/selectionDrag";

function setup() {
	let tick: FrameRequestCallback | undefined;
	const update = vi.fn();
	const drag = createSelectionDrag(
		update,
		(callback) => {
			tick = callback;
			return 1;
		},
		() => {
			tick = undefined;
		},
	);
	return { drag, update, tick: () => tick?.(0) };
}

describe("selection drag completion", () => {
	it("does not lose a fast drag whose release arrives before the next frame", () => {
		const s = setup();
		s.drag.move(new MouseEvent("mousemove", { clientX: 20, shiftKey: true }));
		const release = new MouseEvent("mouseup", { clientX: 50, shiftKey: false });
		s.drag.finish(release);
		expect(s.update).toHaveBeenCalledExactlyOnceWith(release);
		s.tick();
		expect(s.update).toHaveBeenCalledTimes(1);
	});
	it("coalesces movement and applies the final release position", () => {
		const s = setup();
		s.drag.move(new MouseEvent("mousemove", { clientX: 20 }));
		const last = new MouseEvent("mousemove", { clientX: 30 });
		s.drag.move(last);
		s.tick();
		expect(s.update).toHaveBeenCalledExactlyOnceWith(last);
		const release = new MouseEvent("mouseup", { clientX: 40 });
		s.drag.finish(release);
		expect(s.update).toHaveBeenLastCalledWith(release);
	});
	it("does not replace a double-click word selection when the pointer never moved", () => {
		const s = setup();
		s.drag.finish(new MouseEvent("mouseup"));
		expect(s.update).not.toHaveBeenCalled();
	});
	it("cancels pending work when a terminal is disposed or loses focus", () => {
		const s = setup();
		s.drag.move(new MouseEvent("mousemove"));
		s.drag.reset();
		s.tick();
		s.drag.finish(new MouseEvent("mouseup"));
		expect(s.update).not.toHaveBeenCalled();
	});
});
