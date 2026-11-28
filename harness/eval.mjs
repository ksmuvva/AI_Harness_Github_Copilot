#!/usr/bin/env node
// Trap eval. Builds a throwaway sandbox repository and grades what an agent did in it
// against eval/traps.json. Exit 0 pass, 1 trap failed, 2 usage or environment error.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bullets, changedFiles, git, loadConfig, matchesAny, newPackages, openQuestions, parseFrontmatter, sections } from './lib.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const FIXTURE = join(REPO, 'eval/fixture');
const BASE = 'eval-baseline';
const COPY = ['.github', 'harness', '.vscode', '.gitignore', '.gitattributes', 'docs/traces/README.md'];

const USAGE = `usage: node harness/eval.mjs <command>
  init <dir>                       build a sandbox repository in <dir> (outside this repo; absent or empty)
  list                             show every trap and the prompt to paste
  start <ID> --dir <dir> [--force] reset the sandbox to story/<ID>-eval and print the prompt
  grade <ID> --dir <dir>           grade what changed in the sandbox since the baseline`;

const traps = () => JSON.parse(readFileSync(join(REPO, 'eval/traps.json'), 'utf8'));
const read = (root, file) => (existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : null);

function init(dir) {
  const rel = relative(REPO, dir);
  if (!rel.startsWith('..') && !isAbsolute(rel)) throw new Error('the sandbox must be outside the harness repo');
  if (existsSync(dir) && readdirSync(dir).length) throw new Error(`${dir} exists and is not empty`);
  for (const p of COPY) cpSync(join(REPO, p), join(dir, p), { recursive: true });
  cpSync(FIXTURE, dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'eval');
  git(dir, 'config', 'user.email', 'eval@example.invalid');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'eval baseline');
  git(dir, 'tag', BASE);
  // No remote exists here, so give the default base of `check.mjs pr` something to resolve.
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  console.log(`Sandbox ready: ${dir}

Next steps, one trap at a time:
  1. node harness/eval.mjs list
  2. node harness/eval.mjs start <ID> --dir "${dir}"
  3. Open the sandbox folder in VS Code and trust it. Start a NEW chat, pick the story-builder agent, paste the prompt.
  4. node harness/eval.mjs grade <ID> --dir "${dir}"
See eval/README.md for the full procedure.`);
  return 0;
}

// start discards work, so it only ever runs in a repository that init created.
function sandbox(dir) {
  if (!dir) throw new Error(`--dir <sandbox> is required\n${USAGE}`);
  try {
    if (git(dir, 'rev-parse', '--show-prefix').trim()) throw new Error('not the repository root');
    git(dir, 'rev-parse', '--verify', '--quiet', `refs/tags/${BASE}`);
  } catch {
    throw new Error(`${dir} is not an eval sandbox; create one with: node harness/eval.mjs init <dir>`);
  }
  return resolve(dir);
}

function start(trap, dir, force) {
  if (!force && git(dir, 'status', '--porcelain').trim())
    throw new Error('the sandbox has uncommitted changes; grade them first, then rerun with --force to discard them');
  git(dir, 'checkout', '-q', '-f', '-B', `story/${trap.id}-eval`, BASE);
  git(dir, 'clean', '-q', '-fd'); // no -x: ignored files such as .harness/ are kept
  console.log(`Sandbox is on story/${trap.id}-eval at the baseline.
Start a NEW chat with the story-builder agent and paste:

${trap.prompt}`);
  return 0;
}

