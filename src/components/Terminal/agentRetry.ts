/** Bootstrap errors occur before there is an agent prompt to continue. */
export function canScheduleAgentRetry(errorKind: string, pattern: string): boolean {
	return errorKind === "server" && pattern !== "codex-workspace-routing";
}

export interface RetryTarget {
	sessionId: string | null;
	agentType: string | null;
	shellState: string | null;
}

/** Recheck after timer/IPC awaits: a stale timer must never type into a shell. */
export function isAgentRetryTarget(current: RetryTarget, expected: RetryTarget): boolean {
	return (
		!!expected.sessionId &&
		!!expected.agentType &&
		current.sessionId === expected.sessionId &&
		current.agentType === expected.agentType &&
		current.shellState !== "busy"
	);
}
