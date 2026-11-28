# User stories

One file per story. Copilot builds exactly what a story's acceptance criteria state, so the story file is the specification.

## Naming

| Kind | ID | File | Use for |
|------|----|------|---------|
| User story | `CSX-<n>` (the Jira key, verbatim) | `user-stories/CSX-123.md` | Behaviour a user can observe. |
| Technical task | `T-<n>` | `user-stories/T-7.md` | Scaffolding, CI, sign-in plumbing and other work with no user-facing story. |

- The file name is the ID plus `.md`. The `id` in the file must be the same.
- `README.md` and files starting with `_` are skipped by the lint.
- The ID pattern is `storyIdPattern` in `harness/config.json`.

## Format

Copy `_TEMPLATE.md` to `<ID>.md` and fill it in.

```markdown
---
id: CSX-123
title: Short imperative title
status: draft
entities: [book, loan]
depends-on: []
---

## Story
As a <role>, I want <capability>, so that <outcome>.

## Acceptance criteria
- **AC1** Given <context>, when <action>, then <observable result>.
- **AC2** Given ..., when ..., then ...

## Out of scope
- <thing a reader might assume is included but is not>

## Open questions
- (none)
```

| Field or section | Rule |
|------------------|------|
| `id` | Matches the file name and `storyIdPattern`. |
| `title` | Short and imperative. |
| `status` | `draft`, `ready` or `done`. |
| `entities` | Names from `docs/data-model/` that the story may read or write. `[]` if none. |
| `depends-on` | IDs of stories that must be merged first. `[]` if none. |
| Story | Context for the reader. It is **not** a list of instructions. Anything that must be built goes in an AC. |
| Acceptance criteria | One bullet per criterion, starting `- **AC<n>**`, in given / when / then form. |
| Out of scope | Binding. Copilot must not build anything listed here. |
| Open questions | `- (none)` before the story can be `ready`. |

The frontmatter is a simple subset: `key: value` and inline lists `[a, b]`. No nested YAML.

## Lifecycle

| Status | Meaning | Who sets it | Where |
|--------|---------|-------------|-------|
| `draft` | Being written. Copilot will not build it. | Anyone | Maintenance branch `stories/<slug>` |
| `ready` | Complete and approved for building. | A code owner | Maintenance branch `stories/<slug>` |
| `done` | Built and merged. | A code owner | Maintenance branch `stories/<slug>` |

- Story files change only on maintenance branches, through a pull request with code-owner review.
- Copilot never edits a story file on a story branch. The hook denies it and the pull-request check fails with `PROTECTED`.
- The `write-user-story` skill can help draft a story on a maintenance branch. A code owner still decides when it is `ready`.

Changing a `ready` story:

1. Change it on a `stories/<slug>` branch and merge that first.
2. Never renumber AC IDs. Append new ones, and do not reuse the number of a removed AC. Tests carry the IDs.
3. Any change alters the story hash, so an existing trace fails with `TRACE_STALE`. On the story branch, merge `main` and ask Copilot to use the `story-change-impact` skill.

## Lint

Run `node harness/check.mjs lint-stories`. The pull-request check runs the same lint: on every story for a maintenance branch, and on the branch's own story for a story branch.

| Code | Applies to | Rule |
|------|-----------|------|
| `STORY_NAME` | all | File name is `<id>.md` and `id` matches `storyIdPattern`. |
| `STORY_STATUS` | all | `status` is `draft`, `ready` or `done`. |
| `STORY_SECTIONS` | all | The four `##` sections exist: Story, Acceptance criteria, Out of scope, Open questions. |
| `STORY_AC` | ready, done | At least one AC. Each AC line starts `- **AC<n>**`, IDs are unique, and each contains the words given, when and then (any case). |
| `STORY_SCOPE` | ready, done | "Out of scope" has at least one bullet. |
| `STORY_QUESTIONS` | ready, done | "Open questions" holds nothing other than `- (none)`. Any other line counts as a question. |
| `STORY_ENTITY` | ready, done | Every name in `entities` exists in the data model. A non-empty list with no data model is an error. |

## What makes an AC buildable

An AC is buildable when a developer could write a failing test from it without asking anyone anything.

- **One observable result.** A status code, a response field, a stored row, text on a screen. Split an AC that has two.
- **Exact values.** Name the route, the field, the status code, the message, the limit, the sort order. "Quickly", "as usual", "appropriately" and "etc." cannot be tested.
- **Data that exists.** Every table and column it needs is in `docs/data-model/` and the table is in `entities`.
- **The failure cases you care about.** Each one is its own AC. Anything not stated is not built.
- **No design.** Say what must be true, not which class or pattern to use.

Weak: `Given a book, when it is saved, then it is validated properly.`

Buildable: `Given a request with no isbn, when POST /books is called, then the response is 400 and no book is stored.`

Use "Out of scope" to close the gaps a reader would otherwise fill in: listing, editing, deleting, paging, notifications, audit, permissions.

## How an AC is traced to a test

Every AC needs at least one test that carries the token `<ID>/AC<n>` in a file under `tests/` or `web/`. Without it the check fails with `AC_UNTESTED`.

| Test type | Where the token goes |
|-----------|----------------------|
| xUnit | `[Trait("AC", "CSX-123/AC1")]` |
| Gherkin (Reqnroll) | Tag `@CSX-123/AC1` on the scenario |
| Playwright | In the test title: `test('CSX-123/AC1 shows an error ...')` |

## Technical tasks (`T-<n>`)

Technical work uses the same file, the same lint and the same branch rule (`story/T-7-ci-pipeline`). This gives scaffolding and plumbing a legal route, instead of being smuggled into a user story.

- Write the ACs as observable results too: `Given a clean clone, when dotnet test runs, then it exits 0.`
- Each AC still needs a test with its token, for example `T-7/AC1`.
- `entities` is usually `[]`.
- A technical task does not unlock the protected paths. If the task needs a change under `.github/`, `harness/` or `.vscode/`, do that part on a `harness/<slug>` branch.
