import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  branchKind, bullets, changedFiles, dataModelEntities, git, globToRegExp, lintStory, loadConfig,
  matchesAny, newPackages, openQuestions, parseFrontmatter, sections, storyHash, storyIdFromBranch,
} from '../lib.mjs';

const config = loadConfig(fileURLToPath(new URL('../..', import.meta.url)));

const temps = [];
after(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true, maxRetries: 3 })));

function tempDir() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'harness-lib-')));
  temps.push(dir);
  return dir;
}

function write(root, file, text) {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}

function tempRepo() {
  const dir = tempDir();
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'test');
  git(dir, 'config', 'user.email', 'test@example.invalid');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'config', 'core.autocrlf', 'false');
  return dir;
}

function commit(dir, message) {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', message);
}

function story(over = {}) {
  const s = {
    id: 'CSX-1',
    status: 'ready',
    entities: '[book]',
    acs: '- **AC1** Given a title and an ISBN, when the book is posted, then it is stored.\n- **AC2** Given no title, when the book is posted, then a 400 is returned.',
    scope: '- Listing books',
    questions: '- (none)',
    ...over,
  };
  return `---
id: ${s.id}
title: Add a book
status: ${s.status}
entities: ${s.entities}
depends-on: []
---

## Story
As a librarian, I want to add a book, so that members can borrow it.

## Acceptance criteria
${s.acs}

## Out of scope
${s.scope}

## Open questions
${s.questions}
`;
}

function lint(over = {}, { file = 'user-stories/CSX-1.md', model = '## book\n\n## loan\n', text } = {}) {
  const root = tempDir();
  if (model) write(root, 'docs/data-model/data-model.md', model);
  write(root, file, text ?? story(over));
  return lintStory(root, config, file).map((f) => f.code);
}

test('loadConfig reads the story pattern and path lists', () => {
  assert.equal(config.storyIdPattern, '^(CSX|T)-\\d+$');
  assert.deepEqual(config.testPaths, ['tests/**', 'web/**']);
  assert.ok(config.protectedPaths.includes('.gitignore'));
});

test('glob: dir/** matches everything under dir and nothing beside it', () => {
  assert.ok(matchesAny('src/Api/Books/BookEndpoints.cs', ['src/**']));
  assert.ok(matchesAny('src/a.cs', ['src/**']));
  assert.ok(!matchesAny('src', ['src/**']));
  assert.ok(!matchesAny('srcx/a.cs', ['src/**']));
  assert.ok(!matchesAny('docs/src/a.cs', ['src/**']));
});

test('glob: * and ? stay inside one path segment', () => {
  assert.ok(matchesAny('tests/a.cs', ['tests/*.cs']));
  assert.ok(!matchesAny('tests/x/a.cs', ['tests/*.cs']));
  assert.ok(matchesAny('db/v1.sql', ['db/v?.sql']));
  assert.ok(!matchesAny('db/v10.sql', ['db/v?.sql']));
  assert.ok(!matchesAny('db/v/.sql', ['db/v?.sql']));
});

test('glob: **/ matches zero or more directories', () => {
  assert.ok(matchesAny('a.sql', ['**/*.sql']));
  assert.ok(matchesAny('db/x/a.sql', ['**/*.sql']));
  assert.ok(matchesAny('src/Api/Migrations/001.cs', ['**/Migrations/**']));
  assert.ok(matchesAny('Migrations/001.cs', ['**/Migrations/**']));
  assert.ok(matchesAny('src/a.cs', ['src/**/*.cs']));
  assert.ok(matchesAny('src/x/y/a.cs', ['src/**/*.cs']));
});

test('glob: a plain name matches that exact path only, and dots are literal', () => {
  assert.ok(matchesAny('.gitignore', ['.gitignore']));
  assert.ok(!matchesAny('src/.gitignore', ['.gitignore']));
  assert.ok(!matchesAny('xgitignore', ['.gitignore']));
  assert.ok(!matchesAny('a+b.cs', ['a.b.cs']));
  assert.ok(globToRegExp('a(1)+[x].cs').test('a(1)+[x].cs'));
});

test('glob: backslashes and a leading ./ are normalised; no globs match nothing', () => {
  assert.ok(matchesAny('src\\Api\\Program.cs', ['src/**']));
  assert.ok(matchesAny('./harness/lib.mjs', ['harness/**']));
  assert.ok(!matchesAny('src/a.cs', []));
});

test('parseFrontmatter reads scalars, inline lists and the body', () => {
  const { data, body } = parseFrontmatter(story());
  assert.equal(data.id, 'CSX-1');
  assert.equal(data.title, 'Add a book');
  assert.deepEqual(data.entities, ['book']);
  assert.deepEqual(data['depends-on'], []);
  assert.ok(body.trimStart().startsWith('## Story'));
});

