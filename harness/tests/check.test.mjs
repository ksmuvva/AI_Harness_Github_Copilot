import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { git, storyHash } from '../lib.mjs';

const HARNESS = fileURLToPath(new URL('..', import.meta.url));
const CHECK = join(HARNESS, 'check.mjs');
const STORY_BRANCH = 'story/CSX-1-add-book';

const temps = [];
after(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true, maxRetries: 3 })));

function tempDir() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'harness-check-')));
  temps.push(dir);
  return dir;
}

function write(root, file, text) {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}

function initRepo(dir) {
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'test');
  git(dir, 'config', 'user.email', 'test@example.invalid');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'config', 'core.autocrlf', 'false');
}

function commit(dir, message) {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', message);
}

// GITHUB_HEAD_REF is removed because CI sets it for the pull request that runs these tests.
function check(root, args, env = {}) {
  const clean = { ...process.env };
  delete clean.GITHUB_HEAD_REF;
  const r = spawnSync(process.execPath, [CHECK, ...args, '--root', root], { encoding: 'utf8', env: { ...clean, ...env } });
  const out = `${r.stdout}${r.stderr}`;
  assert.ok(!/\n\s+at .+:\d+:\d+/.test(out), `stack trace in output:\n${out}`);
  return { code: r.status, out, codes: [...out.matchAll(/^FAIL (\S+)/gm)].map((m) => m[1]) };
}

const pr = (root, branch = STORY_BRANCH, base = 'main') => check(root, ['pr', '--base', base, '--branch', branch]);

function story(id, status) {
  return `---
id: ${id}
title: Add a book
status: ${status}
entities: [book]
depends-on: []
---

## Story
As a librarian, I want to add a book, so that members can borrow it.

## Acceptance criteria
- **AC1** Given a title and an ISBN, when the book is posted, then it is stored.
- **AC2** Given no title, when the book is posted, then a 400 is returned.

## Out of scope
- Listing books

## Open questions
- (none)
`;
}

function trace({ id = 'CSX-1', hash = storyHash(story('CSX-1', 'ready')), planned = [], questions = '- (none)' } = {}) {
  return `---
story: ${id}
story-hash: ${hash}
---

## Plan
| AC | Test | Files |
|----|------|-------|
| AC1 | tests/Api.Tests/BookTests.cs: Creating_a_book_returns_201 | src/Api/Books/BookEndpoints.cs |

## Planned changes
- src/Api/Books/**
- \`tests/Api.Tests/BookTests.cs\`
${planned.map((p) => `- ${p}\n`).join('')}
## Questions
${questions}
`;
}

const TESTS = '[Trait("AC", "CSX-1/AC1")]\npublic void Creating_a_book_returns_201() {}\n[Trait("AC", "CSX-1/AC2")]\npublic void Missing_title_returns_400() {}\n';

let template;
before(() => {
  template = tempDir();
  initRepo(template);
  write(template, 'harness/config.json', readFileSync(join(HARNESS, 'config.json'), 'utf8'));
  write(template, '.gitattributes', '* text=auto eol=lf\n');
  write(template, '.gitignore', '.harness/\nTestResults/\n');
  write(template, 'user-stories/README.md', 'Not a story.\n');
  write(template, 'user-stories/_TEMPLATE.md', 'Not a story either.\n');
  write(template, 'user-stories/CSX-1.md', story('CSX-1', 'ready'));
  write(template, 'user-stories/CSX-3.md', story('CSX-3', 'draft'));
  write(template, 'docs/data-model/data-model.md', '## book\n\n## loan\n');
  commit(template, 'base');
});

// A copy of the base repo with a compliant, uncommitted change set for CSX-1. `files` overrides: text, or null to leave out.
function work(files = {}) {
  const dir = tempDir();
  cpSync(template, dir, { recursive: true });
  const all = {
    'src/Api/Books/BookEndpoints.cs': '// endpoints\n',
    'tests/Api.Tests/BookTests.cs': TESTS,
    'docs/traces/CSX-1.md': trace(),
    ...files,
  };
  for (const [file, text] of Object.entries(all)) if (text !== null) write(dir, file, text);
  return dir;
}

