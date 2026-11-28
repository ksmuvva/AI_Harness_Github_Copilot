# Data model

This folder holds the authoritative data model. The repository owner supplies it. Until then the folder contains only this file.

Copilot uses only the tables, columns, types and relationships found here. Anything a story needs that is missing is recorded as a question. It is never invented or renamed.

## Accepted formats

Use either format, or both. Put the files directly in this folder.

| File | How entity names are found |
|------|----------------------------|
| `docs/data-model/*.sql` | Every `CREATE TABLE [IF NOT EXISTS] [schema.]["]name["]` statement. |
| `docs/data-model/data-model.md` | Every heading of the form `## name` or `### name`, where the name matches `[a-z][a-z0-9_]*`. Backticks around the name are optional. |

Names compare case-insensitively. A schema prefix is dropped: `library.book` is the entity `book`.

SQL example:

```sql
CREATE TABLE IF NOT EXISTS book (
    id         uuid PRIMARY KEY,
    title      text NOT NULL,
    isbn       text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL
);
```

Markdown example (`data-model.md`):

```markdown
## book
| Column | Type | Rules |
|--------|------|-------|
| id | uuid | primary key |
| title | text | not null |
| isbn | text | not null, unique |
| created_at | timestamptz | not null |
```

In `data-model.md`:

- Write entity headings in lower case. `## Book` is not picked up; `## book` is.
- Use lower-case one-word headings only for entities. Any other heading that matches the pattern (for example `## overview`) is read as an entity name.

## What is checked by a machine, and what is not

| Checked | By |
|---------|----|
| Every name in a story's `entities` list exists here | Story lint, code `STORY_ENTITY` |
| Nobody changes this folder on a story branch | Hook, and pull-request check code `PROTECTED` |

Columns, types and relationships are **not** machine-checked. Copilot is instructed to follow them, and the reviewer confirms it. Write them precisely: column name, type, nullability, keys, and which column references which table.

## Until the model exists

- A story marked `ready` or `done` that lists any entity fails lint with `STORY_ENTITY`.
- A story with `entities: []` is not affected. Technical tasks (`T-<n>`) usually have none.
- Draft stories are not checked for entities.

So no story that touches data can be made `ready` until the model is here.

## How changes are made

1. Create a maintenance branch: `harness/<slug>` (for example `harness/data-model-add-loan`).
2. Change the files in this folder. Do not change product code on the same branch; the check fails with `MAINT_PRODUCT`.
3. Open a pull request. A code owner must approve it.
4. After the merge, story branches pick the change up by merging or rebasing on `main`.

If a `ready` story needs the new table or column, update the story's `entities` list in the same pull request or a `stories/<slug>` one.
