---
name: database
description: Rules for schema, migrations and SQL - the data model is authoritative and nothing is added beyond it.
applyTo: "db/**,**/Migrations/**,**/*.sql"
---
# Database conventions

`docs/data-model/` is authoritative. It wins over this file, the story text, existing code and your own judgement. PostgreSQL and EF Core versions are in `docs/context/stack.md`. Help: skills `postgres-schema` and `efcore-postgres`.

- Use only the tables, columns, types, nullability, defaults, keys, relationships, constraints and indexes that the model lists. If a story needs something that is missing or unclear, stop and record a question in the trace. Never add, rename, retype or drop schema to make a story work, and never edit `docs/data-model/`.
- A story may read or write only the entities named in its `entities` list.
- Schema changes are EF Core migrations created with `dotnet ef migrations add`. A migration contains only what brings the database to the model for the story's entities. Hand-written DDL under `db/` only if the repository already manages schema that way.
- Never edit or delete a migration that is already on `main`; add a new one. Never hand-edit the model snapshot.
- Read every generated migration and its SQL before keeping it: no table, column, index or drop that the model does not call for.
- `Down` must reverse `Up`. If it cannot (data would be lost), say so in the end report.
- Names are exactly as modelled, including case and `snake_case`. Map them explicitly (`ToTable`, `HasColumnName`); do not add a naming-convention package.
- Types are exactly as modelled. Usual shapes: `uuid` keys, `text` strings, `numeric(p,s)` for money (never `real`, `double precision` or `float`), `timestamptz` for instants stored in UTC, `date` for calendar dates.
- Indexes, unique and check constraints, foreign keys and cascade rules only as modelled. No "helpful" extra index. If a query needs one that is not modelled, record a question.
- No seed data, triggers, functions, views or extensions unless the model lists them and an AC needs them.
- SQL always uses parameters. Never build SQL by concatenating or formatting strings, and never take an identifier (table, column, sort direction) from input. Use LINQ first; `FromSql($"...")` or `ExecuteSqlAsync($"...")` when SQL is needed. Do not use `FromSqlRaw` or `ExecuteSqlRaw` with a built string.
- No `DROP`, `TRUNCATE`, or `DELETE`/`UPDATE` without a `WHERE` clause unless the model change requires it and the trace says so.
- Pass the current time in as a parameter (from `TimeProvider`); do not call `now()` in product SQL.

```csharp
// Parameterised: {today} becomes a parameter, not text in the statement.
var overdue = await db.Loans
    .FromSql($"""
        select id, book_id, member_id, loaned_on, due_on, returned_on
        from loan
        where returned_on is null and due_on < {today}
        """)
    .AsNoTracking()
    .ToListAsync(ct);
```
