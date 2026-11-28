---
name: api
description: Minimal API conventions for product code under src/ - endpoint groups, DTOs, validation, ProblemDetails and authorisation.
applyTo: "src/**/*.cs"
---
# API conventions

Applies to ASP.NET Core minimal API code. Versions are in `docs/context/stack.md`. Step-by-step help is in the `dotnet-minimal-api` skill. These rules apply to code you add: when an AC changes an existing endpoint that does not follow them, make the smallest change in the existing style and mention the difference in the end report; do not convert it.

- Build an endpoint only when an acceptance criterion of the active story requires it. Creating a thing does not imply listing, reading, updating or deleting it. No paging, filtering, sorting, versioning, caching, logging, retries or rate limits unless an AC states them.
- One endpoint group per feature: `src/<Api>/<Feature>/<Feature>Endpoints.cs` exposes `Map<Feature>Endpoints`, called once from `Program.cs`. Follow the existing layout if it differs.
- Requests and responses are DTO records. Never accept or return an EF Core entity, and never expose a column the AC does not mention.
- Declare request reference-type properties as nullable (`string? Title`) so a missing field reaches your validation instead of slipping through as null.
- Validate at the boundary, before any data access. Check only what the ACs state. Error keys are the JSON property names in camelCase.
- Handlers return `TypedResults` through a `Results<...>` union, take a `CancellationToken` when they await anything, and contain no business rule that an AC does not state.
- Errors are ProblemDetails (RFC 9457) with content type `application/problem+json`. Never return a bare string, a stack trace or an exception message.
- Access: if the app has no authentication at all, do not add any (that is a technical task) and say so in the end report. Otherwise use `.RequireAuthorization("<policy>")` for the role an AC names; if no AC names a role, keep the access rule the group already has. `.AllowAnonymous()` only when an AC says the endpoint is public. The role in the "As a ..." sentence is not an instruction.
- Entities and their fields come only from `docs/data-model/`, whether the data is kept in a database or in memory. The data model wins; a missing table or column is a question for the trace, not something to add.

Status mapping (a status code stated in an AC always wins):

| Outcome | Result |
|---------|--------|
| Read succeeded | `TypedResults.Ok(dto)` |
| Created | `TypedResults.Created($"/books/{id}", dto)` |
| Succeeded, nothing to return | `TypedResults.NoContent()` |
| Invalid input | `TypedResults.ValidationProblem(errors)` (400) |
| Not signed in / wrong role | 401 / 403 from the framework; do not hand-write them |
| Not found | `TypedResults.Problem(title: "...", statusCode: StatusCodes.Status404NotFound)` |
| Duplicate or state conflict | `TypedResults.Problem(title: "...", statusCode: StatusCodes.Status409Conflict)` |

```csharp
private static async Task<Results<Ok<BookResponse>, ProblemHttpResult>> GetByIsbn(
    string isbn, AppDbContext db, CancellationToken ct)
{
    var book = await db.Books.AsNoTracking()
        .Where(b => b.Isbn == isbn)
        .Select(b => new BookResponse(b.Id, b.Title, b.Isbn))
        .FirstOrDefaultAsync(ct);
    return book is null
        ? TypedResults.Problem(title: "Book not found.", statusCode: StatusCodes.Status404NotFound)
        : TypedResults.Ok(book);
}
```