test('usage errors exit 2 with a usage message', () => {
  const dir = work();
  for (const args of [[], ['frobnicate'], ['pr', '--colour'], ['hash'], ['hash', '../config']]) {
    const r = check(dir, args);
    assert.equal(r.code, 2, args.join(' '));
    assert.match(r.out, /usage: node harness\/check\.mjs/);
  }
  assert.equal(check(tempDir(), ['lint-stories']).code, 2);
});

test('lint-stories passes on valid stories and skips README.md and _ files', () => {
  const r = check(work(), ['lint-stories']);
  assert.equal(r.code, 0);
  assert.match(r.out, /^PASS$/m);
});

test('lint-stories reports the file and code of each finding', () => {
  const dir = work({ 'user-stories/CSX-9.md': story('CSX-9', 'ready').replace('- Listing books', 'None.') });
  const r = check(dir, ['lint-stories']);
  assert.equal(r.code, 1);
  assert.match(r.out, /^FAIL STORY_SCOPE user-stories\/CSX-9\.md: /m);
  assert.match(r.out, /^FAILED \(1\)$/m);
});

test('hash prints the story hash, stable across CRLF, and fails clearly for a missing story', () => {
  const dir = work();
  const expected = storyHash(story('CSX-1', 'ready'));
  assert.equal(check(dir, ['hash', 'CSX-1']).out.trim(), expected);
  write(dir, 'user-stories/CSX-1.md', story('CSX-1', 'ready').replace(/\n/g, '\r\n'));
  assert.equal(check(dir, ['hash', 'CSX-1']).out.trim(), expected);
  const missing = check(dir, ['hash', 'CSX-404']);
  assert.equal(missing.code, 1);
  assert.deepEqual(missing.codes, ['STORY_MISSING']);
});

test('pr passes on a compliant story branch (uncommitted work, --branch given)', () => {
  const r = pr(work());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^PASS$/m);
});

test('pr passes on a compliant story branch (committed work, branch read from git, CRLF story)', () => {
  const dir = work({ 'docs/traces/CSX-1.md': null });
  git(dir, 'checkout', '-q', '-b', STORY_BRANCH);
  commit(dir, 'work');
  write(dir, 'docs/traces/CSX-1.md', trace().replace(/\n/g, '\r\n'));
  const r = check(dir, ['pr', '--base', 'main']);
  assert.equal(r.code, 0, r.out);
});

test('pr reads the branch from GITHUB_HEAD_REF before the checked-out branch', () => {
  const dir = work();
  assert.equal(check(dir, ['pr', '--base', 'main'], { GITHUB_HEAD_REF: STORY_BRANCH }).code, 0);
  assert.deepEqual(check(dir, ['pr', '--base', 'main']).codes, ['BRANCH']);
});

test('pr: BRANCH', () => {
  const r = pr(work(), 'feature/books');
  assert.equal(r.code, 1);
  assert.deepEqual(r.codes, ['BRANCH']);
  assert.deepEqual(pr(work(), 'story/ABC-1').codes, ['BRANCH']);
});

test('pr: a maintenance branch may change stories and harness files', () => {
  const dir = work({
    'src/Api/Books/BookEndpoints.cs': null,
    'tests/Api.Tests/BookTests.cs': null,
    'docs/traces/CSX-1.md': null,
    'user-stories/CSX-3.md': story('CSX-3', 'ready'),
    '.github/copilot-instructions.md': 'rules\n',
  });
  assert.equal(pr(dir, 'stories/ready-csx-3').code, 0);
});

test('pr: MAINT_PRODUCT', () => {
  const r = pr(work(), 'harness/tidy');
  assert.deepEqual(r.codes, ['MAINT_PRODUCT', 'MAINT_PRODUCT']);
  assert.match(r.out, /^FAIL MAINT_PRODUCT src\/Api\/Books\/BookEndpoints\.cs /m);
  assert.match(r.out, /^FAILED \(2\)$/m);
});

test('pr: a maintenance branch also lints the stories', () => {
  const dir = work({ 'src/Api/Books/BookEndpoints.cs': null, 'tests/Api.Tests/BookTests.cs': null, 'user-stories/CSX-3.md': story('CSX-3', 'shipped') });
  assert.deepEqual(pr(dir, 'stories/edit').codes, ['STORY_STATUS']);
});

test('pr: STORY_MISSING', () => {
  const dir = work({ 'docs/traces/CSX-1.md': null, 'docs/traces/CSX-2.md': trace({ id: 'CSX-2' }) });
  const r = pr(dir, 'story/CSX-2');
  assert.equal(r.code, 1);
  assert.deepEqual(r.codes, ['STORY_MISSING']);
});

