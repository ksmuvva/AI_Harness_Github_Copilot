// Shared helpers for check.mjs, hook.mjs and eval.mjs. Node standard library only.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const slash = (p) => String(p).replace(/\\/g, '/');

export function loadConfig(root) {
  return JSON.parse(readFileSync(join(root, 'harness/config.json'), 'utf8'));
}

// Anchored, case-sensitive. '**/' also matches zero directories, so '**/*.sql' matches 'a.sql'.
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') {
        i++;
        re += '(?:.*/)?';
      } else re += '.*';
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  // 's': '**' must also cross a newline in a file name, as '*' and '?' already do.
  return new RegExp(`^${re}$`, 's');
}

export function matchesAny(path, globs) {
  const p = slash(path).replace(/^\.\//, '');
  return globs.some((g) => globToRegExp(g).test(p));
}

// Simple subset only: `key: value` and inline lists `[a, b]`.
export function parseFrontmatter(text) {
  const src = String(text).replace(/^\uFEFF/, '');
  const m = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) return { data: {}, body: src };
  const data = {};
  for (const line of (m[1] ?? '').split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):(.*)$/.exec(line);
    if (!kv) continue;
    const v = kv[2].trim();
    data[kv[1]] = /^\[.*\]$/.test(v)
      ? v.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean)
      : v.replace(/^(["'])(.*)\1$/, '$2');
  }
  return { data, body: src.slice(m[0].length) };
}

// Plain object keyed by lower-cased `## Heading`. get/has are added (non-enumerable)
// so callers that treat the result as a Map also work.
export function sections(body) {
  const out = {};
  let key = null;
  for (const line of String(body ?? '').split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      key = h[1].toLowerCase();
      out[key] ??= ''; // a repeated heading adds to its section, so it cannot hide what the first one held
    } else if (key !== null) out[key] += `${line}\n`;
  }
  return Object.defineProperties(out, {
    get: { value: (k) => out[k] },
    has: { value: (k) => Object.hasOwn(out, k) },
  });
}

// Top-level bullets. An indented line after a bullet is folded into it, so a wrapped
// acceptance criterion is still read as one item.
export function bullets(sectionText) {
  const out = [];
  for (const line of String(sectionText ?? '').split(/\r?\n/)) {
    const m = /^[-*]\s+(.*)$/.exec(line);
    if (m) out.push(m[1].trim());
    else if (out.length && /^\s+\S/.test(line)) out[out.length - 1] += ` ${line.trim()}`;
  }
  return out;
}

// Every non-blank line except a `(none)` bullet counts, so a question written as a numbered item,
// an indented bullet or a paragraph still blocks.
export const openQuestions = (sectionText) =>
  String(sectionText ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^[-*+]\s*\(none\)$/i.test(l));

