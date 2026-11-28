---
name: dotnet-testing
description: Test patterns for the .NET side of a story - xUnit tests with the AC trait, a Reqnroll feature and step bindings tagged with the story and AC, WebApplicationFactory integration tests, a Testcontainers PostgreSQL fixture, a test sign-in handler, running one test or filtering by trait, and anti-patterns to avoid. Use when turning an acceptance criterion into a failing test, or when a test under tests/ is hard to write, slow or flaky.
---
# Tests for a story's acceptance criteria

Versions are in `docs/context/stack.md`. Rules are in `.github/instructions/tests.instructions.md`. Every AC needs at least one test carrying the token `<ID>/AC<n>` (examples use `CSX-123`). Write the test first and see it fail.

## Which kind of test

| The AC describes | Write |
|------------------|-------|
| What an HTTP caller sees (status, body) | xUnit test through `WebApplicationFactory<Program>` |
| A pure rule (a calculation, a date comparison) | Plain xUnit test on the function |
| A flow the owner wants readable as given/when/then | Reqnroll scenario, if the test project already references Reqnroll |
| Anything that reads or writes the database | One of the above, backed by the PostgreSQL fixture below |

## xUnit

```csharp
public sealed class BookLookupTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    [Trait("AC", "CSX-123/AC2")]
    public async Task Looking_up_an_unknown_isbn_returns_404()
    {
        var client = factory.CreateClient();

        var response = await client.GetAsync("/books/9780000000002");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
```

- `Program` must be visible to the test project; keep the existing `public partial class Program;` line if there is one. Replace a dependency for one test with `factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => ...))`.
- Fixed time: register a small fake rather than a package, with `s.AddSingleton<TimeProvider>(new FixedTime(...))`.

```csharp
public sealed class FixedTime(DateTimeOffset now) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => now;
}
```

- Use `[Theory]` with `[InlineData]` only for the same behaviour over several inputs (each missing field returns 400), not to fold different behaviours into one test.
- Endpoints that require a role: see `test-auth.md` beside this file.

## Reqnroll

The tag on the scenario is the AC token. One scenario per AC outcome.

```gherkin
Feature: Look up a book by ISBN

  @CSX-123/AC1
  Scenario: A known ISBN returns the book
    Given a book with ISBN "9780000000002" and title "Test title" exists
    When I look up the book with ISBN "9780000000002"
    Then the response status is 200
    And the response title is "Test title"
```

```csharp
[Binding]
public sealed class BookLookupSteps(ApiDriver api)
{
    private HttpResponseMessage? _response;

    [Given("a book with ISBN {string} and title {string} exists")]
    public Task GivenABookExists(string isbn, string title) => api.AddBookAsync(isbn, title);

    [When("I look up the book with ISBN {string}")]
    public async Task WhenILookUpTheBook(string isbn) => _response = await api.Client.GetAsync($"/books/{isbn}");

    [Then("the response status is {int}")]
    public void ThenTheResponseStatusIs(int status)
    {
        Assert.NotNull(_response);
        Assert.Equal(status, (int)_response.StatusCode);
    }
}
```

- `ApiDriver` is a small class in the test project that owns the factory and `HttpClient`; Reqnroll creates it per scenario and passes it to the constructor. Reuse the existing one.
- Steps state behaviour in the story's words, not clicks or SQL. Reuse an existing step before writing a near-duplicate. Every `Then` step asserts.

## PostgreSQL fixture

For any test whose code path reaches the database. A story that keeps data in memory, or whose "Out of scope" excludes persistence, does not use it. Requires Docker; if it is not running, report that and stop. The schema comes from the migrations, which come from `docs/data-model/`: the data model wins, and a table or column a test needs but the model lacks is a question for the trace, not something to add.

```csharp
public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder().WithImage("postgres:<major>").Build();

    public string ConnectionString => _container.GetConnectionString();
    public Task InitializeAsync() => _container.StartAsync();
    public Task DisposeAsync() => _container.DisposeAsync().AsTask();
}

[CollectionDefinition("postgres")]
public sealed class PostgresCollection : ICollectionFixture<PostgresFixture>;

public sealed class ApiFactory(PostgresFixture postgres) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder) =>
        builder.UseSetting("ConnectionStrings:<name the app reads>", postgres.ConnectionString);
}
```

- `<major>` is the PostgreSQL version in `docs/context/stack.md`. If the installed Testcontainers version marks the parameterless builder constructor obsolete, pass the image to the constructor instead.
- Test classes use `[Collection("postgres")]`, take `PostgresFixture` in the constructor, and create an `ApiFactory` from it. One container serves the whole run.
- Apply migrations once after the container starts (`await db.Database.MigrateAsync()` from a scope of the factory). Never `EnsureCreated()`.
- Each test inserts its own rows with fresh keys (`Guid.NewGuid()`, a unique ISBN) and asserts only on those rows, so tests do not depend on order or on a clean database. To assert on stored data, read it back through a new scope (`factory.Services.CreateScope()`).

## Running tests

```
dotnet test                                              # everything
dotnet test --filter "AC=CSX-123/AC1"                    # xUnit tests for one AC
dotnet test --filter "Category=CSX-123/AC1"              # Reqnroll scenarios for one AC
dotnet test --filter "FullyQualifiedName~BookLookupTests" # one class
dotnet test --filter "DisplayName~unknown_isbn"          # one test by name
```

Run the single test while working, then the whole suite before reporting. Report the real result, including failures you could not fix.

## Anti-patterns

- A test with no assertion, or one that asserts only "not null" when the AC names a value.
- Asserting on internal calls or log lines instead of what the caller observes.
- `Thread.Sleep`, `Task.Delay`, retries or polling; `DateTime.Now` or random data; tests that pass only in one time zone or culture.
- The EF Core in-memory provider or SQLite standing in for PostgreSQL.
- Tests that share rows or depend on running in a certain order.
- Changing an assertion, adding `Skip`, or deleting a test to get a green run.
- Tests for behaviour no AC states, or one giant test for a whole story.
- A token for a different story, or the same token pasted onto unrelated tests to satisfy the check.
- New mocking, assertion or data-generation packages.