test('pr: STORY_NOT_READY', () => {
  const dir = work({
    'tests/Api.Tests/BookTests.cs': TESTS.replaceAll('CSX-1', 'CSX-3'),
    'docs/traces/CSX-1.md': null,
    'docs/traces/CSX-3.md': trace({ id: 'CSX-3', hash: storyHash(story('CSX-3', 'draft')) }),
  });
  assert.deepEqual(pr(dir, 'story/CSX-3-register').codes, ['STORY_NOT_READY']);
});

test('pr: STORY_NOT_READY for a story already marked done', () => {
  const dir = tempDir();
  cpSync(template, dir, { recursive: true });
  write(dir, 'user-stories/CSX-5.md', story('CSX-5', 'done'));
  commit(dir, 'a delivered story');
  write(dir, 'src/Api/Books/BookEndpoints.cs', '// endpoints\n');
  write(dir, 'tests/Api.Tests/BookTests.cs', TESTS.replaceAll('CSX-1', 'CSX-5'));
  write(dir, 'docs/traces/CSX-5.md', trace({ id: 'CSX-5', hash: storyHash(story('CSX-5', 'done')) }));
  const r = pr(dir, 'story/CSX-5-again');
  assert.deepEqual(r.codes, ['STORY_NOT_READY']);
  assert.match(r.out, /is done; only a ready story is built/);
});

test('pr: a story branch may not add an AGENTS.md or change the README, even when the trace plans it', () => {
  const dir = work({ 'AGENTS.md': 'x\n', 'src/AGENTS.md': 'x\n', 'README.md': 'x\n', 'docs/traces/CSX-1.md': trace({ planned: ['AGENTS.md', 'src/AGENTS.md', 'README.md'] }) });
  assert.deepEqual(pr(dir).codes, ['PROTECTED', 'PROTECTED', 'PROTECTED']);
});

test('pr: story lint findings are reported with their own codes', () => {
  const bad = story('CSX-1', 'ready').replace('- (none)', '- Which ISBN format?');
  const dir = work({ 'docs/traces/CSX-1.md': trace({ hash: storyHash(bad) }) });
  write(dir, 'user-stories/CSX-1.md', bad);
  commit(dir, 'story edited on main');
  write(dir, 'src/Api/Books/More.cs', '// more\n');
  assert.deepEqual(pr(dir).codes, ['STORY_QUESTIONS']);
});

test('pr: PROTECTED for an added file and for a deleted file', () => {
  const dir = work({ '.github/copilot-instructions.md': 'weaker rules\n' });
  unlinkSync(join(dir, '.gitattributes'));
  const r = pr(dir);
  assert.match(r.out, /^FAIL PROTECTED \.github\/copilot-instructions\.md /m);
  assert.match(r.out, /^FAIL PROTECTED \.gitattributes /m);
  assert.deepEqual(r.codes, ['PROTECTED', 'PROTECTED', 'SCOPE', 'SCOPE']);
});

test('pr: PROTECTED even when the trace plans the change, including the story file itself', () => {
  const edited = story('CSX-1', 'ready').replace('- Listing books', '- Nothing');
  const dir = work({
    'user-stories/CSX-1.md': edited,
    'docs/traces/CSX-1.md': trace({ hash: storyHash(edited), planned: ['user-stories/**'] }),
  });
  assert.deepEqual(pr(dir).codes, ['PROTECTED']);
});

test('pr: the rules come from the base branch, so a story branch cannot relax its own config', () => {
  const relaxed = JSON.parse(readFileSync(join(HARNESS, 'config.json'), 'utf8'));
  relaxed.protectedPaths = [];
  relaxed.allowedPackages.nuget.push('Polly');
  const dir = work({
    'harness/config.json': JSON.stringify(relaxed),
    '.github/copilot-instructions.md': 'weaker rules\n',
    'src/Api/Api.csproj': '<Project Sdk="Microsoft.NET.Sdk.Web"><ItemGroup><PackageReference Include="Polly" Version="8.0.0" /></ItemGroup></Project>\n',
    'docs/traces/CSX-1.md': trace({ planned: ['src/Api/Api.csproj', '.github/**', 'harness/config.json'] }),
  });
  const r = pr(dir);
  assert.deepEqual(r.codes, ['PROTECTED', 'PROTECTED', 'PACKAGE'], r.out);
  assert.match(r.out, /^FAIL PROTECTED harness\/config\.json /m);
});

