import { describe, expect, it } from "vitest";
import { canScheduleAgentRetry, isAgentRetryTarget } from "../../components/Terminal/agentRetry";

describe("agent error retries", () => {
	it("does not send continue for Codex bootstrap failures or authentication failures", () => {
		expect(canScheduleAgentRetry("server", "codex-workspace-routing")).toBe(false);
		expect(canScheduleAgentRetry("auth", "claude-auth-error")).toBe(false);
		expect(canScheduleAgentRetry("server", "claude-api-error")).toBe(true);
	});
	it("abandons a timer when its agent exited, changed session or started working", () => {
		const expected = { sessionId: "s1", agentType: "codex", shellState: "idle" };
		expect(isAgentRetryTarget({ ...expected, agentType: null }, expected)).toBe(false);
		expect(isAgentRetryTarget({ ...expected, sessionId: "s2" }, expected)).toBe(false);
		expect(isAgentRetryTarget({ ...expected, shellState: "busy" }, expected)).toBe(false);
		expect(isAgentRetryTarget(expected, expected)).toBe(true);
	});
});