test('parseFrontmatter handles CRLF, quotes, colons in values and missing frontmatter', () => {
  const { data, body } = parseFrontmatter('---\r\nid: T-2\r\ntitle: "Fix: the thing"\r\nentities: [book, loan ]\r\n---\r\nbody\r\n');
  assert.deepEqual(data, { id: 'T-2', title: 'Fix: the thing', entities: ['book', 'loan'] });
  assert.equal(body, 'body\r\n');
  assert.deepEqual(parseFrontmatter('no frontmatter'), { data: {}, body: 'no frontmatter' });
  assert.deepEqual(parseFrontmatter('---\n---\nx').data, {});
});

test('sections maps lower-cased level-two headings to their text', () => {
  const sec = sections('intro\n## Plan\nrow\n### Detail\nmore\n## Open Questions\r\n- (none)\r\n');
  assert.deepEqual(Object.keys(sec), ['plan', 'open questions']);
  assert.equal(sec.plan, 'row\n### Detail\nmore\n');
  assert.equal(sec['open questions'].trim(), '- (none)');
  assert.equal(sec.get('plan'), sec.plan);
  assert.ok(sec.has('plan') && !sec.has('questions'));
});

test('bullets returns items without the marker and folds wrapped lines', () => {
  assert.deepEqual(bullets('text\n- one\n* two\n- three,\n  continued\n\nnot a bullet\n'), ['one', 'two', 'three, continued']);
  assert.deepEqual(bullets('- a\r\n- b\r\n'), ['a', 'b']);
  assert.deepEqual(bullets(undefined), []);
  assert.deepEqual(bullets('| AC | Test |\n|----|------|\n'), []);
});

