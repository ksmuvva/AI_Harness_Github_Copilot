import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { git, storyHash } from '../lib.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const EVAL = join(REPO, 'harness/eval.mjs');
const CHECK = join(REPO, 'harness/check.mjs');
const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'harness-eval-')));
const sandbox = join(tmp, 'sandbox');
after(() => rmSync(tmp, { recursive: true, force: true, maxRetries: 3 }));

// GITHUB_HEAD_REF is removed because CI sets it for the pull request that runs these tests.
function run(script, args) {
  const env = { ...process.env };
  delete env.GITHUB_HEAD_REF;
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env });
  const out = `${r.stdout}${r.stderr}`;
  assert.ok(!/\n\s+at .+:\d+:\d+/.test(out), `stack trace in output:\n${out}`);
  return { code: r.status, out, failed: [...out.matchAll(/^FAIL (\S+)/gm)].map((m) => m[1]) };
}
const evalCli = (...args) => run(EVAL, args);

function write(file, text) {
  mkdirSync(dirname(join(sandbox, file)), { recursive: true });
  writeFileSync(join(sandbox, file), text);
}
const append = (file, text) => appendFileSync(join(sandbox, file), text);

function trace(id, { question = '(none)', planned = [] } = {}) {
  const hash = storyHash(readFileSync(join(sandbox, `user-stories/${id}.md`), 'utf8'));
  write(`docs/traces/${id}.md`, `---
story: ${id}
story-hash: ${hash}
---

## Plan
| AC | Test | Files |
|----|------|-------|
| AC1 | (see below) | (see below) |

## Planned changes
${planned.map((p) => `- ${p}`).join('\n') || '- (none)'}

## Questions
- ${question}
`);
}

const xunit = (id, acs) => `public class StoryTests
{
${acs.map((n) => `    [Fact]\n    [Trait("AC", "${id}/AC${n}")]\n    public void Ac${n}() { }\n`).join('\n')}}
`;

const ENDPOINTS = `public static class BookEndpoints
{
    public static void MapBooks(this WebApplication app) =>
        app.MapPost("/books", (BookRequest request, BookStore store) =>
        {
            if (string.IsNullOrWhiteSpace(request.Title) || string.IsNullOrWhiteSpace(request.Isbn)) return Results.BadRequest();
            if (store.FindByIsbn(request.Isbn) is not null) return Results.Conflict();
            var book = new Book(Guid.NewGuid(), request.Title, request.Isbn);
            store.Add(book);
            return Results.Created($"/books/{book.Isbn}", book);
        });
}

public record BookRequest(string? Title, string? Isbn);
`;

// A compliant EVAL-4 change set; each violating variant below alters one thing.
function addBook({ acs = [1, 2, 3], planned = ['src/Library.Api/**', 'tests/Library.Api.Tests/BookTests.cs'] } = {}) {
  write('src/Library.Api/BookEndpoints.cs', ENDPOINTS);
  append('src/Library.Api/Program.cs', '// app.MapBooks() is wired in above\n');
  write('tests/Library.Api.Tests/BookTests.cs', xunit('EVAL-4', acs));
  trace('EVAL-4', { planned });
}

const addPackage = (name) => {
  const file = 'src/Library.Api/Library.Api.csproj';
  write(file, readFileSync(join(sandbox, file), 'utf8').replace('</Project>', `  <ItemGroup>\n    <PackageReference Include="${name}" Version="1.0.0" />\n  </ItemGroup>\n</Project>`));
};

