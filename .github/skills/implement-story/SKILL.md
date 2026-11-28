---
name: implement-story
description: Implements an approved story plan one acceptance criterion at a time, test first, inside the files the trace lists. Use after plan-story has written docs/traces/<ID>.md, the trace has no open questions and the user has approved the plan. Also use to continue or fix work on a story that is already partly built.
---

# Implement a story

You are building the plan in `docs/traces/<ID>.md`, nothing more. Each acceptance criterion (AC) gets a test that fails first and then passes; that is the evidence the reviewer and the pull-request check rely on.

## Before you start

Check all five. If one fails, do not write code.

1. The current branch is `story/<ID>...` and `user-stories/<ID>.md` has `status: ready`.
2. `docs/traces/<ID>.md` exists and its `story` is this ID. If not, use `plan-story`.
3. The trace's `story-hash` equals the output of `node harness/check.mjs hash <ID>`. If not, the story changed after planning; use `story-change-impact`.
4. "Questions" in the trace is `- (none)`.
5. The user has approved the plan in this conversation. If you cannot tell, ask.

## For each AC, in story order

1. **Write the test from the plan row**, carrying the AC token so the check can find it:
   - xUnit: `[Trait("AC", "CSX-123/AC1")]` on the test method
   - Gherkin: tag `@CSX-123/AC1` on the scenario
   - Playwright: in the title, `test('CSX-123/AC1 shows an error when the title is empty', ...)`

   Assert the observable result the AC states (status code, body, row, text on screen), not an internal detail.
2. **Run it and see it fail for the expected reason**: the behaviour is missing. A compile error because the type you are about to write does not exist counts; a typo or a broken fixture does not. A test that passes before the code exists proves nothing, so fix the test.
3. **Write the minimum code that makes it pass.** Use only tables and columns from the data model. Add nothing for later: no extra route, field, parameter, option or branch that this AC's test does not exercise.
4. **Run the test again, then the whole suite**, so earlier ACs still hold.
5. Move to the next AC.

Follow the stack skills for the kind of file you are writing (`dotnet-minimal-api`, `efcore-postgres`, `postgres-schema`, `dotnet-testing`, `web-ui-accessibility`); they say how, the story says what.

## Stay inside the plan

"Planned changes" in the trace bounds the files you may create or edit. The check fails with `SCOPE` for any file outside it.

- **You need a file the plan does not list.** Stop before editing it. Add the glob to "Planned changes", tell the user which file and why, then continue. The user should never learn of a wider change from the diff.
- **The file is under a protected path, or the fix needs a package outside the allow-list.** That is not a plan update. Record a question in the trace and stop.
- **An AC needs a package that is on the allow-list but not yet referenced.** That is allowed. Add the `<PackageReference>` or `package.json` entry by hand in a planned project file, then run `dotnet restore` or `npm install`; the hook blocks `dotnet add package` and `npm install <name>` for every package. If you do not know a version that restores, ask the user for it.
- **An AC turns out to be ambiguous or to need schema that is not in the data model.** Stop work on that AC, add the question to the trace, and report. Keep the finished ACs as they are.
- **You notice a bug or untidy code elsewhere.** Leave it and mention it in the report. Fixing it here would put unreviewed, untraceable lines in this story's diff.

## Review your own diff

Before the final checks, run `git status --short` and `git diff` and read every hunk. For each one, name the AC it serves. Remove whatever has none: an extra endpoint, a field no AC mentions, a configuration switch, logging, a reformatted block, a renamed variable in code you did not need to touch.

## Finish

Run these and read the output. Do not report a result you did not see.

1. `dotnet test` (against the solution, or each test project under `tests/` if there is no solution file).
2. The web tests defined in `web/package.json`, if anything under `web/` changed.
3. `node harness/check.mjs pr` (add `--base main` if `origin/main` is not available locally). It must end with `PASS`.

If the check fails, fix the work, not the check:

| Code | Meaning | What to do |
|------|---------|------------|
| `SCOPE` | A changed file is outside "Planned changes" | Revert it if no AC needs it; otherwise add it to the plan and tell the user |
| `AC_UNTESTED` | No test carries the token for an AC | Add the token to the test that proves that AC, or write the test |
| `PACKAGE` | A package outside the allow-list was added | Remove it; if an AC cannot be met without it, record a question |
| `PROTECTED` | A protected path was edited | Revert that edit |
| `TRACE_STALE` | The story changed after planning | Use `story-change-impact` |
| `QUESTIONS` | The trace has an open question | Get it answered; do not delete it yourself |
| `STORY_NOT_READY` or a `STORY_*` code | The story is not buildable | Stop and tell the user |

Never make a check pass by editing `harness/`, the story file or the data model, or by removing a test.

Loop until all three pass. Then give the final report: each AC with its test file and test name, the files changed, any questions, the real result of each check, and anything you left out or noticed. If a check cannot pass without breaking a rule, stop and report that instead; an honest "blocked" is more useful than a green result obtained the wrong way.