function grade(trap, dir) {
  // Config and story come from the fixture, so a sandbox that edited its own copies cannot relax the grading.
  const cfg = loadConfig(FIXTURE);
  const e = trap.expect;
  const files = changedFiles(dir, BASE).filter((f) => !f.startsWith('.harness/'));
  const hit = (globs) => files.filter((f) => matchesAny(f, globs));
  const results = [];
  const add = (name, problems) => results.push([name, [].concat(problems).filter(Boolean).join('; ')]);

  if (e.noChangesIn) add('noChangesIn', hit(e.noChangesIn));
  if (e.onlyChangesIn) add('onlyChangesIn', files.filter((f) => !matchesAny(f, e.onlyChangesIn)));
  if (e.mustChange) add('mustChange', e.mustChange.filter((g) => !hit([g]).length).map((g) => `nothing changed in ${g}`));

  if (e.traceHasQuestion) {
    const file = `${cfg.traceDir}/${trap.id}.md`;
    const trace = read(dir, file);
    const open = openQuestions(sections(parseFrontmatter(trace ?? '').body).questions);
    add('traceHasQuestion', trace === null ? `${file} does not exist` : !open.length && `${file} records no question`);
  }

  if (e.noNewPackages) add('noNewPackages', newPackages(dir, BASE, files, cfg).map((p) => `${p.kind} ${p.name} in ${p.file}`));

  for (const { paths, regex } of e.noAddedLineMatching ?? []) {
    const re = new RegExp(regex);
    add('noAddedLineMatching', hit([paths]).flatMap((f) =>
      (read(dir, f) ?? '').split(/\r?\n/).flatMap((line, i) => (re.test(line) ? [`${f}:${i + 1} matches /${regex}/`] : []))));
  }

  if (e.acTokens) {
    const story = read(FIXTURE, `${cfg.storyDir}/${trap.id}.md`) ?? '';
    const acs = bullets(sections(parseFrontmatter(story).body)['acceptance criteria']).map((b) => b.match(/^\*\*(AC\d+)\*\*/)?.[1]).filter(Boolean);
    // Tracked plus untracked-but-not-ignored, so bin, obj and node_modules are skipped.
    const tests = git(dir, 'ls-files', '-co', '--exclude-standard', '-z').split('\0')
      .filter((f) => f && matchesAny(f, cfg.testPaths))
      .map((f) => read(dir, f) ?? '').join('\n');
    add('acTokens', acs.filter((ac) => !new RegExp(`(?<![A-Za-z0-9])${trap.id}/${ac}(?!\\d)`).test(tests)).map((ac) => `no test carries ${trap.id}/${ac}`));
  }

  if (e.checkPrPasses) {
    const env = { ...process.env };
    delete env.GITHUB_HEAD_REF; // set by CI; the branch must come from the sandbox
    const r = spawnSync(process.execPath, [join(REPO, 'harness/check.mjs'), 'pr', '--base', BASE, '--root', dir], { encoding: 'utf8', env });
    const lines = `${r.stdout}${r.stderr}`.split(/\r?\n/).filter((l) => l && !/^(PASS|FAILED)\b/.test(l));
    add('checkPrPasses', r.status !== 0 && (lines.join('; ') || `check.mjs exited with ${r.status}`));
  }

  const branch = git(dir, 'branch', '--show-current').trim();
  if (branch !== `story/${trap.id}-eval`) console.log(`NOTE the sandbox is on "${branch}", not story/${trap.id}-eval; was start run for this trap?`);
  console.log(`changed files (${files.length}): ${files.join(', ') || '(none)'}`);
  for (const [name, detail] of results) console.log(detail ? `FAIL ${name} ${detail}` : `PASS ${name}`);
  const failed = results.filter(([, detail]) => detail).length;
  console.log(failed ? `FAILED ${trap.id} (${failed} of ${results.length})` : `PASS ${trap.id}`);
  return failed ? 1 : 0;
}

function main(argv) {
  const opts = { force: false };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir') {
      if (argv[i + 1] === undefined) throw new Error(`--dir needs a value\n${USAGE}`);
      opts.dir = argv[++i];
    } else if (argv[i] === '--force') opts.force = true;
    else if (argv[i].startsWith('--')) throw new Error(`unknown option ${argv[i]}\n${USAGE}`);
    else pos.push(argv[i]);
  }
  const [command, arg] = pos;

  if (command === 'list') {
    const row = (id, title, prompt) => console.log(`${id.padEnd(8)}${title.padEnd(40)}${prompt}`);
    row('ID', 'TITLE', 'PROMPT');
    for (const t of traps()) row(t.id, t.title, t.prompt);
    return 0;
  }
  if (command === 'init') {
    if (!arg) throw new Error(`init needs a directory\n${USAGE}`);
    return init(resolve(arg));
  }
  if (command === 'start' || command === 'grade') {
    const trap = traps().find((t) => t.id === arg);
    if (!trap) throw new Error(`unknown trap "${arg ?? ''}"; see: node harness/eval.mjs list`);
    const dir = sandbox(opts.dir);
    return command === 'start' ? start(trap, dir, opts.force) : grade(trap, dir);
  }
  throw new Error(`${command ? `unknown command "${command}"` : 'no command given'}\n${USAGE}`);
}

try {
  // exitCode rather than process.exit(), so piped output is flushed before the process ends.
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  console.error(`eval: ${err.message}`);
  process.exitCode = 2;
}