export function storyHash(text) {
  return createHash('sha256').update(String(text).replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

export function storyIdFromBranch(branch, config) {
  const m = /^story\/((?:[A-Z]+)-\d+)(?:-.*)?$/.exec(String(branch ?? ''));
  return m && new RegExp(config.storyIdPattern).test(m[1]) ? m[1] : null;
}

export function branchKind(branch, config) {
  if (storyIdFromBranch(branch, config)) return 'story';
  return config.maintenanceBranchPrefixes.some((p) => String(branch ?? '').startsWith(p)) ? 'maintenance' : 'other';
}

export function dataModelEntities(root, config) {
  const dir = join(root, config.dataModelDir);
  const names = new Set();
  if (!existsSync(dir)) return names;
  for (const file of readdirSync(dir)) {
    const lower = file.toLowerCase();
    if (!lower.endsWith('.sql') && lower !== 'data-model.md') continue;
    const text = readFileSync(join(dir, file), 'utf8');
    const re = lower.endsWith('.sql')
      ? /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?\w+"?\s*\.\s*)?"?(\w+)"?/gi
      : /^#{2,3}[ \t]+`?([a-z][a-z0-9_]*)`?[ \t]*\r?$/gm;
    // A commented-out table is not part of the model.
    const src = lower.endsWith('.sql') ? text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '') : text;
    for (const m of src.matchAll(re)) names.add(m[1].toLowerCase());
  }
  return names;
}

const STATUSES = ['draft', 'ready', 'done'];
const STORY_SECTIONS = ['story', 'acceptance criteria', 'out of scope', 'open questions'];

export function lintStory(root, config, file) {
  const out = [];
  const add = (code, message) => out.push({ code, message });
  const { data, body } = parseFrontmatter(readFileSync(resolve(root, file), 'utf8'));

  const id = String(data.id ?? '');
  const name = slash(file).split('/').pop();
  if (!new RegExp(config.storyIdPattern).test(id)) add('STORY_NAME', `id "${id}" does not match ${config.storyIdPattern}`);
  else if (name !== `${id}.md`) add('STORY_NAME', `file name must be ${id}.md to match its id`);

  if (!STATUSES.includes(data.status)) add('STORY_STATUS', `status "${data.status ?? ''}" is not one of ${STATUSES.join(', ')}`);

  const sec = sections(body);
  const missing = STORY_SECTIONS.filter((h) => !sec.has(h));
  if (missing.length) add('STORY_SECTIONS', `missing section(s): ${missing.join(', ')}`);

  if (data.status !== 'ready' && data.status !== 'done') return out;

  const acs = bullets(sec['acceptance criteria']);
  if (!acs.length) add('STORY_AC', 'a ready story needs at least one acceptance criterion');
  const seen = new Set();
  for (const ac of acs) {
    const m = /^\*\*(AC\d+)\*\*/.exec(ac);
    if (!m) {
      add('STORY_AC', `criterion does not start with "- **AC<n>**": ${ac.slice(0, 60)}`);
      continue;
    }
    if (seen.has(m[1])) add('STORY_AC', `${m[1]} is used more than once`);
    seen.add(m[1]);
    const lacks = ['given', 'when', 'then'].filter((w) => !new RegExp(`\\b${w}\\b`, 'i').test(ac));
    if (lacks.length) add('STORY_AC', `${m[1]} lacks the word(s): ${lacks.join(', ')}`);
  }

  if (!bullets(sec['out of scope']).length) add('STORY_SCOPE', '"Out of scope" needs at least one bullet');

  const open = openQuestions(sec['open questions']);
  if (open.length) add('STORY_QUESTIONS', `${open.length} open question(s) must be answered before the story is ready`);

  const entities = [].concat(data.entities ?? []).filter(Boolean);
  const model = dataModelEntities(root, config);
  if (entities.length && !model.size) add('STORY_ENTITY', `entities are listed but ${config.dataModelDir} defines no data model`);
  else for (const e of entities) if (!model.has(e.toLowerCase())) add('STORY_ENTITY', `entity "${e}" is not in the data model`);

  return out;
}

export function git(root, ...args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

// shortcut: SHA-1 object format only, use `git hash-object -t tree /dev/null` if SHA-256 repos appear.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

// No common ancestor, or no commits yet: compare with the empty tree so every file counts as changed.
function mergeBase(root, base) {
  try {
    return git(root, 'merge-base', base, 'HEAD').trim();
  } catch {
    return EMPTY_TREE;
  }
}

export function changedFiles(root, base) {
  const list = (...args) => git(root, ...args).split('\0').filter(Boolean);
  return [...new Set([
    // --no-renames: a moved file must show its old path too, or a move out of a protected folder would be hidden.
    ...list('diff', '--name-only', '--no-renames', '-z', mergeBase(root, base)),
    ...list('ls-files', '--others', '--exclude-standard', '--full-name', '-z'),
  ].map(slash))].sort();
}

const nugetNames = (text) => [
  ...[...text.matchAll(/<Package(?:Reference|Version)\s[^>]*?\bInclude\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]),
  // An SDK that is not built in is restored from NuGet like any other package.
  ...[...text.matchAll(/<(?:Project|Import)\s[^>]*?\bSdk\s*=\s*["']([^"']+)["']|<Sdk\s[^>]*?\bName\s*=\s*["']([^"']+)["']/gi)]
    .map((m) => m[1] ?? m[2]).filter((n) => !/^Microsoft\.NET\.Sdk(\.[A-Za-z]+)*$/.test(n)).map((n) => `sdk:${n}`),
];

// shortcut: npm `overrides` and install scripts are not read, add them if a story ever needs either.
function npmNames(text) {
  if (!text.trim()) return [];
  const pkg = JSON.parse(text);
  return ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'].flatMap((s) =>
    Object.entries(pkg[s] ?? {}).map(([name, spec]) =>
      // A version, range or tag has no ':', '/' or '@'; an alias, URL, git or file spec installs something else.
      /^(?!\.)[\w.^~<>=*|+\s-]*$/.test(String(spec)) ? name : `${name}@${spec}`));
}

export function newPackages(root, base, files, config) {
  const mb = mergeBase(root, base);
  const out = [];
  for (const file of files.map(slash)) {
    const kind = /\.(csproj|fsproj|vbproj|props|targets)$/i.test(file) ? 'nuget' : /(^|\/)package\.json$/i.test(file) ? 'npm' : null;
    if (!kind) continue;
    const names = kind === 'nuget' ? nugetNames : npmNames;
    const path = join(root, file);
    let before = [];
    let now;
    try {
      before = names(git(root, 'show', `${mb}:${file}`));
    } catch {
      // not in base, or unreadable there: every package in the file counts as new
    }
    try {
      now = names(existsSync(path) ? readFileSync(path, 'utf8') : '');
    } catch {
      out.push({ kind, name: '(file cannot be parsed)', file });
      continue;
    }
    const known = new Set([...before, ...config.allowedPackages[kind]].map((n) => n.toLowerCase()));
    for (const name of new Set(now)) if (!known.has(name.toLowerCase())) out.push({ kind, name, file });
  }
  return out;
}
