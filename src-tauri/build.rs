fn main() {
    // whisper-rs-sys (ggml-metal) uses @available() which emits a call to
    // ___isPlatformVersionAtLeast from libclang_rt. Rust's -nodefaultlibs
    // strips it, so we must link it explicitly on macOS.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos")
        && let Ok(out) = std::process::Command::new("xcrun")
            .args([
                "--sdk",
                "macosx",
                "clang",
                "--print-file-name",
                "libclang_rt.osx.a",
            ])
            .output()
    {
        let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if let Some(dir) = std::path::Path::new(&path).parent() {
            println!("cargo:rustc-link-search=native={}", dir.display());
            println!("cargo:rustc-link-lib=static=clang_rt.osx");
        }
    }

    // Expose git commit hash as BUILD_GIT_HASH for version checks (PWA update detection).
    let hash = std::process::Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .unwrap_or_default();
    println!("cargo:rustc-env=BUILD_GIT_HASH={}", hash.trim());

    // Expose target triple for sidecar path resolution at runtime
    println!(
        "cargo:rustc-env=TUIC_TARGET_TRIPLE={}",
        std::env::var("TARGET").unwrap_or_default()
    );

    #[cfg(feature = "desktop")]
    tauri_build::build();

    // `cargo run`/`tauri dev` never runs the installer, so copy both
    // prepared ConPTY files next to the dev binary directly.
    // portable-pty sideloads conpty.dll from the exe's own directory
    // (src/win/psuedocon.rs::load_conpty()) if present there.
    #[cfg(all(feature = "desktop", windows))]
    {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        let bin_dir = std::path::Path::new(&manifest_dir).join("binaries");
        let target = std::env::var("TARGET").unwrap();
        if let Ok(out_dir) = std::env::var("OUT_DIR") {
            // OUT_DIR = target/<profile>/build/<pkg>-<hash>/out
            if let Some(profile_dir) = std::path::Path::new(&out_dir).ancestors().nth(3) {
                for (source, destination) in [
                    ("conpty.dll".to_string(), "conpty.dll"),
                    (format!("OpenConsole-{target}.exe"), "OpenConsole.exe"),
                ] {
                    let src = bin_dir.join(source);
                    let dest = profile_dir.join(destination);
                    std::fs::copy(&src, &dest).unwrap_or_else(|e| {
                        panic!(
                            "failed to copy {}: {e}; run pnpm prepare:conpty",
                            src.display()
                        )
                    });
                    println!("cargo:rerun-if-changed={}", src.display());
                }
            }
        }
    }
}
