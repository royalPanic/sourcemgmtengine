#!/usr/bin/env node
/**
 * Stages the `yt-dlp` sidecar so `tauri build` can bundle it.
 *
 * Tauri looks for `src-tauri/binaries/yt-dlp-<target-triple><ext>` when a
 * binary is listed in `bundle.externalBin`. That file is a downloaded
 * third-party executable, so it is not committed — this script fetches it from
 * the official yt-dlp release for the current platform.
 *
 * Usage:
 *   node scripts/fetch-yt-dlp.mjs           # stage for the host platform
 *   node scripts/fetch-yt-dlp.mjs --force   # re-download even if present
 *
 * Development note: the app also accepts a yt-dlp on `PATH`, so `tauri dev`
 * works without running this script.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(repoRoot, 'src-tauri', 'binaries');

const force = process.argv.includes('--force');

/** Maps the Node platform/arch onto a yt-dlp release asset name. */
function releaseAsset() {
  const { platform, arch } = process;
  if (platform === 'win32') {
    return { url: 'yt-dlp.exe' };
  }
  if (platform === 'darwin') {
    return { url: 'yt-dlp_macos' };
  }
  if (platform === 'linux') {
    return { url: arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux' };
  }
  throw new Error(`Unsupported platform: ${platform}`);
}

/** Reads the Rust host target triple, which Tauri uses in sidecar names. */
function hostTriple() {
  const out = execFileSync('rustc', ['-vV'], { encoding: 'utf8' });
  const match = out.match(/^host:\s*(\S+)$/m);
  if (!match) throw new Error('Could not determine the Rust host target triple');
  return match[1];
}

const { url } = releaseAsset();
const triple = hostTriple();
const ext = process.platform === 'win32' ? '.exe' : '';
const targetPath = join(outDir, `yt-dlp-${triple}${ext}`);

if (existsSync(targetPath) && !force) {
  console.log(`yt-dlp sidecar already staged at ${targetPath}`);
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

const downloadUrl = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${url}`;
console.log(`Downloading ${downloadUrl}`);

const response = await fetch(downloadUrl, { redirect: 'follow' });
if (!response.ok || !response.body) {
  throw new Error(`Download failed: ${response.status} ${response.statusText}`);
}

await pipeline(response.body, createWriteStream(targetPath));

// The binaries must be executable on Unix-like hosts.
if (process.platform !== 'win32') {
  chmodSync(targetPath, 0o755);
}

console.log(`Staged yt-dlp sidecar at ${targetPath}`);