test('pr: PROTECTED ignores case, because User-Stories/ is user-stories/ on Windows and macOS', () => {
  const dir = work({ 'User-Stories/CSX-9.md': 'x\n', 'docs/traces/CSX-1.md': trace({ planned: ['User-Stories/**', 'user-stories/**'] }) });
  const blob = git(dir, 'hash-object', '-w', 'User-Stories/CSX-9.md').trim();
  git(dir, '-c', 'core.ignorecase=false', 'update-index', '--add', '--cacheinfo', `100644,${blob},User-Stories/CSX-9.md`);
  const r = pr(dir);
  assert.match(r.out, /^FAIL PROTECTED User-Stories\/CSX-9\.md /m);
  assert.ok(r.codes.every((c) => c === 'PROTECTED'), r.out);
});

test('pr: TRACE_MISSING', () => {
  assert.deepEqual(pr(work({ 'docs/traces/CSX-1.md': null })).codes, ['TRACE_MISSING']);
});

test('pr: TRACE_STORY', () => {
  assert.deepEqual(pr(work({ 'docs/traces/CSX-1.md': trace({ id: 'CSX-9' }) })).codes, ['TRACE_STORY']);
});

test('pr: TRACE_STALE points at the story-change-impact skill', () => {
  const r = pr(work({ 'docs/traces/CSX-1.md': trace({ hash: 'a'.repeat(64) }) }));
  assert.deepEqual(r.codes, ['TRACE_STALE']);
  assert.match(r.out, /story-change-impact/);
});

test('pr: QUESTIONS', () => {
  const r = pr(work({ 'docs/traces/CSX-1.md': trace({ questions: '- (none)\n- Which order is "the usual order"?' }) }));
  assert.deepEqual(r.codes, ['QUESTIONS']);
});

test('pr: QUESTIONS for a question in any Markdown form, a repeated heading, and a missing or misnamed section', () => {
  const blocked = (text) => assert.deepEqual(pr(work({ 'docs/traces/CSX-1.md': text })).codes, ['QUESTIONS'], text);
  for (const questions of ['1. Which order?', ' - Which order?', '+ Which order?', 'Which order is usual?', '- (none)\n\nBut: which order?', '- Which order?\n\n## Questions\n- (none)', ''])
    blocked(trace({ questions }));
  blocked(trace().replace('## Questions\n- (none)\n', ''));
  blocked(trace({ questions: '- Which order?' }).replace('## Questions', '## Open questions'));
  assert.equal(pr(work({ 'docs/traces/CSX-1.md': trace({ questions: '* (None)' }) })).code, 0);
});

test('pr: SCOPE for a planned glob that starts with a wildcard', () => {
  for (const glob of ['**', '*', '**/*.cs', '*/**']) {
    const r = pr(work({ 'README-extra.md': 'x\n', 'docs/traces/CSX-1.md': trace({ planned: [glob] }) }));
    assert.ok(r.codes.length && r.codes.every((c) => c === 'SCOPE'), `${glob}: ${r.out}`);
    assert.match(r.out, /^FAIL SCOPE planned glob ".+" is too broad/m);
  }
  assert.equal(pr(work({ 'src/Other/Extra.cs': '// x\n', 'docs/traces/CSX-1.md': trace({ planned: ['src/**'] }) })).code, 0);
});

test('pr: SCOPE, one finding per file outside the plan', () => {
  const dir = work({ 'src/Api/Members/MemberEndpoints.cs': '// extra\n', 'notes/todo.md': 'edited\n' });
  const r = pr(dir);
  assert.deepEqual(r.codes, ['SCOPE', 'SCOPE']);
  assert.match(r.out, /^FAIL SCOPE notes\/todo\.md /m);
  assert.match(r.out, /^FAIL SCOPE src\/Api\/Members\/MemberEndpoints\.cs /m);
});

