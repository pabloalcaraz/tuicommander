import { describe, expect, it } from "vitest";
import {
	canonicalizeForCompare,
	isAbsolutePath,
	joinPath,
	normalizeSep,
	pathBasename,
	pathDirname,
	pathParts,
	pathStartsWith,
	pathStripPrefix,
	pathsEqual,
	replaceBasename,
	stripVerbatimPrefix,
} from "../../utils/pathUtils";

// ---------------------------------------------------------------------------
// isAbsolutePath
// ---------------------------------------------------------------------------

describe("isAbsolutePath", () => {
	it("Unix absolute paths", () => {
		expect(isAbsolutePath("/")).toBe(true);
		expect(isAbsolutePath("/usr/bin")).toBe(true);
		expect(isAbsolutePath("/Users/dev/project")).toBe(true);
	});

	it("Windows drive-letter paths", () => {
		expect(isAbsolutePath("C:\\Users\\dev")).toBe(true);
		expect(isAbsolutePath("D:/DATA/repos")).toBe(true);
		expect(isAbsolutePath("c:\\lowercase")).toBe(true);
	});

	it("UNC paths", () => {
		expect(isAbsolutePath("\\\\server\\share")).toBe(true);
		expect(isAbsolutePath("\\\\?\\C:\\extended")).toBe(true);
	});

	it("relative paths return false", () => {
		expect(isAbsolutePath("")).toBe(false);
		expect(isAbsolutePath("foo/bar")).toBe(false);
		expect(isAbsolutePath("src\\main.rs")).toBe(false);
		expect(isAbsolutePath("plans/feature.md")).toBe(false);
		expect(isAbsolutePath("./relative")).toBe(false);
		expect(isAbsolutePath("../parent")).toBe(false);
	});

	it("edge: bare drive letter without separator is not absolute", () => {
		expect(isAbsolutePath("C:")).toBe(false);
		expect(isAbsolutePath("C:relative")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// normalizeSep
// ---------------------------------------------------------------------------

describe("normalizeSep", () => {
	it("converts backslashes to forward slashes", () => {
		expect(normalizeSep("C:\\Users\\dev")).toBe("C:/Users/dev");
		expect(normalizeSep("a\\b\\c")).toBe("a/b/c");
	});

	it("leaves forward slashes unchanged", () => {
		expect(normalizeSep("/foo/bar")).toBe("/foo/bar");
	});

	it("handles mixed separators", () => {
		expect(normalizeSep("C:\\Users/dev\\project")).toBe("C:/Users/dev/project");
	});

	it("handles empty string", () => {
		expect(normalizeSep("")).toBe("");
	});
});

// ---------------------------------------------------------------------------
// stripVerbatimPrefix
// ---------------------------------------------------------------------------

describe("stripVerbatimPrefix", () => {
	it("strips the drive-letter verbatim prefix", () => {
		expect(stripVerbatimPrefix("\\\\?\\C:\\Users\\Pablo\\Proyectos\\standapp")).toBe(
			"C:\\Users\\Pablo\\Proyectos\\standapp",
		);
	});

	it("rewrites the verbatim UNC prefix to a plain UNC path", () => {
		expect(stripVerbatimPrefix("\\\\?\\UNC\\server\\share\\repo")).toBe("\\\\server\\share\\repo");
	});

	it("also handles a verbatim prefix whose separators were already normalized", () => {
		expect(stripVerbatimPrefix("//?/C:/repo")).toBe("C:/repo");
		expect(stripVerbatimPrefix("//?/UNC/server/share")).toBe("\\\\server/share");
	});

	it("leaves non-verbatim paths untouched", () => {
		expect(stripVerbatimPrefix("C:\\repo")).toBe("C:\\repo");
		expect(stripVerbatimPrefix("/home/pablo/repo")).toBe("/home/pablo/repo");
		// A genuine UNC path is not verbatim.
		expect(stripVerbatimPrefix("\\\\server\\share")).toBe("\\\\server\\share");
		expect(stripVerbatimPrefix("")).toBe("");
	});
});

// ---------------------------------------------------------------------------
// canonicalizeForCompare / pathsEqual
// ---------------------------------------------------------------------------

describe("canonicalizeForCompare", () => {
	it("case-folds Windows-style paths", () => {
		expect(canonicalizeForCompare("C:\\Users\\Pablo\\Repo")).toBe("c:/users/pablo/repo");
		expect(canonicalizeForCompare("\\\\Server\\Share")).toBe("//server/share");
	});

	it("preserves case on Unix paths, whose filesystems are case-sensitive", () => {
		expect(canonicalizeForCompare("/Users/Pablo/Repo")).toBe("/Users/Pablo/Repo");
	});

	it("drops trailing separators", () => {
		expect(canonicalizeForCompare("/repo///")).toBe("/repo");
		expect(canonicalizeForCompare("C:\\repo\\")).toBe("c:/repo");
	});
});

describe("pathsEqual", () => {
	// The regression this whole helper exists for: `git worktree list` prints
	// `C:/repo`, the directory picker gives `C:\repo`, and anything that went
	// through `std::fs::canonicalize` gives `\\?\C:\repo`. A raw `!==` read those
	// as three different directories and closed the main checkout's terminals.
	it("treats the three Windows spellings of one directory as equal", () => {
		const picker = "C:\\Users\\Pablo\\Proyectos\\standapp";
		const gitCli = "C:/Users/Pablo/Proyectos/standapp";
		const verbatim = "\\\\?\\C:\\Users\\Pablo\\Proyectos\\standapp";

		expect(pathsEqual(picker, gitCli)).toBe(true);
		expect(pathsEqual(picker, verbatim)).toBe(true);
		expect(pathsEqual(gitCli, verbatim)).toBe(true);
	});

	it("ignores drive-letter and path casing on Windows paths", () => {
		expect(pathsEqual("c:\\users\\pablo\\repo", "C:\\Users\\Pablo\\Repo")).toBe(true);
	});

	it("respects casing on Unix paths", () => {
		expect(pathsEqual("/Users/Pablo/repo", "/users/pablo/repo")).toBe(false);
	});

	it("distinct directories stay distinct", () => {
		expect(pathsEqual("C:\\repo\\a", "C:\\repo\\b")).toBe(false);
		expect(pathsEqual("C:\\repo", "D:\\repo")).toBe(false);
		// A sibling whose name merely shares a prefix is not the same directory.
		expect(pathsEqual("C:\\repo", "C:\\repository")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// pathStartsWith
// ---------------------------------------------------------------------------

describe("pathStartsWith", () => {
	it("Unix: path inside prefix", () => {
		expect(pathStartsWith("/Users/dev/project/src", "/Users/dev/project")).toBe(true);
	});

	it("Unix: exact match", () => {
		expect(pathStartsWith("/Users/dev/project", "/Users/dev/project")).toBe(true);
	});

	it("Unix: partial directory name is NOT a match", () => {
		expect(pathStartsWith("/Users/develop", "/Users/dev")).toBe(false);
	});

	it("Windows: backslash path inside prefix", () => {
		expect(pathStartsWith("C:\\DATA\\repos\\arcane\\src", "C:\\DATA\\repos\\arcane")).toBe(true);
	});

	it("Windows: exact match", () => {
		expect(pathStartsWith("C:\\DATA\\repos", "C:\\DATA\\repos")).toBe(true);
	});

	it("mixed separators: Windows prefix, forward-slash path", () => {
		expect(pathStartsWith("C:/DATA/repos/arcane", "C:\\DATA\\repos")).toBe(true);
	});

	it("mixed separators: forward prefix, backslash path", () => {
		expect(pathStartsWith("C:\\DATA\\repos\\arcane", "C:/DATA/repos")).toBe(true);
	});

	it("prefix with trailing separator", () => {
		expect(pathStartsWith("/repo/src/file.ts", "/repo/")).toBe(true);
		expect(pathStartsWith("C:\\repo\\src", "C:\\repo\\")).toBe(true);
	});

	it("no match returns false", () => {
		expect(pathStartsWith("/other/path", "/repo")).toBe(false);
		expect(pathStartsWith("D:\\other", "C:\\repo")).toBe(false);
	});

	it("empty prefix matches everything", () => {
		expect(pathStartsWith("/any/path", "")).toBe(true);
	});

	it("tolerates a verbatim prefix on either side", () => {
		expect(pathStartsWith("\\\\?\\C:\\repo\\src", "C:\\repo")).toBe(true);
		expect(pathStartsWith("C:\\repo\\src", "\\\\?\\C:\\repo")).toBe(true);
	});

	it("ignores casing on Windows paths but not on Unix paths", () => {
		expect(pathStartsWith("C:\\REPO\\src", "c:\\repo")).toBe(true);
		expect(pathStartsWith("/REPO/src", "/repo")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// pathStripPrefix
// ---------------------------------------------------------------------------

describe("pathStripPrefix", () => {
	it("Unix: strips prefix and returns relative path", () => {
		expect(pathStripPrefix("/repo/src/file.ts", "/repo")).toBe("src/file.ts");
	});

	it("Unix: exact match returns empty", () => {
		expect(pathStripPrefix("/repo", "/repo")).toBe("");
	});

	it("Windows: strips prefix with backslashes", () => {
		expect(pathStripPrefix("C:\\DATA\\repos\\arcane\\src\\main.rs", "C:\\DATA\\repos\\arcane")).toBe("src/main.rs");
	});

	it("mixed separators", () => {
		expect(pathStripPrefix("C:\\repo\\src\\file.ts", "C:/repo")).toBe("src/file.ts");
	});

	it("no match: returns null", () => {
		expect(pathStripPrefix("/other/path/file.ts", "/repo")).toBeNull();
	});

	it("prefix with trailing separator", () => {
		expect(pathStripPrefix("/repo/src/file.ts", "/repo/")).toBe("src/file.ts");
	});

	it("partial directory name is NOT stripped", () => {
		expect(pathStripPrefix("/Users/develop/file", "/Users/dev")).toBeNull();
	});

	it("matches across verbatim and casing differences", () => {
		expect(pathStripPrefix("\\\\?\\C:\\repo\\src\\file.ts", "C:\\repo")).toBe("src/file.ts");
		expect(pathStripPrefix("C:\\REPO\\src\\file.ts", "c:\\repo")).toBe("src/file.ts");
	});

	it("returns the remainder with its original casing, not the folded form", () => {
		expect(pathStripPrefix("C:\\repo\\Src\\Main.rs", "C:\\repo")).toBe("Src/Main.rs");
	});
});

// ---------------------------------------------------------------------------
// joinPath
// ---------------------------------------------------------------------------

describe("joinPath", () => {
	it("joins Unix segments", () => {
		expect(joinPath("/repo", "src", "file.ts")).toBe("/repo/src/file.ts");
	});

	it("joins Windows base with relative parts", () => {
		expect(joinPath("C:\\DATA\\repos", "plans", "feature.md")).toBe("C:\\DATA\\repos/plans/feature.md");
	});

	it("strips trailing separators from base", () => {
		expect(joinPath("/repo/", "src")).toBe("/repo/src");
		expect(joinPath("C:\\repo\\", "src")).toBe("C:\\repo/src");
	});

	it("strips leading separators from parts", () => {
		expect(joinPath("/repo", "/src", "/file.ts")).toBe("/repo/src/file.ts");
		expect(joinPath("/repo", "\\src")).toBe("/repo/src");
	});

	it("skips empty parts", () => {
		expect(joinPath("/repo", "", "file.ts")).toBe("/repo/file.ts");
	});

	it("single argument returns without trailing separator", () => {
		expect(joinPath("/repo/")).toBe("/repo");
	});

	it("joins nested relative path in one part", () => {
		expect(joinPath("C:\\DATA\\tests", ".claude/active-plan.json")).toBe("C:\\DATA\\tests/.claude/active-plan.json");
	});
});

// ---------------------------------------------------------------------------
// pathBasename (existing + Windows cases)
// ---------------------------------------------------------------------------

describe("pathBasename", () => {
	it("extracts basename from Unix paths", () => {
		expect(pathBasename("/foo/bar/baz.txt")).toBe("baz.txt");
		expect(pathBasename("docs/readme.md")).toBe("readme.md");
		expect(pathBasename("file.txt")).toBe("file.txt");
	});

	it("extracts basename from Windows paths", () => {
		expect(pathBasename("C:\\Users\\foo\\bar.txt")).toBe("bar.txt");
		expect(pathBasename("docs\\readme.md")).toBe("readme.md");
	});

	it("handles mixed separators", () => {
		expect(pathBasename("foo/bar\\baz.txt")).toBe("baz.txt");
	});

	it("handles empty/root paths", () => {
		expect(pathBasename("")).toBe("");
		expect(pathBasename("/")).toBe("");
	});
});

// ---------------------------------------------------------------------------
// pathDirname (existing + Windows cases)
// ---------------------------------------------------------------------------

describe("pathDirname", () => {
	it("extracts directory from Unix paths", () => {
		expect(pathDirname("/foo/bar/baz.txt")).toBe("/foo/bar");
		expect(pathDirname("docs/readme.md")).toBe("docs");
	});

	it("extracts directory from Windows paths", () => {
		expect(pathDirname("C:\\Users\\foo\\bar.txt")).toBe("C:\\Users\\foo");
		expect(pathDirname("docs\\readme.md")).toBe("docs");
	});

	it("returns empty for files without directory", () => {
		expect(pathDirname("file.txt")).toBe("");
		expect(pathDirname("")).toBe("");
	});
});

// ---------------------------------------------------------------------------
// pathParts
// ---------------------------------------------------------------------------

describe("pathParts", () => {
	it("splits Unix paths", () => {
		expect(pathParts("foo/bar/baz")).toEqual(["foo", "bar", "baz"]);
	});

	it("splits Windows paths", () => {
		expect(pathParts("foo\\bar\\baz")).toEqual(["foo", "bar", "baz"]);
	});

	it("splits Windows absolute paths", () => {
		expect(pathParts("C:\\Users\\dev")).toEqual(["C:", "Users", "dev"]);
	});

	it("handles single segment", () => {
		expect(pathParts("file.txt")).toEqual(["file.txt"]);
	});
});

// ---------------------------------------------------------------------------
// replaceBasename
// ---------------------------------------------------------------------------

describe("replaceBasename", () => {
	it("replaces last segment in Unix path", () => {
		expect(replaceBasename("docs/old.md", "new.md")).toBe("docs/new.md");
	});

	it("replaces last segment in Windows path", () => {
		expect(replaceBasename("docs\\old.md", "new.md")).toBe("docs\\new.md");
	});

	it("handles single-segment path", () => {
		expect(replaceBasename("old.md", "new.md")).toBe("new.md");
	});
});
