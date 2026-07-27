/**
 * Cross-platform path utilities.
 *
 * Handles both `/` (Unix) and `\` (Windows) separators so that
 * paths received from the Rust backend work correctly on all platforms.
 *
 * POLICY: All path comparison and construction in the frontend MUST use these
 * helpers instead of raw string operations. Forbidden patterns:
 *   - `startsWith("/")` to detect absolute paths → use `isAbsolutePath()`
 *   - `path + "/"` or template literals for path joins → use `joinPath()`
 *   - `.split("/").pop()` for basenames → use `pathBasename()`
 *   - `path.startsWith(prefix + "/")` for containment → use `pathStartsWith()`
 *   - `a === b` / `a !== b` to compare two paths → use `pathsEqual()`
 */

const SEP_RE = /[/\\]/;

/** Normalize all backslashes to forward slashes for comparison. */
export function normalizeSep(p: string): string {
	return p.replace(/\\/g, "/");
}

/**
 * Strip the Windows verbatim (extended-length) prefix.
 *
 * `\\?\C:\repo` → `C:\repo`, `\\?\UNC\server\share` → `\\server\share`.
 *
 * The same directory reaches the frontend under three spellings: the directory
 * picker gives `C:\repo`, the git CLI prints `C:/repo`, and anything that went
 * through `std::fs::canonicalize` gives `\\?\C:\repo`. The prefix is stripped at
 * the source in Rust, but persisted stores still hold old verbatim values, so
 * every comparison has to tolerate them.
 */
export function stripVerbatimPrefix(p: string): string {
	// Match both the raw form and one that already had separators normalized.
	const m = /^(?:\\\\\?\\|\/\/\?\/)(.*)$/.exec(p);
	if (!m) return p;
	const rest = m[1];
	const unc = /^UNC[\\/](.*)$/i.exec(rest);
	if (unc) return "\\\\" + unc[1];
	return rest;
}

/**
 * Canonical form for comparing two paths: verbatim prefix stripped, separators
 * normalized, trailing separators dropped, and case-folded for Windows-style
 * paths (drive-letter or UNC), whose filesystems are case-insensitive.
 *
 * Not for display or for handing back to the backend — comparison only.
 */
export function canonicalizeForCompare(p: string): string {
	const stripped = normalizeSep(stripVerbatimPrefix(p)).replace(/\/+$/, "");
	const isWindowsStyle = /^[A-Za-z]:\//.test(stripped) || stripped.startsWith("//");
	return isWindowsStyle ? stripped.toLowerCase() : stripped;
}

/** True when both strings name the same path. Use instead of `===` / `!==`. */
export function pathsEqual(a: string, b: string): boolean {
	return canonicalizeForCompare(a) === canonicalizeForCompare(b);
}

/** True when `p` is an absolute path on any OS. */
export function isAbsolutePath(p: string): boolean {
	if (p.startsWith("/")) return true;
	if (/^[A-Za-z]:[\\/]/.test(p)) return true;
	if (p.startsWith("\\\\")) return true;
	return false;
}

/** True when `path` starts with `prefix` at a directory boundary, separator-agnostic. */
export function pathStartsWith(path: string, prefix: string): boolean {
	const np = canonicalizeForCompare(path);
	const npfx = canonicalizeForCompare(prefix);
	if (!npfx) return true;
	return np === npfx || np.startsWith(npfx + "/");
}

/** Strip `prefix` from `path` at a directory boundary. Returns the relative portion, or `null` if `path` does not start with `prefix`. Separators are normalized to `/` in the result. */
export function pathStripPrefix(path: string, prefix: string): string | null {
	// Match on the canonical form, but slice the separator-normalized path so the
	// returned remainder keeps its original casing. `np` and `cp` are trailing-slash
	// stripped the same way, so they share indices (case folding never resizes).
	const np = normalizeSep(stripVerbatimPrefix(path)).replace(/\/+$/, "");
	const cp = canonicalizeForCompare(path);
	const cpfx = canonicalizeForCompare(prefix);
	if (cp === cpfx) return "";
	if (cp.startsWith(cpfx + "/")) return np.slice(cpfx.length + 1);
	return null;
}

/** Join path segments, stripping trailing/leading separators between parts. */
export function joinPath(base: string, ...parts: string[]): string {
	let result = base.replace(/[\\/]+$/, "");
	for (const part of parts) {
		if (!part) continue;
		result += "/" + part.replace(/^[\\/]+/, "");
	}
	return result;
}

/** Split a path into segments by either separator. */
export function pathParts(p: string): string[] {
	return p.split(SEP_RE).filter(Boolean);
}

/** Get the last segment of a path (filename or directory name). */
export function pathBasename(p: string): string {
	const parts = pathParts(p);
	return parts.length > 0 ? parts[parts.length - 1] : "";
}

/** Get the directory portion of a path, preserving the original separator. */
export function pathDirname(p: string): string {
	const lastSep = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
	return lastSep < 0 ? "" : p.slice(0, lastSep);
}

/** Replace the last segment (basename) of a path, preserving the original separator. */
export function replaceBasename(p: string, newName: string): string {
	const lastSep = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
	if (lastSep < 0) return newName;
	return p.slice(0, lastSep + 1) + newName;
}