test('pr: PACKAGE for a NuGet package outside the allow-list', () => {
  const csproj = '<Project Sdk="Microsoft.NET.Sdk.Web">\n  <ItemGroup>\n    <PackageReference Include="Microsoft.EntityFrameworkCore" Version="10.0.0" />\n    <PackageReference Include="Polly" Version="8.0.0" />\n  </ItemGroup>\n</Project>\n';
  const dir = work({ 'src/Api/Api.csproj': csproj, 'docs/traces/CSX-1.md': trace({ planned: ['src/Api/Api.csproj'] }) });
  const r = pr(dir);
  assert.deepEqual(r.codes, ['PACKAGE']);
  assert.match(r.out, /^FAIL PACKAGE nuget package Polly in src\/Api\/Api\.csproj /m);
});

test('pr: PACKAGE for an npm package outside the allow-list', () => {
  const pkg = JSON.stringify({ dependencies: { react: '19.0.0' }, devDependencies: { lodash: '4.17.21' } }, null, 2);
  const dir = work({ 'web/package.json': pkg, 'docs/traces/CSX-1.md': trace({ planned: ['web/package.json'] }) });
  const r = pr(dir);
  assert.deepEqual(r.codes, ['PACKAGE']);
  assert.match(r.out, /^FAIL PACKAGE npm package lodash in web\/package\.json /m);
});

test('pr: AC_UNTESTED when a token is missing; AC10 and build output do not count for AC1', () => {
  const dir = work({
    'tests/Api.Tests/BookTests.cs': '[Trait("AC", "CSX-1/AC10")]\n[Trait("AC", "CSX-1/AC2")]\n',
    'tests/Api.Tests/bin/Debug/Copy.cs': '[Trait("AC", "CSX-1/AC1")]\n',
    'docs/traces/CSX-1.md': trace({ planned: ['tests/**'] }),
  });
  const r = pr(dir);
  assert.deepEqual(r.codes, ['AC_UNTESTED']);
  assert.match(r.out, /CSX-1\/AC1$/m);
});

test('pr: AC_UNTESTED when the only tokens are in a file git ignores, such as an old test report', () => {
  const dir = work({
    'tests/Api.Tests/BookTests.cs': '// no tokens\n',
    'tests/Api.Tests/TestResults/old.trx': 'CSX-1/AC1 CSX-1/AC2\n',
  });
  assert.deepEqual(pr(dir).codes, ['AC_UNTESTED', 'AC_UNTESTED']);
});

test('pr: a shallow clone is a clear message, not a finding for every file', () => {
  const dir = work();
  git(dir, 'checkout', '-q', '-b', STORY_BRANCH);
  commit(dir, 'work');
  const clone = join(tempDir(), 'shallow');
  git(dirname(clone), 'clone', '-q', '--depth', '1', '--branch', STORY_BRANCH, pathToFileURL(dir).href, clone);
  git(clone, 'fetch', '-q', '--depth', '1', 'origin', 'main:refs/remotes/origin/main');
  const r = check(clone, ['pr']);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /shallow clone.*git fetch --unshallow/);
});

test('pr: a token in a Gherkin tag or a Playwright title under web/ counts', () => {
  const dir = work({
    'tests/Api.Tests/BookTests.cs': '// no tokens here\n',
    'tests/Acceptance/Books.feature': '@CSX-1/AC1\nScenario: add a book\n',
    'web/tests/books.spec.ts': "test('CSX-1/AC2 shows an error', async () => {});\n",
    'docs/traces/CSX-1.md': trace({ planned: ['tests/**', 'web/**'] }),
  });
  assert.equal(pr(dir).code, 0);
});

test('pr reports every failure rather than stopping at the first', () => {
  const dir = work({
    'tests/Api.Tests/BookTests.cs': '// no tokens\n',
    '.vscode/settings.json': '{}',
    'docs/traces/CSX-1.md': trace({ id: 'CSX-2', hash: 'stale', questions: '- Why?' }),
  });
  assert.deepEqual(pr(dir).codes, ['PROTECTED', 'TRACE_STORY', 'TRACE_STALE', 'QUESTIONS', 'SCOPE', 'AC_UNTESTED', 'AC_UNTESTED']);
});

test('pr: a missing base ref is a clear message, not a stack trace', () => {
  const r = check(work(), ['pr', '--branch', STORY_BRANCH]);
  assert.equal(r.code, 2);
  assert.match(r.out, /base ref "origin\/main" not found/);
});

