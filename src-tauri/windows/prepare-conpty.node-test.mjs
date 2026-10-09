import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { prepareConpty } from "../prepare-conpty.mjs";

const script = fileURLToPath(new URL("./prepare-conpty.ps1", import.meta.url));
const windows = process.platform === "win32";

test("non-Windows builds do not require Rust, PowerShell or network access", () => {
  for (const platform of ["linux", "darwin"]) {
    prepareConpty({ platform, run() { assert.fail("must not start a process"); } });
  }
});

test("Windows passes the detected Rust target as a separate argument", () => {
  const calls = [];
  prepareConpty({ platform: "win32", run(command, args) {
    calls.push([command, args]);
    if (command === "rustc") return "aarch64-pc-windows-msvc\r\n";
  } });
  assert.equal(calls[1][0], "powershell.exe");
  assert.deepEqual(calls[1][1].slice(-2), ["-TargetTriple", "aarch64-pc-windows-msvc"]);
  assert.equal(calls[1][1][calls[1][1].indexOf("-File") + 1], script);
});

function scratch(t) {
  const root = resolve(tmpdir());
  const directory = mkdtempSync(join(root, "tuic-conpty-test-"));
  t.after(() => {
    assert.equal(dirname(directory), root);
    assert.ok(basename(directory).startsWith("tuic-conpty-test-"));
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

function prepare(args) {
  return execFileSync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, ...args,
  ], { encoding: "utf8", stdio: "pipe" });
}

test("corrupt packages are refused without overwriting existing binaries", { skip: !windows }, (t) => {
  const directory = scratch(t);
  const archive = join(directory, "corrupt.nupkg");
  const dll = join(directory, "conpty.dll");
  writeFileSync(archive, "invalid package");
  writeFileSync(dll, "previous binary");
  assert.throws(() => prepare(["-ArchivePath", archive, "-BinariesDir", directory]),
    /checksum mismatch/);
  assert.equal(readFileSync(dll, "utf8"), "previous binary");
});

test("unsupported targets fail before downloading", { skip: !windows }, () => {
  assert.throws(() => prepare(["-TargetTriple", "unsupported-target"]), /ValidateSet|validation/i);
});

test("verified package restores binaries and repairs a corrupt cache", {
  skip: !windows || !process.env.CONPTY_TEST_ARCHIVE,
}, (t) => {
  const directory = scratch(t);
  const archive = resolve(process.env.CONPTY_TEST_ARCHIVE);
  for (const target of ["x86_64", "i686", "aarch64"]) {
    const args = ["-ArchivePath", archive, "-BinariesDir", directory,
      "-TargetTriple", `${target}-pc-windows-msvc`];
    assert.match(prepare(args), /Prepared ConPTY/);
    assert.match(prepare(args), /already verified/);
    writeFileSync(join(directory, "conpty.dll"), "corrupted cache");
    assert.match(prepare(args), /Prepared ConPTY/);
  }
});
