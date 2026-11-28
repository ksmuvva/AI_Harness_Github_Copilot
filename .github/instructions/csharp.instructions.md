---
name: csharp
description: C# conventions for all product and test code in this repository.
applyTo: "**/*.cs"
---
# C# conventions

Versions and language level come from `docs/context/stack.md`. These rules shape code that an acceptance criterion already requires; they never justify extra code.

- Nullable reference types stay on. No `#nullable disable` and no `!` to silence a warning: fix the type or check for null.
- File-scoped namespaces (`namespace Library.Api.Books;`). One public type per file, file named after the type, namespace follows the folder. Small request/response records may sit beside their endpoint.
- DTOs and other value-like data are `sealed record` types. Entities are classes.
- Async all the way. Every I/O call is awaited; every async method takes a `CancellationToken` as its last parameter and passes it on. Never `.Result`, `.Wait()`, `GetAwaiter().GetResult()` or `async void`.
- No static mutable state: no static field that changes after start-up, no service locator. Take dependencies as constructor or handler parameters.
- Read the time from an injected `TimeProvider`, never `DateTime.Now`, `DateTime.UtcNow` or `DateTimeOffset.UtcNow`.
- Naming: `PascalCase` for types, methods, properties and constants; `camelCase` for locals and parameters; `_camelCase` for private fields; interfaces start with `I`; async methods end in `Async` (endpoint handlers and test methods are exempt).
- Classes are `sealed` and members `private` or `internal` unless another project needs them.
- Throw only for programmer errors. Expected outcomes (not found, invalid input, conflict) are return values that the API layer maps to a status code. Never catch `Exception` to swallow it.
- No new NuGet packages. The allow-list is in `harness/config.json`. If the work seems to need another package, stop and record a question in the trace.
- User-facing text (messages, problem titles, labels) uses British English: "authorised", "cancelled", "colour". Identifiers keep the framework's spelling (`RequireAuthorization`).
- Do not reformat, rename or reorder code that your change does not need.

```csharp
namespace Library.Api.Loans;

public sealed record LoanResponse(Guid Id, Guid BookId, DateOnly DueOn);

public sealed class LoanService(AppDbContext db, TimeProvider time)
{
    public async Task<bool> IsOverdueAsync(Guid loanId, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime);
        return await db.Loans.AnyAsync(l => l.Id == loanId && l.ReturnedOn == null && l.DueOn < today, ct);
    }
}
```
