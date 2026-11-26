// Basalt Horizon — main.ts
// The hand-in program for the Make.fun "Make the best flight game" bounty.
// Node 22, standard library only, no build step: `node main.ts` writes the
// entry to /output (or MAKEFUN_OUTPUT_DIR when set, for local runs).
//
// What it hands in:
//   game/         the playable game as static files a desktop browser loads
//                 offline (game/index.html plus its own ES modules; no
//                 library, no network request, no external asset)
//   screenshots/  four JPEG renders of the game's own code, the first by
//                 name the cover (a banked chase view through a gold ring)
//   dossier.json  the judge's summary, written by the vendored make.fun
//                 library from the copied game/ and screenshots/
//
// The program copies first, then validates its own copy against the
// bounty's caps, and only then asks buildDossier to write the dossier —
// so a cap the scorer would refuse fails here, loudly, before anything
// is handed in. Run it twice and the two dossier.json files are identical.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// --- the caps the bounty's gate.json hands the scorer (best-game-01) ---
// Only text_max_bytes shapes the dossier's bytes; the rest refuse an entry
// the scorer would refuse, so passing them makes this program fail where
// the scorer would. game_max_files is 993, not 1000: the grader caps
// /output itself at 1000 entries, and game/ counts beside screenshots/ and
// dossier.json, so 993 game entries plus those make 1000.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
const INDEX_MAX_BYTES = 1024 * 1024;
const SHOT_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

// --- paths ---
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const gameSrc = join(repoRoot, 'game');
const shotsSrc = join(repoRoot, 'screenshots');
const gameDst = join(outDir, 'game');
const shotsDst = join(outDir, 'screenshots');

// --- small helpers ---
function fail(message) {
  throw new Error(`main.ts: ${message}`);
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

// Walk a directory and return every file under it, as paths relative to it,
// in code-unit order, with the file count and the summed bytes. Directories
// count as entries too, the way the grader counts them.
function walkTree(root) {
  const files = [];
  const dirs = [];
  const stack = [''];
  while (stack.length > 0) {
    const rel = stack.pop();
    const abs = rel === '' ? root : join(root, rel);
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const path = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        dirs.push(path);
        stack.push(path);
      } else if (entry.isFile()) {
        files.push({ path, bytes: statSync(join(root, path)).size });
      } else {
        fail(`game/${path}: a symbolic link or special file (game/ holds plain files and directories only)`);
      }
    }
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  dirs.sort();
  return { files, dirs, entries: files.length + dirs.length, bytes: files.reduce((n, f) => n + f.bytes, 0) };
}

// --- copy ---
if (!existsSync(gameSrc)) fail('game/: no such directory beside main.ts');
if (!existsSync(shotsSrc)) fail('screenshots/: no such directory beside main.ts');
mkdirSync(outDir, { recursive: true });
cpSync(gameSrc, gameDst, { recursive: true });
mkdirSync(shotsDst, { recursive: true });
cpSync(shotsSrc, shotsDst, { recursive: true });

// --- validate the copy against the caps, before the dossier is written ---
const tree = walkTree(gameDst);
if (tree.entries > CAPS.game_max_files) {
  fail(`game/: ${tree.entries} files and directories, over the ${CAPS.game_max_files} allowed`);
}
if (tree.bytes > CAPS.game_max_bytes) {
  fail(`game/: ${tree.bytes} bytes, over the ${CAPS.game_max_bytes} allowed`);
}
for (const f of tree.files) {
  if (Buffer.byteLength(f.path, 'utf8') > CAPS.game_path_max_bytes) {
    fail(`game/${f.path}: a path over the ${CAPS.game_path_max_bytes} bytes allowed`);
  }
}
const index = tree.files.find((f) => f.path === 'index.html');
if (!index) fail('game/index.html: no such file (a game is a directory of static files, its index.html at its root)');
if (index.bytes > INDEX_MAX_BYTES) fail(`game/index.html: ${index.bytes} bytes, over the ${INDEX_MAX_BYTES} a page may be`);
// The game loads offline: no external reference may hide in the page.
const page = readFileSync(join(gameDst, 'index.html'), 'utf8');
const external = page.match(/(?:src|href)\s*=\s*["'](?:https?:)?\/\//i) ?? page.match(/url\(\s*["']?(?:https?:)?\/\//i);
if (external) fail(`game/index.html: an external reference (${external[0].slice(0, 40)}...) — the game must load offline`);

const shotFiles = readdirSync(shotsDst)
  .filter((name) => !name.startsWith('.'))
  .sort();
if (shotFiles.length < 3 || shotFiles.length > CAPS.screenshots.max) {
  fail(`screenshots/: ${shotFiles.length} images, need 3 to ${CAPS.screenshots.max}`);
}
for (const name of shotFiles) {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot < 0 ? '' : lower.slice(dot);
  if (!SHOT_EXTENSIONS.has(ext)) fail(`screenshots/${name}: a ${ext || 'no-extension'} file, need PNG or JPEG`);
  const bytes = statSync(join(shotsDst, name)).size;
  if (bytes > CAPS.screenshots.max_bytes) {
    fail(`screenshots/${name}: ${bytes} bytes, over the ${CAPS.screenshots.max_bytes} allowed`);
  }
}

// --- the dossier, written by the vendored make.fun library ---
const dossier = buildDossier(outDir, CAPS);
writeFileSync(join(outDir, 'dossier.json'), dossier);

// --- report ---
console.log(`Basalt Horizon handed in to ${outDir}`);
console.log(`  game: ${tree.files.length} files, ${tree.dirs.length} directories, ${tree.bytes} bytes`);
for (const name of shotFiles) {
  const bytes = readFileSync(join(shotsDst, name));
  console.log(`  screenshot ${name}: ${bytes.length} bytes, sha256 ${sha256Hex(bytes)}`);
}
console.log(`  cover: ${shotFiles[0]}`);
console.log(`  dossier.json: ${dossier.length} bytes, sha256 ${sha256Hex(dossier)}`);
