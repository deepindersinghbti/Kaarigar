/**
 * Verify the COMMITTED tree is self-contained.
 *
 * Owner: Track A. Run with:  npm run check:tree
 *
 * The failure this prevents, which has nearly happened on several commits:
 * a new module is written, the files that import it are staged, the new file
 * itself is left untracked, and the commit lands. Everything still works
 * locally because the file is on disk. The next person pulls, runs the server,
 * and it dies on an unresolvable import - with a stack trace pointing at the
 * importer rather than at the missing file.
 *
 * tsc will not catch it: type-checking reads the working tree, not the index.
 * The build will not catch it either, for the same reason. Only comparing
 * imports against the set of TRACKED files catches it.
 *
 * Checks every relative import in every tracked .ts/.tsx file resolves to
 * another tracked file. Exits non-zero on failure, so it can gate a commit.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';

/** Files git knows about, plus anything currently staged. */
function trackedFiles(): Set<string> {
  const out = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' });
  const staged = execSync('git diff --cached --name-only --diff-filter=d', { encoding: 'utf8' });
  const set = new Set<string>();
  for (const line of `${out}\n${staged}`.split('\n')) {
    const f = line.trim();
    if (f) set.add(f.replace(/\\/g, '/'));
  }
  return set;
}

/** Only files git will actually keep - untracked-but-not-ignored are reported separately. */
function committedFiles(): Set<string> {
  const out = execSync('git ls-files --cached', { encoding: 'utf8' });
  const staged = execSync('git diff --cached --name-only --diff-filter=d', { encoding: 'utf8' });
  const set = new Set<string>();
  for (const line of `${out}\n${staged}`.split('\n')) {
    const f = line.trim();
    if (f) set.add(f.replace(/\\/g, '/'));
  }
  return set;
}

const IMPORT_RE = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"](\.[^'"]+)['"]|import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;

/** Try the extensions and index forms a bundler would. */
function resolves(spec: string, fromFile: string, universe: Set<string>): boolean {
  const base = path.posix.join(path.posix.dirname(fromFile.replace(/\\/g, '/')), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ];
  // .ts extensions are permitted in this project (allowImportingTsExtensions).
  if (/\.tsx?$/.test(base)) candidates.push(base);
  return candidates.some((c) => universe.has(c));
}

async function main() {
  const all = trackedFiles();
  const committed = committedFiles();

  const sources = [...all].filter(
    (f) => /\.(ts|tsx)$/.test(f) && !f.startsWith('node_modules/') && !f.startsWith('dist/')
  );

  const missing: Array<{ file: string; spec: string; untrackedOnDisk: boolean }> = [];

  for (const file of sources) {
    if (!existsSync(file)) continue;
    const text = await readFile(file, 'utf8').catch(() => '');
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2];
      if (!spec) continue;
      if (resolves(spec, file, committed)) continue;
      // Distinguish "missing entirely" from "present on disk but not tracked" -
      // the second is the bug this exists to catch.
      const untrackedOnDisk = resolves(spec, file, all);
      missing.push({ file, spec, untrackedOnDisk });
    }
  }

  const untrackedSources = [...all].filter(
    (f) => !committed.has(f) && /\.(ts|tsx)$/.test(f) && (f.startsWith('src/') || f.startsWith('scripts/'))
  );

  if (untrackedSources.length) {
    console.log('\nUntracked source files (not in the commit):');
    for (const f of untrackedSources) console.log(`  ${f}`);
  }

  if (missing.length === 0) {
    console.log(`\ncheck:tree OK - ${sources.length} files, every relative import resolves within the tree.\n`);
    process.exit(0);
  }

  console.error('\ncheck:tree FAILED - imports that will not resolve after a fresh clone:\n');
  for (const { file, spec, untrackedOnDisk } of missing) {
    console.error(`  ${file}`);
    console.error(`    imports "${spec}"`);
    console.error(
      untrackedOnDisk
        ? '    -> the file EXISTS on disk but is NOT tracked. git add it.'
        : '    -> the file does not exist at all.'
    );
  }
  console.error('\nThis is why a teammate pulls a tree that will not start.\n');
  process.exit(1);
}

main().catch((err) => {
  console.error('check:tree could not run:', err.message);
  process.exit(1);
});
