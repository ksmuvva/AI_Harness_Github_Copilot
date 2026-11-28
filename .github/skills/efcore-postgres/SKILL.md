---
name: efcore-postgres
description: Maps entities with EF Core and Npgsql exactly as the authoritative data model states, and covers DbContext configuration, the migrations workflow with review of the generated SQL, concurrency tokens, transactions, read queries without N+1, and what never to do. Use when a ready story needs an entity, a DbContext change, a migration or a database query in .NET code.
---
# EF Core with PostgreSQL, mapped from the data model

Versions are in `docs/context/stack.md`. Schema facts come only from `docs/data-model/`. **The data model wins.** If a story needs a table, column, type, relationship, constraint or index that is not in the model, that is a question for the trace (skill `postgres-schema` shows how to write it), never something to add.

## 1. Map one entity exactly

Open the model, find the table, and copy names, types, nullability, keys and constraints as written. Map only entities in the story's `entities` list, and only when an AC needs them.

| Model type | C# type | Notes |
|------------|---------|-------|
| `uuid` | `Guid` | Generate with `Guid.NewGuid()` unless the model states a database default |
| `text` | `string` / `string?` | Nullability follows the model. No `HasMaxLength` unless modelled |
| `numeric(p,s)` | `decimal` | `HasPrecision(p, s)`. Never `double` or `float` for money |
| `integer` / `bigint` | `int` / `long` | |
| `boolean` | `bool` | |
| `timestamptz` | `DateTimeOffset` | Always UTC (offset zero); take it from `TimeProvider.GetUtcNow()` |
| `date` | `DateOnly` | Not `DateTime` |
| enum | as modelled | `text` with a check constraint: `HasConversion<string>()`. Native PostgreSQL enum: map it with Npgsql `MapEnum`. Integer: the default conversion. If the model does not say how it is stored, ask |

```csharp
public sealed class Loan
{
    public Guid Id { get; set; }
    public Guid BookId { get; set; }
    public Guid MemberId { get; set; }
    public DateOnly LoanedOn { get; set; }
    public DateOnly DueOn { get; set; }
    public DateOnly? ReturnedOn { get; set; }
}

public sealed class LoanConfiguration : IEntityTypeConfiguration<Loan>
{
    public void Configure(EntityTypeBuilder<Loan> b)
    {
        b.ToTable("loan");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.BookId).HasColumnName("book_id");
        b.Property(x => x.MemberId).HasColumnName("member_id");
        b.Property(x => x.LoanedOn).HasColumnName("loaned_on");
        b.Property(x => x.DueOn).HasColumnName("due_on");
        b.Property(x => x.ReturnedOn).HasColumnName("returned_on");
        b.HasOne<Book>().WithMany().HasForeignKey(x => x.BookId);
        b.HasOne<Member>().WithMany().HasForeignKey(x => x.MemberId);
    }
}
```

- Name every table and column explicitly. Do not rely on conventions or add a naming package.
- Unique constraints, indexes, check constraints, defaults and delete behaviour: configure exactly those the model lists (`HasIndex(x => x.Isbn).IsUnique()`), with the model's names if it gives names. None of your own.
- Add navigation properties only when a query for an AC needs them.

## 2. DbContext

```csharp
public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Loan> Loans => Set<Loan>();

    protected override void OnModelCreating(ModelBuilder modelBuilder) =>
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
}
```

Registered once: `builder.Services.AddDbContext<AppDbContext>(o => o.UseNpgsql(connectionString));`. Use the existing context and registration if there is one. The connection string comes from configuration, never from source. No lazy loading, no second context.

## 3. Migrations workflow

1. Change the entity and its configuration to match the model.
2. `dotnet ef migrations add <Name> --project src/<Data> --startup-project src/<Api>`, with a name that says what changed (`AddLoanTable`). The `dotnet ef` tool must already be available (`dotnet tool restore`). If it is not, stop and ask; do not install it.
3. Read the migration's `Up` and `Down`.
4. Print the SQL and read it: `dotnet ef migrations script <PreviousMigration> <Name> --project src/<Data> --startup-project src/<Api>`.
5. Compare the SQL with the model, line by line: same table and column names, types, `NOT NULL`, keys and constraints; nothing extra; no drop or rename you did not intend. Risk review is in the `postgres-schema` skill.
6. If it is wrong, `dotnet ef migrations remove`, fix the mapping and add it again. Do not hand-edit the generated files to make them match.
7. Integration tests apply migrations to their own container (`Database.MigrateAsync()`), so a broken migration fails the tests. Do not run `dotnet ef database update` against a shared database.

Migration files and the snapshot must be covered by "Planned changes" in the trace.

## 4. Reading

```csharp
var loans = await db.Loans
    .Where(l => l.MemberId == memberId && l.ReturnedOn == null)
    .OrderBy(l => l.DueOn).ThenBy(l => l.Id)
    .Select(l => new LoanResponse(l.Id, l.BookId, l.DueOn))
    .ToListAsync(ct);
```

- Project straight to the response DTO with `Select`. It reads only the needed columns and tracks nothing.
- When you must load entities for reading, add `AsNoTracking()`.
- Avoid N+1: never query inside a loop over a previous query's results. Fetch related data in the same query with a projection or a join; use `Include` only when you need the related entities themselves.
- Filter and sort in the database (before `ToListAsync`), not in memory. Order only when an AC states an order, and then add the key as a tie-breaker.

## 5. Writing

- One `SaveChangesAsync(ct)` per request is one transaction. That is the default; keep it.
- Open an explicit transaction (`await using var tx = await db.Database.BeginTransactionAsync(ct);` then `CommitAsync`) only when several saves or a raw SQL statement must succeed or fail together.
- A modelled unique constraint is the guard against duplicates. Map its violation to the outcome the AC names:

```csharp
try { await db.SaveChangesAsync(ct); }
catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
{
    return TypedResults.Problem(title: "A book with this ISBN already exists.", statusCode: StatusCodes.Status409Conflict);
}
```

- Concurrency tokens only when an AC requires conflicting edits to be detected. If the model lists a version column, mark it `IsConcurrencyToken()`. If it does not, Npgsql can use the system column `xmin` with no schema change: `b.Property<uint>("Version").IsRowVersion();`. Catch `DbUpdateConcurrencyException` and return the status the AC names.
- Raw SQL only when LINQ cannot express the query, and always parameterised: `FromSql($"...")`, `ExecuteSqlAsync($"...")`.

## Never

- `EnsureCreated()` or `EnsureDeleted()` in product code; applying migrations at application start-up unless the repository already does so.
- The EF Core in-memory provider or SQLite in tests. Use PostgreSQL through Testcontainers (skill `dotnet-testing`).
- Editing or deleting a migration that is on `main`, or hand-editing the model snapshot.
- A column, index, default, cascade rule, seed row or soft-delete flag that the model does not list.
- `FromSqlRaw` or `ExecuteSqlRaw` with a concatenated or formatted string.
- Returning entities from endpoints, or reusing one `DbContext` across parallel tasks.
- Retries, caching, auditing, interceptors or a repository layer that no AC asks for.
