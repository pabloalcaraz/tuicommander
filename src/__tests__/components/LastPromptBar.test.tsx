import { fireEvent, render, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LastPromptBar } from "../../components/Terminal/LastPromptBar";
import { writeClipboard } from "../../utils/clipboard";

vi.mock("../../utils/clipboard", () => ({ writeClipboard: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../stores/appLogger", () => ({ appLogger: { warn: vi.fn() } }));

describe("LastPromptBar", () => {
	beforeEach(() => vi.clearAllMocks());

	it("copies the exact multiline prompt without collapsing it", async () => {
		const prompt = "Arregla la selección\nConserva los acentos: áéí";
		const { getByRole, getByText } = render(() => <LastPromptBar prompt={() => prompt} />);
		fireEvent.click(getByRole("button", { name: "Toggle last prompt" }));
		fireEvent.click(getByText(prompt, { normalizer: (text) => text }));
		expect(getByRole("button", { name: "Toggle last prompt" }).getAttribute("aria-expanded")).toBe("true");
		fireEvent.click(getByRole("button", { name: "Copy last prompt" }));
		await waitFor(() => expect(writeClipboard).toHaveBeenCalledWith(prompt));
		expect(getByRole("button", { name: "Toggle last prompt" }).getAttribute("aria-expanded")).toBe("true");
	});

	it("exposes a failed copy so the user can retry", async () => {
		vi.mocked(writeClipboard).mockRejectedValueOnce(new Error("Clipboard unavailable"));
		const { getByRole } = render(() => <LastPromptBar prompt={() => "Revisa el código"} />);
		const copy = getByRole("button", { name: "Copy last prompt" });
		fireEvent.click(copy);
		await waitFor(() => expect(copy.getAttribute("title")).toContain("Copy failed"));
		fireEvent.click(copy);
		await waitFor(() => expect(copy.getAttribute("title")).toBe("Copied"));
	});
});
