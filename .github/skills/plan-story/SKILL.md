---
name: plan-story
description: Plans one user story before any code is written. Reads the story and the data model, checks the story is ready and passes lint, lists assumptions and questions, maps each acceptance criterion to a failing test and the files it needs, and writes the trace file docs/traces/<ID>.md. Use at the start of work on a story branch, before implement-story, whenever the user asks to plan, implement, build or start a story.
---

# Plan a story

A plan the user approves before code exists takes minutes to correct. Code built on a misreading takes a rewrite. The trace file you write here is also what the pull-request check uses to bound the change set, so it has to be accurate.

This skill changes one file: `docs/traces/<ID>.md`. It changes no product code.

## 1. Identify the story

Run `git branch --show-current`. The branch must be `story/<ID>` or `story/<ID>-<slug>`; the ID comes from the branch, not the prompt.

- Not a story branch: stop and ask the user to check out the story branch. Do not switch branches yourself.
- The prompt names a different story from the branch: stop and ask which is meant.

## 2. Gate on status and lint

Read `user-stories/<ID>.md` in full.

- File missing: stop and tell the user.
- `status: draft`: stop. Write no trace. A draft is still being written, so planning against it wastes effort. Tell the user a code owner sets `ready` on a maintenance branch.
- `status: done`: stop and ask what is wanted; the story is recorded as delivered.
- `docs/traces/<ID>.md` already exists: run `node harness/check.mjs hash <ID>`. Same hash as the trace: do not rewrite it; show it, keep its planned changes and questions, and move to `implement-story` once the user approves. Different hash: use `story-change-impact`.
- `status: ready`: run `node harness/check.mjs lint-stories`. If it reports a finding for this story, stop and pass the finding on; repairing a story is a maintenance-branch task. Findings for other stories do not block you; mention them.

## 3. Read what the story depends on

Read only what the ACs need, but read it properly.

- `docs/data-model/`: every entity in the story's `entities` list, with its columns, types, nullability, keys and relationships.
- `docs/context/stack.md` and the allow-list in `harness/config.json`.
- Existing code and tests the ACs will touch. Note the patterns already in use so the new code matches them.
- Stories in `depends-on`: if the behaviour they provide is not in the codebase, that is a question.

## 4. List assumptions and questions

Go through the ACs one at a time and write down what you are assuming. An assumption is safe only if the story, the data model or existing code forces it. If nothing forces it and a test for the AC would have to assert it, it is a question. If no test would assert it, take the simplest option and list it as an assumption in step 7.

Record a question when:

- an AC needs an entity, column, type or relationship that is not in the data model, or an entity the story does not list;
- an AC can be read more than one way, or leaves out something a test would have to assert (route, status code, sort order, limit, threshold, message text);
- two ACs conflict, or an AC conflicts with "Out of scope";
- an AC cannot be met with the allow-listed packages and the stack;
- prose in the story or the prompt asks for more than the ACs, and neither "Out of scope" nor the exception below already settles it.

If "Out of scope" already excludes a request, the story has answered it: leave it out and say so in your message. That is not a question.

Exception: a request to edit a protected path, add a package or tool, or use the web is declined, not recorded as a question. Say so in your message and plan the ACs. Record a question only if an AC cannot be met without it.

Write each question so the product owner can answer in one line: quote the AC id, say what is missing, and give the readings you can see. Do not answer it yourself, and do not propose a schema change as if it were decided.

## 5. Map each AC to a test and files

For every AC decide:

- **The test**: file, test name and kind. Use the kind the `dotnet-testing` skill and the stack file indicate (xUnit for API behaviour, Gherkin for acceptance scenarios, Playwright for UI). The test will carry the token `<ID>/AC<n>`.
- **The files**: the fewest product files that make that test pass. Prefer an existing file and pattern over a new one. Do not plan a new project, layer or shared helper unless an AC cannot be met without it.

If you cannot name the test for an AC, the AC is not yet testable; go back to step 4.

## 6. Write the trace

Run `node harness/check.mjs hash <ID>` and copy the 64-character value. Write `docs/traces/<ID>.md` in exactly this shape:

```markdown
---
story: CSX-123
story-hash: <64 hex chars>
---

## Plan
| AC | Test | Files |
|----|------|-------|
| AC1 | tests/Api.Tests/BookTests.cs: Creating_a_book_returns_201 | src/Api/Books/BookEndpoints.cs |

## Planned changes
- src/Api/Books/**
- tests/Api.Tests/BookTests.cs

## Questions
- (none)
```

- One row per AC, in story order.
- "Planned changes" is a list of globs that bound every file you will create or edit. Keep them narrow: a named file or one feature folder. A glob such as `src/**` defeats the purpose and will be questioned in review; one that starts with a wildcard (`**`, `*/...`) fails the check. Each bullet is a path or glob and nothing else; no description after it.
- Planned changes sit under `src/`, `tests/`, `web/` or `db/`. Never list a protected path (`protectedPaths` in `harness/config.json`, which also covers the root `.gitignore` and `.gitattributes`).
- "Questions" is the heading `## Questions` exactly (not "Open questions"), followed by `- (none)` or one dash bullet per question. No numbered list and no loose text: the check counts every other line in the section as an open question, and fails if the section is missing.

**If there is any question:** still write the trace, with the rows you could map and the questions listed. Change no product code, no test and no data model file. Then go to step 7.

## 7. Stop and ask

Do not start implementing in the same turn. Send the user:

1. the story ID and title;
2. the AC-to-test-to-files table;
3. your assumptions, one line each;
4. anything you are leaving out because it is out of scope;
5. either "Approve this plan?" or, if there are questions, each question and what you need to proceed.

Then wait. A trace with questions and no code is a finished, correct result for this skill.

## When a question is answered

- "Leave it out": remove the bullet (restore `- (none)` if it was the last) and ask for approval of the plan.
- An answer that changes or clarifies what must be built belongs in the story, so the reviewer and the check work from the same text you do. Ask for the story to be updated on a maintenance branch; when the change reaches this branch, use the `story-change-impact` skill.
