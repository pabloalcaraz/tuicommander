import { describe, expect, it, vi } from "vitest";
import { createMouseReporter } from "../../components/Terminal/terminalMouse";

function setup(mouseMode = 3, sgrMouse = true, preferSelection = false) {
	const canvas = document.createElement("canvas");
	const other = document.createElement("div");
	let enabled = true;
	let mode = { mouseMode, sgrMouse };
	let tick: FrameRequestCallback | undefined;
	const write = vi.fn();
	const reporter = createMouseReporter({
		canvas,
		enabled: () => enabled,
		mode: () => mode,
		preferSelection: () => preferSelection,
		position: (e) => ({ col: e.clientX ?? 0, row: e.clientY ?? 0 }),
		write,
		requestFrame: (callback) => {
			tick = callback;
			return 1;
		},
		cancelFrame: () => {
			tick = undefined;
		},
	});
	const event = (target: HTMLElement = canvas, init: MouseEventInit = {}) => {
		const e = new MouseEvent("mousemove", { clientX: 44, clientY: 41, ...init });
		Object.defineProperty(e, "target", { value: target });
		return e;
	};
	return {
		reporter,
		write,
		event,
		canvas,
		other,
		tick: () => tick?.(0),
		disable: () => {
			enabled = false;
		},
		mode: (next: typeof mode) => {
			mode = next;
		},
	};
}

describe("terminal mouse isolation", () => {
	it("prefers local selection in agents while preserving Alt-drag and wheel", () => {
		const s = setup(3, true, true);
		expect(s.reporter.press(s.event())).toBe(false);
		expect(s.reporter.move(s.event())).toBe(false);
		expect(s.reporter.press(s.event(s.canvas, { altKey: true }))).toBe(true);
		expect(s.reporter.release(s.event(s.canvas))).toBe(true);
		expect(s.reporter.wheel(new WheelEvent("wheel", { deltaY: 1 }))).toBe(true);
		expect(s.write.mock.calls.map(([data]) => data)).toEqual(["\x1b[<8;45;42M", "\x1b[<0;45;42m", "\x1b[<65;1;1M"]);
	});
	it("never forwards document events over another pane or a hidden terminal", () => {
		const s = setup();
		expect(s.reporter.move(s.event(s.other))).toBe(false);
		s.tick();
		s.reporter.move(s.event());
		s.disable();
		s.tick();
		expect(s.write).not.toHaveBeenCalled();
	});
	it("requires negotiated SGR for every event type", () => {
		const s = setup(3, false);
		expect(s.reporter.press(s.event())).toBe(false);
		expect(s.reporter.move(s.event())).toBe(false);
		expect(s.reporter.release(s.event())).toBe(false);
		expect(s.reporter.wheel(new WheelEvent("wheel", { deltaY: 1 }))).toBe(false);
		s.tick();
		expect(s.write).not.toHaveBeenCalled();
	});
	it("coalesces motion, deduplicates cells, and encodes the pressed button", () => {
		const s = setup();
		for (let x = 1; x <= 44; x++) s.reporter.move(s.event(s.canvas, { clientX: x }));
		expect(s.write).not.toHaveBeenCalled();
		s.tick();
		expect(s.write).toHaveBeenLastCalledWith("\x1b[<35;45;42M");
		s.reporter.move(s.event());
		s.tick();
		expect(s.write).toHaveBeenCalledTimes(1);
		s.reporter.press(s.event(s.canvas, { button: 0, buttons: 1 }));
		s.reporter.move(s.event(s.canvas, { buttons: 1 }));
		s.reporter.release(s.event(s.canvas, { button: 0 }));
		expect(s.write.mock.calls.slice(-3).map(([data]) => data)).toEqual([
			"\x1b[<0;45;42M",
			"\x1b[<32;45;42M",
			"\x1b[<0;45;42m",
		]);
	});
	it("does not release another pane's click, and preserves ownership across modifier changes", () => {
		const s = setup(2);
		expect(s.reporter.release(s.event(s.other))).toBe(false);
		expect(s.reporter.move(s.event(s.canvas, { buttons: 1 }))).toBe(false);
		s.reporter.press(s.event());
		expect(s.reporter.release(s.event(s.other, { shiftKey: true }))).toBe(true);
		expect(s.write).toHaveBeenLastCalledWith("\x1b[<4;45;42m");
	});
	it("drops a pending motion when reporting is disabled before the frame", () => {
		const s = setup();
		s.reporter.move(s.event());
		s.mode({ mouseMode: 0, sgrMouse: false });
		s.tick();
		expect(s.write).not.toHaveBeenCalled();
	});
});
