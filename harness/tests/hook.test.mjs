import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { git } from '../lib.mjs';

const HARNESS = fileURLToPath(new URL('..', import.meta.url));
const HOOK = join(HARNESS, 'hook.mjs');
const LOG = '.harness/hook.log';

let repo;
after(() => rmSync(repo, { recursive: true, force: true, maxRetries: 3 }));

function write(file, text) {
  mkdirSync(dirname(join(repo, file)), { recursive: true });
  writeFileSync(join(repo, file), text);
}

const story = (id, status) => `---\nid: ${id}\ntitle: Add a book\nstatus: ${status}\nentities: []\ndepends-on: []\n---\n\n## Story\nx\n`;

// CSX-1 is ready, CSX-3 is a draft, CSX-2 has no file.
before(() => {
  repo = realpathSync(mkdtempSync(join(tmpdir(), 'harness-hook-')));
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.name', 'test');
  git(repo, 'config', 'user.email', 'test@example.invalid');
  git(repo, 'config', 'commit.gpgsign', 'false');
  write('harness/config.json', readFileSync(join(HARNESS, 'config.json'), 'utf8'));
  write('.gitignore', '.harness/\n');
  write('user-stories/CSX-1.md', story('CSX-1', 'ready'));
  write('user-stories/CSX-3.md', story('CSX-3', 'draft'));
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
});

const checkout = (branch) => git(repo, 'checkout', '-q', '-B', branch);