test('storyHash is sha256 hex and does not change with CRLF line endings', () => {
  const lf = story();
  assert.match(storyHash(lf), /^[0-9a-f]{64}$/);
  assert.equal(storyHash(lf.replace(/\n/g, '\r\n')), storyHash(lf));
  assert.notEqual(storyHash(lf + ' '), storyHash(lf));
  assert.equal(storyHash('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('branch parsing: story id, kinds and rejects', () => {
  assert.equal(storyIdFromBranch('story/CSX-123', config), 'CSX-123');
  assert.equal(storyIdFromBranch('story/CSX-123-create-case', config), 'CSX-123');
  assert.equal(storyIdFromBranch('story/T-7-ci', config), 'T-7');
  assert.equal(storyIdFromBranch('story/ABC-1', config), null);
  assert.equal(storyIdFromBranch('story/csx-1', config), null);
  assert.equal(storyIdFromBranch('story/CSX-12x', config), null);
  assert.equal(storyIdFromBranch('feature/story/CSX-1', config), null);
  assert.equal(storyIdFromBranch('', config), null);
  assert.equal(branchKind('story/CSX-1-x', config), 'story');
  assert.equal(branchKind('harness/initial', config), 'maintenance');
  assert.equal(branchKind('stories/add-loans', config), 'maintenance');
  assert.equal(branchKind('main', config), 'other');
  assert.equal(branchKind('story/ABC-1', config), 'other');
  assert.equal(branchKind('', config), 'other');
});

test('entity discovery from .sql and data-model.md', () => {
  const root = tempDir();
  assert.equal(dataModelEntities(root, config).size, 0);
  write(root, 'docs/data-model/README.md', '## not_counted\n');
  assert.equal(dataModelEntities(root, config).size, 0);
  write(root, 'docs/data-model/schema.sql', [
    'CREATE TABLE book (id uuid primary key);',
    'create table if not exists library."Member" (id uuid);',
    'CREATE TABLE IF NOT EXISTS "loan" (id uuid);',
    'CREATE TABLE public.fine(id uuid);',
    '-- CREATE TABLE retired (id uuid);',
  ].join('\r\n'));
  write(root, 'docs/data-model/data-model.md', '# Model\n## Overview\n## `reservation`\r\n### branch_office\n#### too_deep\n## two words\n');
  assert.deepEqual([...dataModelEntities(root, config)].sort(), ['book', 'branch_office', 'fine', 'loan', 'member', 'reservation']);
});

test('lintStory: a compliant ready story has no findings, with LF or CRLF', () => {
  assert.deepEqual(lint(), []);
  assert.deepEqual(lint({}, { text: story().replace(/\n/g, '\r\n') }), []);
  assert.deepEqual(lint({ status: 'done' }), []);
});

test('lintStory: a draft is only checked for name, status and sections', () => {
  assert.deepEqual(lint({ status: 'draft', acs: '', scope: '', questions: '- Which fields?', entities: '[ghost]' }), []);
  assert.deepEqual(lint({}, { text: '---\nid: CSX-1\nstatus: draft\n---\n\n## Story\nx\n' }), ['STORY_SECTIONS']);
});

test('lintStory: STORY_NAME', () => {
  assert.deepEqual(lint({ id: 'CSX-2' }), ['STORY_NAME']);
  assert.deepEqual(lint({ id: 'ABC-1' }, { file: 'user-stories/ABC-1.md' }), ['STORY_NAME']);
  assert.deepEqual(lint({ id: 'T-4' }, { file: 'user-stories/T-4.md' }), []);
});

test('lintStory: STORY_STATUS', () => {
  assert.deepEqual(lint({ status: 'approved' }), ['STORY_STATUS']);
});

test('lintStory: STORY_SECTIONS', () => {
  assert.deepEqual(lint({}, { text: story().replace('## Out of scope', '## Not in scope') }), ['STORY_SECTIONS', 'STORY_SCOPE']);
});

test('lintStory: STORY_AC for none, bad prefix, duplicate id and missing given/when/then', () => {
  assert.deepEqual(lint({ acs: '' }), ['STORY_AC']);
  assert.deepEqual(lint({ acs: '- AC1 Given a, when b, then c.' }), ['STORY_AC']);
  assert.deepEqual(lint({ acs: '- **AC1** Given a, when b, then c.\n- **AC1** Given d, when e, then f.' }), ['STORY_AC']);
  assert.deepEqual(lint({ acs: '- **AC1** The book is stored.' }), ['STORY_AC']);
  assert.deepEqual(lint({ acs: '- **AC1** GIVEN a,\n  WHEN b,\n  THEN c.' }), []);
});

test('lintStory: STORY_SCOPE', () => {
  assert.deepEqual(lint({ scope: 'Nothing.' }), ['STORY_SCOPE']);
});

test('lintStory: STORY_QUESTIONS', () => {
  assert.deepEqual(lint({ questions: '- (none)\n- Which order?' }), ['STORY_QUESTIONS']);
  assert.deepEqual(lint({ questions: '- (None)' }), []);
});

test('lintStory: STORY_ENTITY for an unknown entity and for a missing data model', () => {
  assert.deepEqual(lint({ entities: '[book, publisher]' }), ['STORY_ENTITY']);
  assert.deepEqual(lint({ entities: '[Book]' }), []);
  assert.deepEqual(lint({}, { model: null }), ['STORY_ENTITY']);
  assert.deepEqual(lint({ entities: '[]' }, { model: null }), []);
});

test('changedFiles: committed, staged, unstaged, untracked and deleted files, sorted, with / separators', () => {
  const dir = tempRepo();
  write(dir, '.gitignore', '.harness/\n');
  write(dir, 'src/Keep.cs', 'a');
  write(dir, 'src/Edit.cs', 'a');
  write(dir, 'src/Gone.cs', 'a');
  write(dir, 'src/Old/Name.cs', 'the same content, long enough for rename detection to pair the two paths\n');
  commit(dir, 'base');
  assert.deepEqual(changedFiles(dir, 'main'), []);

  git(dir, 'checkout', '-q', '-b', 'story/CSX-1');
  write(dir, 'src/Committed.cs', 'b');
  commit(dir, 'work');
  write(dir, 'tests/Staged.cs', 'c');
  git(dir, 'add', 'tests/Staged.cs');
  write(dir, 'src/Edit.cs', 'changed');
  unlinkSync(join(dir, 'src/Gone.cs'));
  mkdirSync(join(dir, 'src/New'));
  renameSync(join(dir, 'src/Old/Name.cs'), join(dir, 'src/New/Name.cs'));
  write(dir, 'web/untracked file.ts', 'd');
  write(dir, '.harness/hook.log', 'ignored');

  assert.deepEqual(changedFiles(dir, 'main'), [
    'src/Committed.cs', 'src/Edit.cs', 'src/Gone.cs', 'src/New/Name.cs', 'src/Old/Name.cs', 'tests/Staged.cs', 'web/untracked file.ts',
  ]);
});

test('changedFiles: a moved file shows both paths even when the move is committed', () => {
  const dir = tempRepo();
  write(dir, '.github/big.md', 'the same content, long enough for rename detection to pair the two paths\n');
  commit(dir, 'base');
  git(dir, 'mv', '.github/big.md', 'moved.md');
  commit(dir, 'move');
  assert.deepEqual(changedFiles(dir, 'HEAD~1'), ['.github/big.md', 'moved.md']);
});

test('changedFiles: a repo with no commits lists every file', () => {
  const dir = tempRepo();
  write(dir, 'src/A.cs', 'a');
  write(dir, 'README.md', 'b');
  git(dir, 'add', 'README.md');
  assert.deepEqual(changedFiles(dir, 'main'), ['README.md', 'src/A.cs']);
});

test('newPackages: reports only packages that are new and outside the allow-list', () => {
  const dir = tempRepo();
  write(dir, 'src/Api/Api.csproj', '<Project><ItemGroup>\n<PackageReference Include="Serilog" Version="4.0.0" />\n</ItemGroup></Project>\n');
  write(dir, 'web/package.json', JSON.stringify({ dependencies: { react: '19.0.0', lodash: '4.0.0' } }));
  commit(dir, 'base');

  write(dir, 'src/Api/Api.csproj', [
    '<Project><ItemGroup>',
    '<PackageReference Include="Serilog" Version="4.1.0" />',
    '<PackageReference Include="microsoft.entityframeworkcore" Version="10.0.0" />',
    '<PackageReference Version="8.0.0" Include="Polly" />',
    '</ItemGroup></Project>',
  ].join('\r\n'));
  write(dir, 'Directory.Packages.props', "<Project><ItemGroup><PackageVersion Include='Dapper' Version='2.0.0' /></ItemGroup></Project>");
  write(dir, 'web/package.json', JSON.stringify({
    dependencies: { react: '19.0.0', lodash: '4.0.0', axios: '1.0.0' },
    devDependencies: { vite: '7.0.0', jest: '30.0.0' },
  }));
  write(dir, 'web/tool/package.json', '{ not json');
  write(dir, 'src/notes.txt', '<PackageReference Include="Ignored" />');

  const files = changedFiles(dir, 'main');
  assert.deepEqual(newPackages(dir, 'main', files, config), [
    { kind: 'nuget', name: 'Dapper', file: 'Directory.Packages.props' },
    { kind: 'nuget', name: 'Polly', file: 'src/Api/Api.csproj' },
    { kind: 'npm', name: 'axios', file: 'web/package.json' },
    { kind: 'npm', name: 'jest', file: 'web/package.json' },
    { kind: 'npm', name: '(file cannot be parsed)', file: 'web/tool/package.json' },
  ]);

  unlinkSync(join(dir, 'src/Api/Api.csproj'));
  assert.deepEqual(newPackages(dir, 'main', ['src/Api/Api.csproj'], config), []);
});

test('newPackages: targets files, SDKs, every dependency section and specs that are not a registry version', () => {
  const dir = tempRepo();
  write(dir, 'README.md', 'x');
  commit(dir, 'base');
  write(dir, 'src/Api/Directory.Build.targets', '<Project><ItemGroup><PackageReference Include="Polly" Version="8.0.0" /></ItemGroup></Project>');
  write(dir, 'src/Api/Api.csproj', '<Project Sdk="Evil.Sdk/1.0.0">\n<Import Project="x.props" Sdk="Microsoft.NET.Sdk" />\n<Sdk Name="Other.Sdk" Version="2.0.0" />\n</Project>');
  write(dir, 'src/Web/Web.csproj', '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>');
  write(dir, 'web/Package.json', JSON.stringify({
    dependencies: { react: '^19.0.0', 'react-dom': '19.x', vite: 'github:someone/repo', '@types/react': '19.0.0-rc.1' },
    devDependencies: { typescript: 'npm:other-pkg@1.0.0', '@playwright/test': '>=1.48 <2', '@vitejs/plugin-react': 'latest' },
    optionalDependencies: { lodash: '4' },
    peerDependencies: { 'left-pad': '1', '@types/react-dom': 'https://example.invalid/x.tgz' },
  }));

  const found = newPackages(dir, 'main', changedFiles(dir, 'main'), config).map((p) => `${p.kind} ${p.name}`);
  assert.deepEqual(found.sort(), [
    'npm @types/react-dom@https://example.invalid/x.tgz',
    'npm left-pad',
    'npm lodash',
    'npm typescript@npm:other-pkg@1.0.0',
    'npm vite@github:someone/repo',
    'nuget Polly',
    'nuget sdk:Evil.Sdk/1.0.0',
    'nuget sdk:Other.Sdk',
  ]);
});

test('glob: ** also matches a file name that contains a newline', () => {
  assert.ok(matchesAny('harness/a\nb.mjs', ['harness/**']));
  assert.ok(matchesAny('.github/instructions/x\n.instructions.md', ['.github/**']));
});

test('sections: a repeated heading adds to the section rather than replacing it', () => {
  assert.deepEqual(openQuestions(sections('## Questions\n- Real question?\n\n## Questions\n- (none)\n').questions), ['- Real question?']);
});

test('openQuestions: any non-blank line other than a (none) bullet is a question', () => {
  for (const none of ['- (none)', '* (None)\n', '\n- (none)\n\n', '', undefined]) assert.deepEqual(openQuestions(none), [], String(none));
  for (const open of ['1. Which order?', ' - Which order?', '+ Which order?', 'Which order is usual?', '- (none)\n\nBut: which order?', '- Which order?'])
    assert.equal(openQuestions(open).length, 1, open);
});
