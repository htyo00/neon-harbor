// NEON HARBOR — make.fun gta6-01 entry program (Node 22, standard library only).
// The playable game lives in game/ as plain static files a desktop browser can
// load offline (game/index.html plus its ES modules and the vendored three.js
// build under game/three.module.js). This program hands the entry in: it copies
// game/ and screenshots/ from beside this file into the output directory and
// writes output/dossier.json, the summary the judge reads, using the vendored
// make.fun library. Run it with MAKEFUN_OUTPUT_DIR set outside the grader:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Serve the game locally while building with `node serve.ts`, then open
// http://localhost:8080.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The cover is the first screenshot by name, and the scorer refuses any
// screenshot over 256 KiB — check both before handing the entry in, so a
// bad capture fails loudly here instead of silently at the scorer.
const shotDir = join(here, 'screenshots');
const shotNames = existsSync(shotDir)
  ? readdirSync(shotDir).filter((n) => /\.(png|jpe?g|webp)$/i.test(n)).sort()
  : [];
if (shotNames.length === 0 || shotNames.length > 4) {
  throw new Error(`expected 1-4 screenshots in screenshots/, found ${shotNames.length}`);
}
for (const n of shotNames) {
  const size = statSync(join(shotDir, n)).size;
  if (size > 262144) throw new Error(`screenshot ${n} is ${size} bytes, over the 256 KiB cap`);
}
console.log(`screenshots OK: ${shotNames.join(', ')} (cover: ${shotNames[0]})`);

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files in all, or a path under game/ over 1000 bytes).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
