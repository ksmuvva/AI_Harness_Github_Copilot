#!/usr/bin/env node
// Enforcement checks. Prints `FAIL <CODE> <message>` per finding, then PASS or FAILED (<n>).
// Exit 0 pass, 1 findings, 2 usage or environment error.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  branchKind, bullets, changedFiles, git, lintStory, loadConfig, matchesAny,
  newPackages, openQuestions, parseFrontmatter, sections, storyHash, storyIdFromBranch,
} from './lib.mjs';

const USAGE = `usage: node harness/check.mjs <command> [--root <dir>]
  lint-stories                          lint every story file
  hash <ID>                             print the story hash for a trace file
  pr [--base <ref>] [--branch <name>]   check the change set (base defaults to origin/main)
  doctor                                check the local set-up`;

const REQUIRED_FILES = [
  '.github/copilot-instructions.md',
  '.github/hooks/harness.json',
  '.github/agents/story-builder.agent.md',
  'harness/config.json',
];
// Built from parts so this source does not spell another assistant's name.
const SECOND_SOURCES = ['.cl' + 'aude', 'CL' + 'AUDE.md', 'AGENTS.md'];
const BUILD_OUTPUT = /(^|\/)(bin|obj|node_modules)\//;

const read = (root, file) => (existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : null);
const isOpen = (bullet) => bullet.toLowerCase() !== '(none)';

function config(root) {
  try {
    return loadConfig(root);
  } catch {
    throw new Error(`cannot read harness/config.json under ${root}; run from the repo root or pass --root <dir>`);
  }
}

const lintFile = (root, cfg, file) =>
  lintStory(root, cfg, file).map((f) => ({ code: f.code, message: `${file}: ${f.message}` }));

