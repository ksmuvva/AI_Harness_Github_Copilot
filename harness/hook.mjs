#!/usr/bin/env node
// Copilot hook: `node harness/hook.mjs <event>` with the event JSON on stdin; root is the cwd.
// Fast local feedback only. The enforcement is `check.mjs pr` in CI.
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { branchKind, git, loadConfig, matchesAny, parseFrontmatter, storyIdFromBranch } from './lib.mjs';

const root = process.cwd();
const event = process.argv[2] ?? '';

const WEB = /^(web_?fetch|web_?search|fetch|fetch_webpage)$/i;
const EDIT = /^(create|edit|str_replace_editor|apply_patch|write|multiedit|insert_edit_into_file|replace_string_in_file|create_file)$/i;
const SHELL = /^(bash|powershell|shell|run_in_terminal|execute)$/i;

const NO_INSTALL = 'install commands are blocked in this harness; to use one of the packages on the allow-list in harness/config.json, add it to the project file by hand and restore; for anything else ask the user';
const NO_NETWORK = 'network downloads are off in this harness; ask the user for the information';
const EXE = '(?:\\.(?:exe|cmd))?';
// npm options that take a value, so `npm install --prefix web` is still a bare restore
const NPM_VALUE_OPT = '(?:--prefix|--workspace|-w|-C|--registry|--cache|--loglevel)[ \\t]+';
const NPM_OPT = `(?:[ \\t]+(?:${NPM_VALUE_OPT}[^\\s;&|]+|(?!${NPM_VALUE_OPT})-[^\\s;&|]+))*`;
// shortcut: npx, npm exec, pnpm install <pkg>, bun add and redirection into a protected file are not matched; CI reports what leaves a diff.
const SHELL_DENY = [
  // `package` must be a word of its own, and the span is bounded so a huge command cannot run past the hook timeout
  [new RegExp(`\\bdotnet${EXE}\\s+(?:add\\s(?:[^\\n;&|]{0,300}?\\s)?package\\s|package\\s+add\\b)`, 'i'), NO_INSTALL],
  [new RegExp(`\\bdotnet${EXE}\\s+(?:tool|new|workload)\\s+install\\b`, 'i'), NO_INSTALL],
  // install/add followed by options only (or nothing, a comment or a redirect) is a plain restore and is allowed
  [new RegExp(`\\bnpm${EXE}${NPM_OPT}[ \\t]+(?:i|install|add)\\b${NPM_OPT}[ \\t]+(?!\\d*[<>])[^-#\\s;&|]`, 'i'), NO_INSTALL],
  [new RegExp(`\\b(?:yarn|pnpm)${EXE}\\s+(?:global\\s+)?add\\b`, 'i'), NO_INSTALL],
  [/\bpip3?\s+install\b/i, NO_INSTALL],
  // command position only, so `grep curl docs/` and a commit message that mentions wget are not blocked
  [/(?:^|[\n;&|({`])\s*(?:curl|wget|Invoke-WebRequest|iwr|Invoke-RestMethod|irm|Start-BitsTransfer)(?:\.exe)?(?=\s|$)/i, NO_NETWORK],
  [/\bgit\b[^\n;&|]{0,200}?\spush\b[^\n;&|]*\s(?:--force|-f\b|\+\w)/i, 'force push is not allowed'],
  [/--no-verify\b/i, '--no-verify is not allowed; fix what the check reports'],
];

const RULES = [
  '1. One story per branch: work only on the story named in story/<ID>; with no story branch, do not change product code; ask.',
  '2. Build only ready stories, and only what their acceptance criteria state; "Out of scope" is binding; anything more is not built, and is a question unless already excluded.',
  '3. docs/data-model/ is the only source of tables, columns, types and relationships; never invent or rename schema.',
  '4. No new packages, tools, services or web lookups; use docs/context/stack.md and the allow-list in harness/config.json.',
  '5. Never edit .github/, harness/, user-stories/, docs/data-model/, docs/context/, eval/ or .vscode/ on a story branch.',
];

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function currentBranch() {
  try {
    // Reading .git/HEAD saves a process start on every edit; a worktree (.git is a file) falls through to git.
    const head = readFileSync(join(root, '.git', 'HEAD'), 'utf8').trim().match(/^ref: refs\/heads\/(.+)$/);
    return head ? head[1] : '';
  } catch {
    // fall through
  }
  try {
    return git(root, 'branch', '--show-current').trim();
  } catch {
    return '';
  }
}

function storyData(config, id) {
  const file = join(root, config.storyDir, `${id}.md`);
  return existsSync(file) ? parseFrontmatter(readFileSync(file, 'utf8')).data : null;
}

function sessionContext(config) {
  const branch = currentBranch();
  const id = storyIdFromBranch(branch, config);
  const lines = [
    'The agent harness is active in this repository.',
    `Branch: ${branch || '(none)'} (${branchKind(branch, config)}).`,
  ];
  if (!id) lines.push('No story branch is checked out, so product code must not be changed.');
  else {
    const story = storyData(config, id);
    lines.push(story
      ? `Active story: ${id} "${story.title ?? ''}" (status: ${story.status ?? 'unknown'}).${story.status === 'draft' ? ' A draft story must not be built.' : ''}`
      : `Active story: ${id}, but ${config.storyDir}/${id}.md does not exist, so product code must not be changed.`);
  }
  lines.push('Rules:', ...RULES, 'Run `node harness/check.mjs pr` before saying the work is done.');
  return lines.join('\n');
}

// Repo-relative with '/'. A path outside the repo comes back starting with '../' or as an absolute path, which matches no glob.
function repoRelative(path) {
  let p = path.trim();
  if (/^file:/i.test(p)) {
    try {
      p = fileURLToPath(p);
    } catch {
      // not a valid file URL: treat it as a path
    }
  }
  p = p.replace(/^\\\\\?\\/, '').replace(/\\/g, '/');
  if (process.platform === 'win32') p = p.replace(/^\/([A-Za-z])\//, '$1:/'); // Git Bash form: /c/Users/...
  // The deepest existing ancestor is made canonical, which undoes '..', links, case and 8.3 short names.
  let abs = resolve(root, p);
  let tail = '';
  for (;;) {
    try {
      abs = realpathSync.native(abs);
      break;
    } catch {
      const parent = dirname(abs);
      if (parent === abs) break;
      tail = join(basename(abs), tail);
      abs = parent;
    }
  }
  let realRoot = root;
  try {
    realRoot = realpathSync.native(root);
  } catch {
    // keep the cwd as given
  }
  return relative(realRoot, join(abs, tail)).split(sep).join('/');
}

function editPaths(tool, args) {
  const paths = ['path', 'file_path', 'filePath', 'filename'].map((k) => args[k]);
  if (/^apply_patch$/i.test(tool))
    for (const key of ['patch', 'input', 'patchText'])
      if (typeof args[key] === 'string')
        for (const m of args[key].matchAll(/^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$/gm)) paths.push(m[1]);
  return paths.filter((p) => typeof p === 'string' && p.trim()).map(repoRelative);
}

function editDenial(config, paths) {
  const branch = currentBranch();
  const kind = branchKind(branch, config);
  const id = storyIdFromBranch(branch, config);
  // Without case: on Windows and macOS, HARNESS/config.json is the protected file.
  const hit = (p, globs) => matchesAny(p.toLowerCase(), globs.map((g) => g.toLowerCase()));
  for (const p of paths) {
    const product = hit(p, config.productPaths);
    if (kind !== 'maintenance' && hit(p, config.protectedPaths))
      return `${p} is protected; it changes only on a maintenance branch, reviewed by a code owner`;
    if (kind === 'maintenance' && product) return `${p} is product code; a maintenance branch must not change it`;
    if (kind === 'other' && product) return `${p} is product code; check out story/<ID> first`;
    if (kind === 'story' && product) {
      const story = storyData(config, id);
      if (!story || story.status === 'draft') return `story is not ready: ${id} is ${story ? 'a draft' : 'missing'}, so ${p} must not change`;
    }
  }
  return null;
}

function preToolUse(input) {
  const tool = String(input.toolName ?? input.tool_name ?? '');
  let args = input.toolArgs ?? input.tool_input ?? {};
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args);
    } catch {
      args = { input: args }; // a raw patch or command line
    }
  }
  if (!args || typeof args !== 'object') args = {};

  let reason = null;
  if (WEB.test(tool)) reason = 'web access is off in this harness; ask the user for the information';
  else if (EDIT.test(tool)) reason = editDenial(loadConfig(root), editPaths(tool, args));
  else if (SHELL.test(tool)) {
    const command = ['command', 'cmd', 'script', 'input'].map((k) => args[k]).filter((v) => typeof v === 'string').join('\n')
      .replace(/[`\\^]\r?\n\s*/g, ' '); // a continued line is one command
    reason = SHELL_DENY.find(([re]) => re.test(command))?.[1] ?? null;
  }
  return { tool, reason };
}

const entry = { ts: new Date().toISOString(), event, tool: null, decision: 'none', reason: '' };
let out = {};
try {
  const raw = readStdin();
  if (event === 'sessionStart') out = { additionalContext: sessionContext(loadConfig(root)) };
  else if (event === 'preToolUse') {
    const { tool, reason } = preToolUse(JSON.parse(raw));
    entry.tool = tool;
    if (reason) {
      entry.decision = 'deny';
      entry.reason = reason;
      out = { permissionDecision: 'deny', permissionDecisionReason: reason };
    }
  }
} catch (err) {
  // shortcut: fails open so a harness bug cannot block all work; CI is the enforcement. Switch to exit 2 once tool names are confirmed in a live session.
  entry.decision = 'error';
  entry.reason = String(err?.message ?? err);
  out = {};
}

try {
  mkdirSync(join(root, '.harness'), { recursive: true });
  appendFileSync(join(root, '.harness', 'hook.log'), `${JSON.stringify(entry)}\n`);
} catch {
  // a log that cannot be written must not change the decision
}
process.stdout.write(`${JSON.stringify(out)}\n`);
