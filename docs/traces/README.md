# Traces

A trace is the plan for one story. It maps every acceptance criterion to a test and to the files that will change. It is the link between the story and the code.

- One file per story: `docs/traces/<ID>.md`.
- Copilot writes it with the `plan-story` skill, on the story branch, before any product code.
- The developer reviews it and gives the go-ahead. Only then does Copilot implement.
- The pull-request check reads it to decide which files the branch may change.

## Format

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

| Part | Meaning |
|------|---------|
| `story` | The story ID. Must equal the ID in the branch name. |
| `story-hash` | sha256 of the story file (line endings normalised to LF) at planning time. Print the current value with `node harness/check.mjs hash <ID>`. |
| Plan | One row per acceptance criterion: the test that proves it and the files that implement it. |
| Planned changes | Bullets, each a path or glob and nothing else (backticks optional). The first path segment is a named folder. Together they bound the change set. |
| Questions | Anything Copilot could not settle from the story, the data model or the project context. `- (none)` when there are none; otherwise one dash bullet per question. |

## What the pull-request check does with it

| Code | Fails when |
|------|------------|
| `TRACE_MISSING` | There is no trace for the story. |
| `TRACE_STORY` | `story` is not the branch's story ID. |
| `TRACE_STALE` | `story-hash` differs from the current story file. The story changed after planning. |
| `QUESTIONS` | "Questions" holds any line other than `- (none)`, or the section is missing or empty. |
| `SCOPE` | A changed file is neither the trace itself nor matched by a "Planned changes" glob (one finding per file), or a planned glob starts with a wildcard. |

## Open questions block merge

A question is a correct outcome. It means the story, the data model or the context did not say enough, and Copilot stopped instead of guessing.

A person closes a question. Copilot does not answer its own.

| The answer is | What happens |
|---------------|--------------|
| "Leave it out" | Tell Copilot. It removes the bullet and carries on with the rest. |
| Something that changes or clarifies what must be built | The answer belongs in the story, the data model or the context, so the reviewer and the check see the same specification. Change it on a maintenance branch, merge or rebase the story branch on `main`, then ask Copilot to use the `story-change-impact` skill if the story file changed, or to re-plan the open question if only the data model, the context or the allow-list changed. |

Do not close the second kind by deleting the bullet or by answering only in chat. A reviewer cannot see a chat.

## Review checklist for a trace

- Every AC in the story has a row, and the test named in it would fail without the change.
- No row covers something the story does not ask for.
- "Planned changes" is as narrow as the plan allows. A glob such as `src/**` defeats the `SCOPE` check.
- No planned path is a protected path (`.github/`, `harness/`, `user-stories/`, `docs/data-model/`, `docs/context/`, `eval/`, `.vscode/`, `README.md`, the files directly under `docs/`, or any `AGENTS.md`).