function lintAll(root, cfg) {
  const dir = join(root, cfg.storyDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md')
    .sort()
    .flatMap((f) => lintFile(root, cfg, `${cfg.storyDir}/${f}`));
}

function untestedAcs(root, cfg, id, acIds) {
  const left = new Set(acIds);
  // Tracked plus untracked-but-not-ignored, so an old test report or other ignored artefact cannot satisfy an AC.
  for (const file of git(root, 'ls-files', '-co', '--exclude-standard', '-z').split('\0')) {
    if (!left.size) break;
    if (!file || BUILD_OUTPUT.test(file) || !matchesAny(file, cfg.testPaths) || !existsSync(join(root, file))) continue;
    const text = readFileSync(join(root, file), 'utf8');
    // The guards stop AC1 being satisfied by AC10, or T-1 by CST-1.
    for (const ac of left) if (new RegExp(`(?<![A-Za-z0-9])${id}/${ac}(?!\\d)`).test(text)) left.delete(ac);
  }
  return [...left];
}

function storyChecks(root, cfg, id, base, files) {
  const out = [];
  const add = (code, message) => out.push({ code, message });
  const storyFile = `${cfg.storyDir}/${id}.md`;
  const traceFile = `${cfg.traceDir}/${id}.md`;

  const story = read(root, storyFile);
  let acIds = [];
  if (story === null) add('STORY_MISSING', `${storyFile} does not exist`);
  else {
    out.push(...lintFile(root, cfg, storyFile));
    const { data, body } = parseFrontmatter(story);
    if (data.status === 'draft') add('STORY_NOT_READY', `${storyFile} is a draft; a code owner sets it to ready on a maintenance branch`);
    acIds = bullets(sections(body)['acceptance criteria']).map((b) => b.match(/^\*\*(AC\d+)\*\*/)?.[1]).filter(Boolean);
  }

  // Without case: User-Stories/x.md lands inside user-stories/ on a Windows or macOS clone.
  const protectedGlobs = cfg.protectedPaths.map((g) => g.toLowerCase());
  for (const f of files) if (matchesAny(f.toLowerCase(), protectedGlobs)) add('PROTECTED', `${f} must not change on a story branch`);

  const trace = read(root, traceFile);
  if (trace === null) add('TRACE_MISSING', `${traceFile} does not exist; use the plan-story skill first`);
  else {
    const { data, body } = parseFrontmatter(trace);
    const sec = sections(body);
    if (data.story !== id) add('TRACE_STORY', `${traceFile} is for story "${data.story ?? ''}", not ${id}`);
    if (story !== null && String(data['story-hash']).toLowerCase() !== storyHash(story))
      add('TRACE_STALE', `${storyFile} changed after ${traceFile} was written; use the story-change-impact skill`);
    const open = openQuestions(sec.questions);
    // Fails closed: a question under another heading, or a section left empty, must not read as "none".
    if (!sec.has('questions') || !sec.questions.trim())
      add('QUESTIONS', `${traceFile} needs a "## Questions" section holding "- (none)" or one "- " bullet per question`);
    else if (open.length) add('QUESTIONS', `${traceFile} has ${open.length} open question(s)`);
    const planned = bullets(sec['planned changes'])
      .map((b) => b.replace(/`/g, '').trim().replace(/^\.\//, ''))
      .filter((b) => b && isOpen(b));
    // A wildcard in the first path segment covers the whole repo, which would make SCOPE a no-op.
    for (const g of planned) if (/^[^/]*[*?]/.test(g)) add('SCOPE', `planned glob "${g}" is too broad; start it with a named folder`);
    for (const f of files)
      if (f !== traceFile && !matchesAny(f, planned)) add('SCOPE', `${f} is not covered by "Planned changes" in ${traceFile}`);
  }

  for (const p of newPackages(root, base, files, cfg))
    add('PACKAGE', `${p.kind} package ${p.name} in ${p.file} is new and not in allowedPackages`);

  for (const ac of untestedAcs(root, cfg, id, acIds))
    add('AC_UNTESTED', `no test under ${cfg.testPaths.join(', ')} carries the token ${id}/${ac}`);

  return out;
}

function pr(root, cfg, opts) {
  try {
    git(root, 'rev-parse', '--git-dir');
  } catch {
    throw new Error(`${root} is not a git repository (or git is not on PATH)`);
  }
  const branch = opts.branch || process.env.GITHUB_HEAD_REF || git(root, 'branch', '--show-current').trim();
  const wrongBranch = () => [{
    code: 'BRANCH',
    message: `branch "${branch}" is neither story/<ID> (ID matching ${cfg.storyIdPattern}) nor a maintenance branch (${cfg.maintenanceBranchPrefixes.join(', ')})`,
  }];
  if (branchKind(branch, cfg) === 'other') return wrongBranch();

  const base = opts.base || 'origin/main';
  try {
    git(root, 'rev-parse', '--verify', '--quiet', `${base}^{commit}`);
  } catch {
    throw new Error(`base ref "${base}" not found; fetch it or pass --base <ref>`);
  }
  // The rules come from the base branch, so a branch cannot relax the config it is checked against.
  try {
    cfg = JSON.parse(git(root, 'show', `${base}:./harness/config.json`));
  } catch {
    // the base has no harness yet (first import): the working-tree config applies
  }
  const kind = branchKind(branch, cfg);
  if (kind === 'other') return wrongBranch();
  try {
    git(root, 'merge-base', base, 'HEAD');
  } catch {
    // Unrelated histories fall back to the empty tree in changedFiles; a shallow clone would report every file.
    if (git(root, 'rev-parse', '--is-shallow-repository').trim() === 'true')
      throw new Error('this is a shallow clone, so the merge base cannot be found; run: git fetch --unshallow');
  }
  const files = changedFiles(root, base);

  if (kind === 'story') return storyChecks(root, cfg, storyIdFromBranch(branch, cfg), base, files);
  return [
    ...lintAll(root, cfg),
    ...files
      .filter((f) => matchesAny(f, cfg.productPaths))
      .map((f) => ({ code: 'MAINT_PRODUCT', message: `${f} is product code and must not change on a maintenance branch` })),
  ];
}

function doctor(root) {
  const out = [];
  const add = (code, message) => out.push({ code, message });

  const node = process.env.HARNESS_NODE_VERSION || process.versions.node; // the variable exists so the check can be tested
  if (Number(node.split('.')[0]) < 20) add('DOCTOR_NODE', `Node ${node} found; 20 or later is required`);
  try {
    git(root, 'rev-parse', '--git-dir');
  } catch {
    add('DOCTOR_GIT', `${root} is not a git repository (or git is not on PATH)`);
  }
  for (const f of REQUIRED_FILES) if (!existsSync(join(root, f))) add('DOCTOR_FILE', `${f} is missing`);
  for (const f of SECOND_SOURCES)
    if (existsSync(join(root, f)))
      add('DOCTOR_SECOND_SOURCE', `${f} is another AI assistant's config at the repo root; the Copilot runtime may read it, so remove it`);

  const log = (read(root, '.harness/hook.log') ?? '').split(/\r?\n/).flatMap((line) => {
    try {
      const entry = JSON.parse(line);
      return entry && typeof entry === 'object' ? [entry] : [];
    } catch {
      return [];
    }
  });
  const missing = ['sessionStart', 'preToolUse'].filter((ev) => !log.some((e) => e.event === ev));
  if (missing.length)
    add('DOCTOR_HOOKS', `.harness/hook.log has no ${missing.join(' or ')} entry; open a Copilot chat in this trusted folder, send one prompt, then rerun doctor`);

  console.log(`tools seen: ${[...new Set(log.map((e) => e.tool).filter(Boolean))].sort().join(', ') || '(none)'}`);
  console.log(`denies: ${log.filter((e) => e.decision === 'deny').length}`);
  return out;
}

function report(findings) {
  for (const f of findings) console.log(`FAIL ${f.code} ${f.message}`);
  console.log(findings.length ? `FAILED (${findings.length})` : 'PASS');
  return findings.length ? 1 : 0;
}

function main(argv) {
  const opts = { root: process.cwd() };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].match(/^--(root|base|branch)$/)?.[1];
    if (name && argv[i + 1] === undefined) throw new Error(`${argv[i]} needs a value\n${USAGE}`);
    if (name) opts[name] = argv[++i];
    else if (argv[i].startsWith('--')) throw new Error(`unknown option ${argv[i]}\n${USAGE}`);
    else pos.push(argv[i]);
  }
  const [command, id] = pos;
  const root = opts.root;

  if (command === 'doctor') return report(doctor(root));
  if (command === 'lint-stories') return report(lintAll(root, config(root)));
  if (command === 'pr') return report(pr(root, config(root), opts));
  if (command === 'hash') {
    const cfg = config(root);
    // The pattern check also keeps the ID from being used as a path.
    if (!id || !new RegExp(cfg.storyIdPattern).test(id)) throw new Error(`hash needs a story ID matching ${cfg.storyIdPattern}\n${USAGE}`);
    const story = read(root, `${cfg.storyDir}/${id}.md`);
    if (story === null) return report([{ code: 'STORY_MISSING', message: `${cfg.storyDir}/${id}.md does not exist` }]);
    console.log(storyHash(story));
    return 0;
  }
  throw new Error(`${command ? `unknown command "${command}"` : 'no command given'}\n${USAGE}`);
}

try {
  // exitCode rather than process.exit(), so piped output is flushed before the process ends.
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  console.error(`check: ${err.message}`);
  process.exitCode = 2;
}