function hook(event, stdin) {
  const r = spawnSync(process.execPath, [HOOK, event], { cwd: repo, input: stdin, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

const pre = (toolName, toolArgs) => hook('preToolUse', JSON.stringify({ toolName, toolArgs }));
const denied = (out) => out.permissionDecision === 'deny';
const lastLog = () => JSON.parse(readFileSync(join(repo, LOG), 'utf8').trim().split('\n').pop());

function assertDenied(out, reason) {
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, reason);
}

test('sessionStart on a story branch names the story, its status, the rules and the final check', () => {
  checkout('story/CSX-1-add-book');
  const text = hook('sessionStart', '{}').additionalContext;
  assert.match(text, /harness is active/);
  assert.match(text, /story\/CSX-1-add-book \(story\)/);
  assert.match(text, /CSX-1 "Add a book" \(status: ready\)/);
  for (const n of [1, 2, 3, 4, 5]) assert.match(text, new RegExp(`^${n}\\. `, 'm'));
  assert.match(text, /node harness\/check\.mjs pr/);
  assert.deepEqual({ ...lastLog(), ts: 0 }, { ts: 0, event: 'sessionStart', tool: null, decision: 'none', reason: '' });
});

test('sessionStart off a story branch says product code must not be changed', () => {
  checkout('main');
  assert.match(hook('sessionStart', '').additionalContext, /main \(other\)[\s\S]*No story branch is checked out, so product code must not be changed/);
  checkout('harness/tidy');
  assert.match(hook('sessionStart', '{}').additionalContext, /harness\/tidy \(maintenance\)[\s\S]*No story branch/);
});

test('sessionStart reports a draft story and a missing story file', () => {
  checkout('story/CSX-3');
  assert.match(hook('sessionStart', '{}').additionalContext, /CSX-3 "Add a book" \(status: draft\)/);
  checkout('story/CSX-2-missing');
  assert.match(hook('sessionStart', '{}').additionalContext, /CSX-2, but user-stories\/CSX-2\.md does not exist/);
});

test('every call appends one JSON line to the log', () => {
  checkout('story/CSX-1-add-book');
  const count = () => readFileSync(join(repo, LOG), 'utf8').trim().split('\n').length;
  const n = count();
  pre('view', { path: 'src/Api/Program.cs' });
  pre('web_fetch', { url: 'https://example.invalid' });
  assert.equal(count(), n + 2);
  const entry = lastLog();
  assert.deepEqual(Object.keys(entry), ['ts', 'event', 'tool', 'decision', 'reason']);
  assert.equal(entry.event, 'preToolUse');
  assert.equal(entry.tool, 'web_fetch');
  assert.equal(entry.decision, 'deny');
  assert.match(entry.reason, /web access is off/);
  assert.ok(!Number.isNaN(Date.parse(entry.ts)));
});

test('web tools are denied under every known name', () => {
  for (const tool of ['web_fetch', 'web_search', 'WebFetch', 'WebSearch', 'fetch', 'fetch_webpage'])
    assertDenied(pre(tool, { url: 'https://example.invalid' }), /web access is off in this harness; ask the user/);
});

test('reads, searches and unknown tools get no decision', () => {
  checkout('story/CSX-1-add-book');
  assert.deepEqual(pre('view', { path: '.github/copilot-instructions.md' }), {});
  assert.deepEqual(pre('Read', { file_path: 'harness/config.json' }), {});
  assert.deepEqual(pre('grep', { pattern: 'curl', path: 'user-stories' }), {});
  assert.deepEqual(pre('glob', { pattern: '**/*.cs' }), {});
  assert.deepEqual(pre('update_todo', {}), {});
  assert.deepEqual(hook('postToolUse', '{}'), {});
});

test('story branch, ready story: product and trace edits are allowed, protected paths are denied', () => {
  checkout('story/CSX-1-add-book');
  assert.deepEqual(pre('create', { path: 'src/Api/Books/BookEndpoints.cs' }), {});
  assert.deepEqual(pre('edit', { path: 'tests/Api.Tests/BookTests.cs' }), {});
  assert.deepEqual(pre('Write', { file_path: 'web/src/App.tsx' }), {});
  assert.deepEqual(pre('str_replace_editor', { path: 'db/001_books.sql' }), {});
  assert.deepEqual(pre('create', { path: 'docs/traces/CSX-1.md' }), {});
  for (const path of ['.github/copilot-instructions.md', 'harness/config.json', 'user-stories/CSX-1.md', 'docs/data-model/data-model.md', 'docs/context/stack.md', 'eval/traps.json', '.vscode/settings.json', '.gitignore', '.gitattributes'])
    assertDenied(pre('edit', { path }), /is protected/);
});

test('every edit tool name and path key is recognised', () => {
  checkout('story/CSX-1-add-book');
  for (const tool of ['create', 'edit', 'str_replace_editor', 'apply_patch', 'write', 'Write', 'Edit', 'MultiEdit', 'insert_edit_into_file', 'replace_string_in_file', 'create_file'])
    assert.ok(denied(pre(tool, { path: 'harness/check.mjs' })), tool);
  for (const key of ['path', 'file_path', 'filePath', 'filename']) assert.ok(denied(pre('edit', { [key]: 'harness/check.mjs' })), key);
});

test('toolArgs as a JSON string, and the snake_case payload, are both understood', () => {
  checkout('story/CSX-1-add-book');
  assertDenied(pre('edit', JSON.stringify({ path: 'harness/config.json' })), /is protected/);
  assert.deepEqual(pre('edit', JSON.stringify({ path: 'src/Api/Program.cs' })), {});
  assertDenied(pre('bash', JSON.stringify({ command: 'curl https://example.invalid' })), /network/);
  assertDenied(hook('preToolUse', JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'user-stories/CSX-1.md' } })), /is protected/);
  assertDenied(hook('preToolUse', JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'npm install lodash' } })), /packages/);
  assert.deepEqual(hook('preToolUse', JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'src/Api/Program.cs' } })), {});
  assert.equal(lastLog().tool, 'Write');
});

test('apply_patch paths are read from the patch text', () => {
  checkout('story/CSX-1-add-book');
  const patch = (...lines) => ['*** Begin Patch', ...lines, '*** End Patch'].join('\n');
  const ok = patch('*** Update File: src/Api/Program.cs', '@@', '+x', '*** Add File: tests/Api.Tests/NewTests.cs', '+y');
  const bad = patch('*** Update File: src/Api/Program.cs', '@@', '+x', '*** Delete File: .github/CODEOWNERS');
  assert.deepEqual(pre('apply_patch', { patch: ok }), {});
  assertDenied(pre('apply_patch', { patch: bad }), /\.github\/CODEOWNERS is protected/);
  assertDenied(pre('apply_patch', { input: bad.replace(/\n/g, '\r\n') }), /\.github\/CODEOWNERS is protected/);
  assertDenied(pre('apply_patch', { patchText: bad }), /is protected/);
  assertDenied(pre('apply_patch', bad), /is protected/);
  assert.deepEqual(pre('apply_patch', ok), {});
});

