---
name: write-user-story
description: Helps a person turn rough notes or a ticket into a user story file in this repository's format, with stable acceptance criterion ids, given/when/then wording, observable results, an explicit out-of-scope list, entities checked against the data model and open questions listed. Use on a maintenance branch (stories/...) when the user asks to write, draft, tidy or review a story in user-stories/. Never use it on a story branch.
---

# Write a user story

A story file is the whole specification the builder agent works from. Whatever is vague here becomes a guess later, and whatever is missing from "Out of scope" becomes an invitation to build more. Your job is to help the author make the story testable and bounded. The author decides what the product does; you do not add requirements of your own.

## 1. Check where you are

Run `git branch --show-current`. Story files are edited only on a maintenance branch such as `stories/<topic>`. On a `story/...` branch, stop: `user-stories/` is protected there. Ask the user to switch.

## 2. Get the inputs

- **The id.** The user supplies it: the ticket key, copied exactly (`CSX-<n>`), or `T-<n>` for a technical task such as scaffolding or CI. Never make up an id or reuse one.
- **The draft.** Notes, a pasted ticket or an existing `user-stories/<ID>.md`.
- **The format.** Read `user-stories/_TEMPLATE.md` and `user-stories/README.md`.
- **The data model.** Read `docs/data-model/` for the entities the draft mentions.

## 3. Write `user-stories/<ID>.md`

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

## Out of scope
- <thing a reader might assume is included but is not>

## Open questions
- (none)
```

Frontmatter is `key: value` and inline lists only; no nested YAML. All four `##` sections must exist, even in a draft.

### Acceptance criteria

- Each line starts `- **AC<n>**` and contains given, when and then.
- **One behaviour per AC.** If "then" holds two results that could fail separately, split it. Each AC becomes one test.
- **The result is observable from outside**: a status code, a response field, a stored row, text on a screen. "Is handled correctly" or "works as expected" cannot be asserted.
- **State the specifics a test needs**: route and verb, status code, field names, sort order, limits, the exact condition. If the author does not know one, it goes under "Open questions"; do not fill it in.
- **Cover the failure cases the author wants**, each as its own AC (missing field, duplicate, not found). Do not add cases the author did not ask for; suggest them as questions.
- **Ids are stable.** In a story that is or has been `ready`, never renumber. Append new ACs with the next number, and do not reuse the number of a removed one, because tests refer to ACs by id.

Example, library lending:

- Weak: `- **AC1** Overdue loans should be shown properly to staff.`
  No trigger, no definition of overdue, nothing to assert.
- Better: `- **AC1** Given a loan whose due_on is before today and whose returned_on is empty, when a librarian requests GET /loans/overdue, then the response is 200 and the list contains that loan.`
  A second AC would state the order if the order matters.

### Story sentence

One sentence: role, capability, outcome. Keep instructions out of it. The builder treats prose that asks for more than the ACs as a question, so a requirement written only here will not be built.

### Out of scope

List what a reasonable reader might assume is included: neighbouring operations (listing, editing, deleting when the story only creates), persistence choices, permissions, notifications, UI when the story is API only. At least one bullet is needed before the story can be `ready`. Ask the author to confirm each one; this list is binding on the builder.

### Entities

`entities` names every data-model entity the story reads or writes, `[]` if none. Check each name, and every column the ACs mention, against `docs/data-model/`. If an AC needs a table or column that is not in the model, do not add it to the model here as a side effect: list it under "Open questions" and tell the author that the data model owner has to change the model first.

### Open questions

List everything unresolved, one bullet each, phrased so it can be answered in a line. Use `- (none)` only when nothing is open. A story with open questions cannot be `ready`.

## 4. Status

Leave `status: draft`. Do not set `ready` or `done`, even if asked: a code owner sets `ready` after reading the story, and that review is the control that stops an unreviewed specification from being built.

## 5. Check and hand back

Run `node harness/check.mjs lint-stories`. For a draft the lint checks only the file name, status and sections, so also read the story against the rules that will apply once it is `ready`:

- every AC has an id, given, when and then, and ids are unique;
- "Out of scope" has at least one bullet;
- "Open questions" is `- (none)`;
- every entity exists in the data model.

Tell the author which of these still fail, list the open questions, and say what a code owner needs to see before setting `ready`. Change no file outside `user-stories/`.
