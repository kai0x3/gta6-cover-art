// Vice Cover Studio — gta6-cover-art-01 entry program (Node 22, standard library only).
//
// This program hands the app in: it copies this repository's app/ and screenshots/
// folders into the output directory and writes /output/dossier.json, the summary the
// judge reads, using the vendored make.fun library (vendor/makefun-app.ts, the kit's
// copy, unchanged). Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   MAKEFUN_OUTPUT_DIR=/tmp/cover-art-out node main.ts
//
// The program is deterministic: given the same repository it writes the same bytes
// every run, so the grader's two runs match byte for byte.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

// The repository root is the folder holding this file.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Everything the entry ships lives in app/ (the web app) and screenshots/ (its
// screenshots). Both are copied verbatim, so what the judge sees is exactly what
// is in the repository.
const appSource = join(repoRoot, 'app');
const shotsSource = join(repoRoot, 'screenshots');
const appTarget = join(outputDir, 'app');
const shotsTarget = join(outputDir, 'screenshots');

mkdirSync(outputDir, { recursive: true });
cpSync(appSource, appTarget, { recursive: true });
mkdirSync(shotsTarget, { recursive: true });
if (existsSync(shotsSource)) {
  for (const name of readdirSync(shotsSource)) {
    const from = join(shotsSource, name);
    if (statSync(from).isFile()) cpSync(from, join(shotsTarget, name));
  }
}

// The gate's caps, as the kit's reference/gate.json states them: the dossier text
// is capped at 160 KiB, at most 4 screenshots of at most 256 KiB each, app/ at most
// 993 files and 48 MiB, and no path under app/ over 1000 bytes. buildDossier refuses
// an entry that breaks them, so a bad entry fails here instead of at the gate.
const dossier = buildDossier(resolve(outputDir), {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});

writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`Wrote ${outputDir}/dossier.json (${dossier.length} bytes).`);
