---
name: story-change-impact
description: Works out what a changed user story means for a plan and code that already exist, then updates the trace and changes only what the changed acceptance criteria require. Use when node harness/check.mjs pr reports TRACE_STALE, when the trace hash no longer matches the story, or when the user says the story was edited after planning or after implementation started.
---

# Handle a story that changed

The trace records a hash of the story as it was when you planned. When the story file changes, the plan and possibly the code no longer match the specification. The aim here is the smallest set of edits that brings them back in line: touch what the changed acceptance criteria (ACs) require, and leave the rest alone.

Do not update the hash on its own to silence `TRACE_STALE`. The hash exists so that a changed story is re-read, not waved through.

You never edit the story file. It changes on a maintenance branch and reaches this branch when the user merges or rebases.

## 1. Confirm there is a change

Run `node harness/check.mjs hash <ID>` and compare it with `story-hash` in `docs/traces/<ID>.md`. If they match, nothing changed; say so and stop.

Then run the gate from `plan-story`: the story must still be `ready` and pass `node harness/check.mjs lint-stories`. If it is now `draft`, stop and tell the user; change nothing.

## 2. Find what changed

Get the story text the plan was written against:

1. `git log -1 --format=%H -- docs/traces/<ID>.md` gives the commit that last recorded the trace.
2. `git diff <that commit> -- user-stories/<ID>.md` shows the story edits since then.

If the trace was never committed, or the diff is empty, there is no old text to compare. In that case compare by AC id (the story's ACs against the rows of the trace's "Plan" table), treat every AC that still exists as possibly reworded, and re-read each test against the current AC text. Tell the user the comparison was made this way.

Compare the whole file, not only the ACs: `entities`, "Out of scope" and "Open questions" can change what is allowed.

## 3. Classify each difference

| Change | Meaning |
|--------|---------|
| AC added | New id, appended to the list. Needs a test and code. |
| AC changed | Same id, different given/when/then. Its test asserts the old behaviour. |
| AC removed | Id gone. Its test and any code that served only it are now beyond the story. |
| "Out of scope" grew | Something may have been built that is now excluded. Check. |
| "Out of scope" shrank | Nothing to build unless an AC asks for it. |
| `entities` changed | Re-check every table and column you use against the data model. |
| Wording only (title, story sentence, typo) | No code change. The trace still needs the new hash. |

AC ids are not renumbered once a story is `ready`. If ids appear to have shifted, stop and ask; guessing which AC is which would attach tests to the wrong criteria.

## 4. Work out the impact

For each added, changed or removed AC, list:

- the tests that carry its token (search `tests/` and `web/` for `<ID>/AC<n>`);
- the product files those tests exercise for that AC;
- whether each piece of code is used by another AC as well. Shared code stays.

Apply the question rules from `plan-story` to the new and changed ACs. A changed AC that is now ambiguous, or that needs schema missing from the data model, is a question, and a question stops the work here just as it does in planning.

## 5. Update the trace first

Rewrite `docs/traces/<ID>.md`:

- `story-hash`: the new value from step 1;
- "Plan": add rows for new ACs, correct rows for changed ACs, delete rows for removed ACs;
- "Planned changes": add globs the new work needs; remove globs nothing uses any more;
- "Questions": any question from step 4, otherwise `- (none)`.

Then show the user the impact list and the revised plan, and wait for the go-ahead before changing code. If there are questions, stop here.

Wording-only change: update the hash, tell the user no code is affected, run the checks in step 7, and finish.

## 6. Change only what the changed ACs require

Work test first, as in `implement-story`:

- **Added AC**: write its test with the token, see it fail, write the minimum code, see it pass.
- **Changed AC**: change the test to assert the new result, see it fail against the current code, then change the code.
- **Removed AC**: delete the tests that carry only its token. Delete code that existed only for that AC: routes, handlers, fields, columns in your own migration, UI. If a test carries tokens for several ACs, remove only the token. Leaving the code in place would keep behaviour that no AC asks for.
- **Unchanged ACs**: do not touch their tests or code. A story edit is not an invitation to revisit earlier work.

Code for a removed AC that has already been merged to `main` in an earlier pull request is outside this branch's change set; report it instead of removing it.

## 7. Check and report

Run `dotnet test`, the web tests if `web/` changed, and `node harness/check.mjs pr`. All must pass.

Report:

- what changed in the story: ACs added, changed, removed; other differences;
- for each, the tests and files touched, and what was deleted;
- what was deliberately left alone;
- questions, if any;
- the real result of each check.
