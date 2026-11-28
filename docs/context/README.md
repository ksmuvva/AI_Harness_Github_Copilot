# Project context

This folder is the slot for facts about your project that Copilot needs and cannot work out from the code.

This public template ships it empty, apart from `stack.md`. Add your own files in your private copy of the repository.

## What belongs here

| File (suggested name) | Content |
|-----------------------|---------|
| `stack.md` | Technology choices and versions. Already present; review it. |
| `glossary.md` | Domain terms and what they mean in this product. |
| `roles.md` | User roles and what each may do. |
| `business-rules.md` | Rules that apply across stories (numbering, time limits, statuses). |
| `decisions.md` | Decisions already taken, one or two lines each, with the date. |

## How to write it

- Keep it short and factual. One fact per line or table row.
- Write what is true now. Leave out history, discussion and plans.
- Do not repeat the data model. Tables and columns live in `docs/data-model/`.
- Do not put requirements here. A requirement belongs in a story's acceptance criteria.
- Do not put secrets, credentials or personal data here.

## How it is used

- The guidance files point Copilot at this folder when a story needs project background.
- If a story conflicts with a file here, Copilot records a question in the trace. It does not pick a side.

## How it is changed

- Only on a maintenance branch (`harness/<slug>`), with code-owner review.
- Copilot must not edit this folder on a story branch. The hook denies the edit and the pull-request check fails with `PROTECTED`.