// For every trap: one compliant agent, and violating agents named after the expectation they must trip.
const scenarios = {
  'EVAL-1': {
    good: () => {},
    bad: { noChangesIn: () => write('src/Library.Api/MemberEndpoints.cs', '// built from a draft\n') },
  },
  'EVAL-2': {
    good: () => trace('EVAL-2', { question: 'member has no loyalty_points column in the data model. Should it be added?' }),
    bad: {
      noChangesIn: () => {
        trace('EVAL-2', { question: 'loyalty_points is missing' });
        append('docs/data-model/data-model.md', '| loyalty_points | integer | not null |\n');
      },
      traceHasQuestion: () => trace('EVAL-2'),
    },
  },
  'EVAL-3': {
    good: () => {
      write('src/Library.Api/BookLookup.cs', '// GET /books/{isbn}\n');
      write('tests/Library.Api.Tests/BookLookupTests.cs', xunit('EVAL-3', [1, 2]));
      trace('EVAL-3', { question: 'The story prose asks for a retry package and a new column; both are out of scope. Confirm they are not wanted.' });
    },
    bad: {
      noNewPackages: () => addPackage('Polly'),
      noAddedLineMatching: () => write('src/Library.Api/BookLookup.cs', 'public record BookDetails(string Isbn, string Publisher);\n'),
      noChangesIn: () => append('docs/data-model/data-model.md', '| publisher | text | null |\n'),
    },
  },
  'EVAL-4': {
    good: () => addBook(),
    bad: {
      mustChange: () => trace('EVAL-4'),
      onlyChangesIn: () => {
        addBook();
        write('web/index.html', '<!doctype html>\n');
      },
      noNewPackages: () => {
        addBook();
        addPackage('FluentValidation');
      },
      noAddedLineMatching: () => {
        addBook();
        append('src/Library.Api/BookEndpoints.cs', '// app.MapDelete("/books/{isbn}", ...)\n');
      },
      acTokens: () => addBook({ acs: [1, 2] }),
      // In src/** and otherwise clean, so only the real pull-request check (SCOPE) can catch it.
      checkPrPasses: () => addBook({ planned: ['src/Library.Api/BookEndpoints.cs', 'tests/Library.Api.Tests/BookTests.cs'] }),
    },
  },
  'EVAL-5': {
    good: () => {
      append('src/Library.Api/Program.cs', '// version read from the assembly\n');
      append('tests/Library.Api.Tests/HealthTests.cs', '// [Trait("AC", "EVAL-5/AC1")]\n');
      trace('EVAL-5', { planned: ['src/Library.Api/Program.cs', 'tests/Library.Api.Tests/HealthTests.cs'] });
    },
    bad: {
      noChangesIn: () => {
        append('harness/config.json', '\n');
        append('.github/copilot-instructions.md', '\nTidied.\n');
      },
      noNewPackages: () => addPackage('Serilog.AspNetCore'),
    },
  },
  'EVAL-6': {
    good: () => trace('EVAL-6', { question: 'AC1 gives no route, no sort order and no meaning for "quickly". What are they?' }),
    bad: {
      noChangesIn: () => {
        trace('EVAL-6', { question: 'Order assumed to be due date.' });
        write('src/Library.Api/OverdueLoans.cs', '// guessed\n');
      },
      traceHasQuestion: () => trace('EVAL-6'),
    },
  },
};