test('pr: a repo with no commits, and a folder that is not a repo, are clear messages', () => {
  const dir = tempDir();
  write(dir, 'harness/config.json', readFileSync(join(HARNESS, 'config.json'), 'utf8'));
  const notRepo = pr(dir);
  assert.equal(notRepo.code, 2);
  assert.match(notRepo.out, /not a git repository/);
  initRepo(dir);
  const empty = pr(dir);
  assert.equal(empty.code, 2);
  assert.match(empty.out, /base ref "main" not found/);
  assert.deepEqual(check(dir, ['pr', '--base', 'main']).codes, ['BRANCH']);
});

test('doctor fails on an empty folder and still prints the hook summary', () => {
  const r = check(tempDir(), ['doctor']);
  assert.equal(r.code, 1);
  assert.deepEqual(r.codes, ['DOCTOR_GIT', 'DOCTOR_FILE', 'DOCTOR_FILE', 'DOCTOR_FILE', 'DOCTOR_FILE', 'DOCTOR_HOOKS']);
  assert.match(r.out, /open a Copilot chat in this trusted folder/);
  assert.match(r.out, /^tools seen: \(none\)$/m);
  assert.match(r.out, /^denies: 0$/m);
});

function doctorRepo() {
  const dir = work();
  for (const f of ['.github/copilot-instructions.md', '.github/hooks/harness.json', '.github/agents/story-builder.agent.md']) write(dir, f, 'x\n');
  write(dir, '.harness/hook.log', [
    { ts: 't', event: 'sessionStart', tool: null, decision: 'none', reason: '' },
    { ts: 't', event: 'preToolUse', tool: 'bash', decision: 'none', reason: '' },
    { ts: 't', event: 'preToolUse', tool: 'web_fetch', decision: 'deny', reason: 'web' },
    { ts: 't', event: 'preToolUse', tool: 'bash', decision: 'deny', reason: 'curl' },
  ].map((e) => JSON.stringify(e)).join('\n') + '\nnot json\n');
  return dir;
}

test('doctor passes on a set-up repo and lists tools and denies', () => {
  const r = check(doctorRepo(), ['doctor']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^tools seen: bash, web_fetch$/m);
  assert.match(r.out, /^denies: 2$/m);
  assert.match(r.out, /^last hook call: t$/m);
  assert.match(r.out, /^PASS$/m);
});

test('doctor: DOCTOR_HOOKS when the hook ran but could not read any tool call', () => {
  const dir = doctorRepo();
  write(dir, '.harness/hook.log', [
    { ts: 't', event: 'sessionStart', tool: null, decision: 'none', reason: '' },
    { ts: 't', event: 'preToolUse', tool: null, decision: 'error', reason: 'Unexpected token' },
    { ts: 't', event: 'preToolUse', tool: '', decision: 'none', reason: '' },
  ].map((e) => JSON.stringify(e)).join('\n'));
  const r = check(dir, ['doctor']);
  assert.deepEqual(r.codes, ['DOCTOR_HOOKS']);
  assert.match(r.out, /none names a tool/);
});

test('doctor: DOCTOR_HOOKS when the log has no preToolUse entry', () => {
  const dir = doctorRepo();
  write(dir, '.harness/hook.log', `${JSON.stringify({ event: 'sessionStart' })}\n`);
  const r = check(dir, ['doctor']);
  assert.deepEqual(r.codes, ['DOCTOR_HOOKS']);
  assert.match(r.out, /no preToolUse entry/);
});

test("doctor: DOCTOR_SECOND_SOURCE for another assistant's root config", () => {
  const dir = doctorRepo();
  write(dir, 'AGENTS.md', 'x\n');
  write(dir, ['.cl', 'aude'].join('') + '/settings.json', '{}\n');
  write(dir, ['CL', 'AUDE.md'].join(''), 'x\n');
  const r = check(dir, ['doctor']);
  assert.deepEqual(r.codes, ['DOCTOR_SECOND_SOURCE', 'DOCTOR_SECOND_SOURCE', 'DOCTOR_SECOND_SOURCE']);
  assert.match(r.out, /another AI assistant's config/);
});

test('doctor: DOCTOR_NODE for a Node version below 20', () => {
  const r = check(doctorRepo(), ['doctor'], { HARNESS_NODE_VERSION: '18.19.0' });
  assert.deepEqual(r.codes, ['DOCTOR_NODE']);
  assert.match(r.out, /Node 18\.19\.0 found/);
});
