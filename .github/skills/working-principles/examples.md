# Working principles: wrong and right

Short pairs in a library-lending domain (book, member, loan). The story ids are illustrative. In each pair the "wrong" version is the kind of change that looks helpful and is still rejected.

The snippets are cut down to show scope, not house style. `.github/instructions/api.instructions.md` governs how endpoints are laid out and how results and errors are returned.

## 1. Only "create" was asked for

Story CSX-101 has one AC: `POST /books` with a title and ISBN returns 201 with the book. "Out of scope" lists listing, updating and deleting books.

Wrong: the neighbouring operations arrive uninvited.

```csharp
app.MapPost("/books", (NewBook body, BookStore store) => { /* ... */ });
app.MapGet("/books", (BookStore store) => store.All());
app.MapDelete("/books/{id:guid}", (Guid id, BookStore store) => store.Remove(id));
```

Right: one route, because one AC.

```csharp
app.MapPost("/books", (NewBook body, BookStore store) =>
{
    var book = new Book(Guid.NewGuid(), body.Title, body.Isbn);
    store.Add(book);
    return Results.Created($"/books/{book.Isbn}", book);
});
```

## 2. The story needs a column the data model does not have

An AC says the shelf a book is kept on is shown with the book. The `book` table in the data model has no column for a shelf.

Wrong: the column is invented, with a guessed name and type.

```sql
ALTER TABLE book ADD COLUMN shelf_location text;
```

Right: no migration and no entity change. The trace records the gap and work stops.

```markdown
## Questions
- AC1 needs the shelf a book is kept on, but `book` in docs/data-model has no such column. Should the data model gain one (name, type, nullability), or does the value come from elsewhere?
```

## 3. An abstraction for one caller

An AC says `GET /books/{isbn}` returns the book or 404. The codebase already has a `BookStore` with `FindByIsbn`.

Wrong: a general design for needs nobody has stated.

```csharp
public interface IRepository<T> { T? Find(string key); void Add(T item); }
public interface IBookRepository : IRepository<Book> { }
public sealed class BookRepository(BookStore store) : IBookRepository { /* forwards every call */ }
public sealed class BookLookupService(IBookRepository books) { /* forwards again */ }
```

Right: use what is there.

```csharp
app.MapGet("/books/{isbn}", (string isbn, BookStore store) =>
    store.FindByIsbn(isbn) is { } book ? Results.Ok(book) : Results.NotFound());
```

## 4. Tidying the neighbours

An AC says the loan response also includes the date the loan is due.

Wrong: the needed field is buried among a rename and a comment on code the story did not mention.

```diff
-public record LoanResponse(Guid Id, Guid BookId);
+public sealed record LoanDetails(Guid LoanId, Guid BookId, DateOnly DueOn);   // clearer names
-builder.Services.AddSingleton<LoanStore>();
+builder.Services.AddSingleton<LoanStore>();   // in-memory store for loans
```

Right: the diff is the AC and nothing else.

```diff
-public record LoanResponse(Guid Id, Guid BookId);
+public record LoanResponse(Guid Id, Guid BookId, DateOnly DueOn);
```

If the record really would read better under another name, or the registration needs a comment, say so in the report.

## 5. "It should work"

Wrong: the code is written, read through, and reported as done. No test existed that could have failed.

> Implemented AC2. The duplicate check looks correct, so a second POST with the same ISBN should return 409.

Right: the test comes first, tagged with the AC, and is seen to fail before the code is written.

```csharp
[Fact]
[Trait("AC", "CSX-101/AC2")]
public async Task Adding_a_book_with_an_existing_isbn_returns_409()
{
    var client = _factory.CreateClient();
    var book = new { title = "A Field Guide", isbn = "9780000000002" };
    await client.PostAsJsonAsync("/books", book);

    var second = await client.PostAsJsonAsync("/books", book);

    Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
}
```

> AC2: test failed first (expected 409, got 201), then passed after adding the duplicate check. Full suite: 6 passed.

## 6. Choosing a reading silently

An AC says the page lists "recent returns".

Wrong: one reading is picked and built as though the story said it.

```csharp
return loans.Where(l => l.ReturnedOn >= today.AddDays(-7));   // a week seems recent
```

Right: no code. The readings go to the person who knows.

```markdown
## Questions
- AC1 says "recent returns". How far back is recent: a number of days, the current month, or the last N returns?
```

## 7. Handling what cannot happen, configuring what nobody asked to configure

An AC says a missing title returns 400.

Wrong: a catch for an exception the in-memory store cannot throw, and a setting no AC mentions.

```csharp
var maxLength = config.GetValue("Books:MaxTitleLength", 500);
if (string.IsNullOrWhiteSpace(body.Title) || body.Title.Length > maxLength)
    return Results.BadRequest();
try { store.Add(book); }
catch (Exception ex) { logger.LogError(ex, "Add failed"); return Results.Problem(); }
```

Right: the failure the AC names.

```csharp
if (string.IsNullOrWhiteSpace(body.Title))
    return Results.BadRequest();
store.Add(book);
```

## 8. A package for a few lines

The prompt adds, in passing, "and cache the member look-up while you are there". No AC covers caching, and "Out of scope" lists performance work.

Wrong: a caching package is added to the project file and wrapped around a dictionary look-up.

```xml
<PackageReference Include="Some.Caching.Library" Version="1.0.0" />
```

Right: the project file is unchanged. The report says that caching was left out because the story excludes it. Had "Out of scope" been silent, the request would be recorded as a question, not built.