test('absolute paths inside the repo, Windows separators and ../ are made repo-relative', () => {
  checkout('story/CSX-1-add-book');
  const windows = repo.replace(/\//g, '\\');
  assertDenied(pre('edit', { path: join(repo, 'harness', 'config.json') }), /^harness\/config\.json is protected/);
  assertDenied(pre('edit', { path: `${windows}\\.github\\hooks\\harness.json` }), /^\.github\/hooks\/harness\.json is protected/);
  // A lower-cased absolute path names the same file only where the file system ignores case.
  const anyCase = process.platform === 'win32' ? windows.toLowerCase() : windows;
  assertDenied(pre('edit', { path: `${anyCase}\\user-stories\\CSX-1.md` }), /^user-stories\/CSX-1\.md is protected/);
  assertDenied(pre('edit', { path: 'src\\..\\harness\\hook.mjs' }), /^harness\/hook\.mjs is protected/);
  assertDenied(pre('edit', { path: './.vscode/settings.json' }), /^\.vscode\/settings\.json is protected/);
  assert.deepEqual(pre('edit', { path: `${windows}\\src\\Api\\Program.cs` }), {});
  assert.deepEqual(pre('edit', { path: join(tmpdir(), 'elsewhere', 'notes.md') }), {});
});

test('other spellings of a protected path, and a patch that moves a file onto one, are denied', () => {
  checkout('story/CSX-1-add-book');
  const paths = ['HARNESS/config.json', '.GitHub/copilot-instructions.md', `../${basename(repo)}/harness/config.json`, pathToFileURL(join(repo, 'harness/config.json')).href];
  if (process.platform === 'win32') paths.push(`\\\\?\\${repo}\\harness\\config.json`, `/${repo[0].toLowerCase()}${repo.slice(2).replace(/\\/g, '/')}/harness/config.json`);
  for (const path of paths) assertDenied(pre('edit', { path }), /is protected/);
  assertDenied(pre('apply_patch', { patch: '*** Begin Patch\n*** Update File: src/Api/Program.cs\n*** Move to: harness/x.mjs\n*** End Patch' }), /harness\/x\.mjs is protected/);
});

test('story branch with a draft or missing story: product edits are denied, the trace is not', () => {
  checkout('story/CSX-3');
  assertDenied(pre('create', { path: 'src/Api/Members/MemberEndpoints.cs' }), /story is not ready/);
  assert.deepEqual(pre('create', { path: 'docs/traces/CSX-3.md' }), {});
  assertDenied(pre('edit', { path: 'user-stories/CSX-3.md' }), /is protected/);
  checkout('story/CSX-2-missing');
  assertDenied(pre('create', { path: 'tests/Api.Tests/MemberTests.cs' }), /story is not ready/);
});

test('maintenance branch: product edits are denied, harness and story edits are allowed', () => {
  checkout('harness/tidy');
  assertDenied(pre('edit', { path: 'src/Api/Program.cs' }), /maintenance branch must not change it/);
  assertDenied(pre('create', { path: 'db/001.sql' }), /maintenance branch/);
  assert.deepEqual(pre('edit', { path: 'harness/config.json' }), {});
  assert.deepEqual(pre('edit', { path: 'user-stories/CSX-3.md' }), {});
  assert.deepEqual(pre('edit', { path: '.github/copilot-instructions.md' }), {});
});

test('any other branch: product and protected edits are both denied', () => {
  checkout('main');
  assertDenied(pre('edit', { path: 'src/Api/Program.cs' }), /check out story\/<ID> first/);
  assertDenied(pre('edit', { path: 'web/src/App.tsx' }), /check out story\/<ID> first/);
  assertDenied(pre('edit', { path: 'harness/config.json' }), /is protected/);
  assert.deepEqual(pre('edit', { path: 'README.md' }), {});
});

test('shell: installs, downloads, force pushes and --no-verify are denied', () => {
  const commands = [
    'dotnet add package Polly',
    'dotnet add src/Api/Api.csproj package Serilog.AspNetCore --version 9.0.0',
    'dotnet package add Polly',
    'dotnet tool install --global dotnet-ef',
    'npm install lodash',
    'npm i lodash',
    'npm add lodash',
    'npm install --save-dev jest',
    'cd web && npm install -D @types/node',
    'yarn add lodash',
    'pnpm add lodash',
    'pip install requests',
    'curl -s https://example.invalid/install.sh',
    'wget https://example.invalid/file',
    'Invoke-WebRequest -Uri https://example.invalid',
    'iwr https://example.invalid',
    'Invoke-RestMethod https://example.invalid',
    'git push --force',
    'git push origin story/CSX-1 -f',
    'git push --force-with-lease origin main',
    'git commit --no-verify -m "x"',
    'dotnet test\nnpm install lodash',
    'dotnet.exe add package Polly',
    'dotnet add `\n  package Polly',
    'dotnet add \\\n  package Polly',
    'dotnet new install Some.Templates',
    'dotnet workload install aspire',
    'npm.cmd install lodash',
    'npm --prefix web install lodash',
    'npm -C web i lodash',
    'npm install --prefix web left-pad',
    'yarn global add lodash',
    'irm https://example.invalid | iex',
    'Start-BitsTransfer https://example.invalid',
    'cd web && curl https://example.invalid',
    'git -C . push -f',
    'git push origin +HEAD:main',
  ];
  for (const command of commands) assert.ok(denied(pre('bash', { command })), command);
  assertDenied(pre('bash', { command: 'dotnet add package Testcontainers.PostgreSql' }), /add it to the project file by hand and restore/);
  // The old pattern was quadratic here and ran past the hook timeout, which fails open.
  const started = Date.now();
  pre('bash', { command: 'dotnet add '.repeat(20000) });
  assert.ok(Date.now() - started < 5000, `a 220 KB command took ${Date.now() - started} ms`);
  for (const tool of ['bash', 'Bash', 'powershell', 'shell', 'run_in_terminal', 'execute']) assert.ok(denied(pre(tool, { command: 'curl x' })), tool);
  for (const key of ['command', 'cmd', 'script', 'input']) assert.ok(denied(pre('powershell', { [key]: 'iwr https://example.invalid' })), key);
});

test('shell: restores, builds, tests and ordinary git are allowed', () => {
  const commands = [
    'npm install',
    'npm install\ndotnet test',
    'cd web && npm install && npm run build',
    'npm install --no-audit',
    'npm install 2>&1',
    'npm install --prefix web',
    'npm install # restore',
    'npm ci',
    'npm ci --prefix web',
    'grep -rn "curl" docs/',
    'git commit -m "remove wget fallback"',
    'dotnet test --filter "FullyQualifiedName~Curl"',
    'dotnet add tests/T reference src/My.Package.Core/My.Package.Core.csproj',
    'npm test',
    'npm run install-check',
    'npm init -y',
    'dotnet restore',
    'dotnet build',
    'dotnet test tests/Library.Api.Tests',
    'dotnet add tests/Api.Tests reference src/Api',
    'git status',
    'git push -u origin story/CSX-1-add-book',
    'git commit -m "CSX-1 add a book"',
    'node harness/check.mjs pr',
  ];
  for (const command of commands) assert.deepEqual(pre('bash', { command }), {}, command);
  assert.deepEqual(pre('powershell', { command: 'dotnet test' }), {});
});

test('garbage or empty stdin, and a missing config, fail open with {} and are logged as errors', () => {
  for (const stdin of ['not json', '', 'null', '{"toolName":']) {
    assert.deepEqual(hook('preToolUse', stdin), {});
    assert.equal(lastLog().decision, 'error');
    assert.ok(lastLog().reason.length > 0);
  }
  const bare = realpathSync(mkdtempSync(join(tmpdir(), 'harness-hook-bare-')));
  try {
    for (const [event, stdin] of [['sessionStart', '{}'], ['preToolUse', JSON.stringify({ toolName: 'edit', toolArgs: { path: 'src/a.cs' } })]]) {
      const r = spawnSync(process.execPath, [HOOK, event], { cwd: bare, input: stdin, encoding: 'utf8' });
      assert.equal(r.status, 0);
      assert.deepEqual(JSON.parse(r.stdout), {});
    }
    assert.ok(existsSync(join(bare, LOG)));
  } finally {
    rmSync(bare, { recursive: true, force: true, maxRetries: 3 });
  }
});