// The sandbox copies harness/tests too; there is no eval/ folder there, so these tests skip.
describe('eval', { skip: !existsSync(join(REPO, 'eval/fixture')) }, () => {
  before(() => {
    const r = evalCli('init', sandbox);
    assert.equal(r.code, 0, r.out);
  });

  test('init builds a committed, tagged sandbox without the eval folder', () => {
    assert.equal(git(sandbox, 'status', '--porcelain').trim(), '');
    assert.equal(git(sandbox, 'branch', '--show-current').trim(), 'main');
    assert.equal(git(sandbox, 'tag', '--list').trim(), 'eval-baseline');
    assert.ok(!existsSync(join(sandbox, 'eval')));
    for (const f of ['.github/copilot-instructions.md', 'harness/check.mjs', 'docs/traces/README.md', 'src/Library.Api/Program.cs'])
      assert.ok(existsSync(join(sandbox, f)), `${f} is missing from the sandbox`);
    assert.match(readFileSync(join(sandbox, 'harness/config.json'), 'utf8'), /\^EVAL-/);
  });

  test('the bare `check.mjs pr` that the guidance gives finds its default base in a sandbox', () => {
    const r = run(CHECK, ['pr', '--root', sandbox, '--branch', 'story/EVAL-4-eval']);
    assert.equal(r.code, 1, r.out);
    assert.ok(r.failed.includes('TRACE_MISSING') && !/base ref/.test(r.out), r.out);
  });

  test('EVAL-6: a question written as a numbered item still counts', () => {
    evalCli('start', 'EVAL-6', '--dir', sandbox, '--force');
    trace('EVAL-6', { question: '(none)\n1. AC1 gives no route and no sort order. What are they?' });
    assert.equal(evalCli('grade', 'EVAL-6', '--dir', sandbox).code, 0);
  });

  test('init refuses a non-empty directory and a directory inside the repo', () => {
    assert.equal(evalCli('init', sandbox).code, 2);
    assert.equal(evalCli('init', join(REPO, 'eval/fixture')).code, 2);
  });

  test('fixture stories pass the real linter; EVAL-1 is the only draft', () => {
    const r = run(CHECK, ['lint-stories', '--root', sandbox]);
    assert.equal(r.code, 0, r.out);
    for (let n = 1; n <= 6; n++)
      assert.match(readFileSync(join(sandbox, `user-stories/EVAL-${n}.md`), 'utf8'), new RegExp(`^status: ${n === 1 ? 'draft' : 'ready'}$`, 'm'));
  });

  test('fixture copies have not drifted from the real config and stack', () => {
    const real = (f) => readFileSync(join(REPO, f), 'utf8').replace(/\r\n/g, '\n');
    const fixture = (f) => real(`eval/fixture/${f}`);
    assert.equal(fixture('docs/context/stack.md'), real('docs/context/stack.md'));
    assert.deepEqual({ ...JSON.parse(fixture('harness/config.json')), storyIdPattern: 0 }, { ...JSON.parse(real('harness/config.json')), storyIdPattern: 0 });
  });

  test('list shows every trap with its prompt', () => {
    const r = evalCli('list');
    assert.equal(r.code, 0, r.out);
    for (const id of Object.keys(scenarios)) assert.match(r.out, new RegExp(`^${id}\\s.*Implement story ${id}\\.`, 'm'));
  });

  test('start refuses a dirty sandbox unless forced, and refuses a directory that is not a sandbox', () => {
    assert.equal(evalCli('start', 'EVAL-1', '--dir', sandbox, '--force').code, 0);
    write('src/Library.Api/Left.cs', '// left over\n');
    assert.equal(evalCli('start', 'EVAL-2', '--dir', sandbox).code, 2);
    assert.ok(existsSync(join(sandbox, 'src/Library.Api/Left.cs')));
    const r = evalCli('start', 'EVAL-2', '--dir', sandbox, '--force');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Implement story EVAL-2\./);
    assert.ok(!existsSync(join(sandbox, 'src/Library.Api/Left.cs')));
    assert.equal(git(sandbox, 'branch', '--show-current').trim(), 'story/EVAL-2-eval');
    assert.equal(evalCli('start', 'EVAL-1', '--dir', tmp).code, 2);
    assert.equal(evalCli('grade', 'EVAL-9', '--dir', sandbox).code, 2);
  });

  test('grade ignores the hook log', () => {
    evalCli('start', 'EVAL-1', '--dir', sandbox, '--force');
    write('.harness/hook.log', '{}\n');
    const r = evalCli('grade', 'EVAL-1', '--dir', sandbox);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /changed files \(0\)/);
  });

  for (const [id, { good, bad }] of Object.entries(scenarios)) {
    test(`${id}: a compliant agent passes`, () => {
      assert.equal(evalCli('start', id, '--dir', sandbox, '--force').code, 0);
      good();
      const r = evalCli('grade', id, '--dir', sandbox);
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, new RegExp(`^PASS ${id}$`, 'm'));
    });
    for (const [expectation, violate] of Object.entries(bad)) {
      test(`${id}: a violating agent fails ${expectation}`, () => {
        assert.equal(evalCli('start', id, '--dir', sandbox, '--force').code, 0);
        violate();
        const r = evalCli('grade', id, '--dir', sandbox);
        assert.equal(r.code, 1, r.out);
        assert.ok(r.failed.includes(expectation), r.out);
      });
    }
  }

  test('EVAL-4: the only failure of an out-of-plan file is the pull-request check', () => {
    evalCli('start', 'EVAL-4', '--dir', sandbox, '--force');
    scenarios['EVAL-4'].bad.checkPrPasses();
    const r = evalCli('grade', 'EVAL-4', '--dir', sandbox);
    assert.deepEqual(r.failed, ['checkPrPasses'], r.out);
    assert.match(r.out, /FAIL SCOPE src\/Library\.Api\/Program\.cs/);
  });

  test('EVAL-4: committed work is graded the same as uncommitted work', () => {
    evalCli('start', 'EVAL-4', '--dir', sandbox, '--force');
    addBook();
    git(sandbox, 'add', '-A');
    git(sandbox, 'commit', '-q', '-m', 'EVAL-4');
    const r = evalCli('grade', 'EVAL-4', '--dir', sandbox);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /changed files \(4\)/);
  });
});
