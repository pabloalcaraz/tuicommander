#!/usr/bin/env node
// Windows-only build dependency; no package manager or additional tooling needed.
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export function prepareConpty({ platform = process.platform, run = execFileSync } = {}) {
  if (platform !== "win32") return;
  const target = run("rustc", ["--print", "host-tuple"], { encoding: "utf8" }).trim();
  run("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
    fileURLToPath(new URL("./windows/prepare-conpty.ps1", import.meta.url)),
    "-TargetTriple", target,
  ], { stdio: "inherit" });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareConpty();
}
