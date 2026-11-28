---
name: postgres-schema
description: Reads the authoritative PostgreSQL data model in docs/data-model, checks what a story needs against it, writes the question when a table, column, type or constraint is missing, writes safe parameterised SQL when a story needs it, and reviews a migration for lock and rollback risk. Use when planning or building a story that reads or writes data, before writing any entity, migration or SQL.
---
# Work from the data model

`docs/data-model/` is authoritative and human-owned. **The data model wins** over the story, existing code and your own view of good design. A missing or unclear table, column, type, relationship, constraint or index is a question for the trace, never something to add, and never a reason to edit `docs/data-model/`. The PostgreSQL version is in `docs/context/stack.md`.

## 1. Read the model

- `docs/data-model/data-model.md`: one heading per table (`## loan`), with its columns below.
- `docs/data-model/*.sql`: `CREATE TABLE` statements.
- If the folder holds only `README.md`, there is no model yet. Any story with data needs is blocked: record a question.

For each entity in the story's `entities` list, note: column names, types, nullability and defaults; the primary key; foreign keys and their delete rule; unique and check constraints; indexes. Use the names exactly as written. An entity that is not in the story's `entities` list is out of bounds even if the model has it.

## 2. Check the story against it

Go through the ACs one at a time and list every piece of data each one reads or writes. Map each to `table.column`.

| AC needs | Model has | Result |
|----------|-----------|--------|
| the book's ISBN | `book.isbn text unique not null` | ok |
| the date a loan is due | `loan.due_on date` | ok |
| the shelf a book is kept on | nothing on `book` | question |

Check each of these, not just that a name exists:

- **Presence**: the table and column exist under that name.
- **Type**: it can hold what the AC describes (a time of day does not fit `date`; money needs `numeric`).
- **Nullability**: "optional" in the AC matches a nullable column; "required" matches `not null`.
- **Uniqueness**: an AC that rejects duplicates relies on a modelled unique constraint.
- **Relationship**: an AC that links two things relies on a modelled foreign key.
- **Order and limits**: an AC that says "in order" or "the latest" names the column to sort by. If it does not, that is a question too.

If everything maps, carry on. If anything does not, write the question and do not build that AC around the gap (no extra column, no JSON blob, no reuse of a different column, no in-memory substitute).

## 3. Write the question

Add one bullet per gap under "Questions" in `docs/traces/<ID>.md`, then tell the user. A question in the trace blocks the merge until an owner answers it, which is the intended result.

```markdown
## Questions
- CSX-123/AC1 needs to show the shelf a book is kept on. `docs/data-model/data-model.md` lists `book` with id, title, isbn and created_at, and no column for a shelf. Either the model gains a column (name, type and nullability to be decided by the owner) or the AC changes. Blocked: AC1.
```

A good question names the AC, says where you looked and what is there, states what is missing, and leaves the decision to the owner. Do not propose to make the change yourself.

## 4. Write SQL safely

Prefer LINQ (skill `efcore-postgres`). When a story needs SQL:

- **Parameters always.** Values are parameters, never text in the statement. Identifiers and sort direction never come from input.

```csharp
var count = await db.Database
    .SqlQuery<int>($"select count(*)::int as \"Value\" from loan where member_id = {memberId} and returned_on is null")
    .SingleAsync(ct);
```

- List columns by name; no `select *` in product code. Insert with an explicit column list.
- `is null` / `is not null`, never `= null`.
- Instants are `timestamptz`, stored and compared in UTC. Calendar dates are `date`. Pass "now" or "today" in as a parameter from `TimeProvider` rather than calling `now()` or `current_date`, so tests control time.
- Money is `numeric(p,s)`. Do arithmetic in `numeric`; never cast to a floating-point type. Round only where an AC says how.
- Let modelled constraints guard the data. A unique constraint, not a prior `select`, prevents duplicates; handle SQL state `23505` and return the outcome the AC names.
- Add `order by` only when an AC states an order, and end it with the key so the order is stable.
- Several statements that must succeed together run in one transaction.
- DDL only for what the model lists, written to match it exactly:

```sql
create table loan (
    id          uuid primary key,
    book_id     uuid not null references book (id),
    member_id   uuid not null references member (id),
    loaned_on   date not null,
    due_on      date not null,
    returned_on date
);
```

(Illustration only: the real columns, nullability and constraints are whatever the model says.)

## 5. Review a migration

Read the generated SQL (the `efcore-postgres` skill shows how to print it) and check two things.

**It matches the model.** Every statement corresponds to a modelled table, column, type or constraint for the story's entities. Nothing extra, nothing renamed, nothing dropped unless the model removed it.

**Lock and rollback risk.** Look for these and report any you find in the end report:

| Statement | Risk |
|-----------|------|
| `add column ... not null` with no default | Fails if the table has rows. The default must come from the model; if it has none, ask |
| `add column ... default <volatile expression>` | Rewrites the whole table under an exclusive lock |
| `alter column ... type` | Usually rewrites the table and blocks reads and writes |
| `alter column ... set not null` | Scans the table under an exclusive lock; fails if a row is null |
| `create index` (without `concurrently`) | Blocks writes to the table while it builds |
| `add constraint ... foreign key` / `unique` / `check` | Validates all rows under a lock; fails on existing bad data |
| `drop column`, `drop table`, narrowing a type | Data loss. `Down` cannot bring the data back |
| `rename` of a table or column | Breaks any running code that still uses the old name |

- `Down` must undo `Up` in reverse order. Where it cannot restore data, say that the migration is not reversible.
- A new table carries none of these risks beyond its foreign keys.
- Report risks; do not redesign the roll-out (concurrent index builds, staged constraints, backfills) unless the story asks for it. That decision belongs to the owner.
