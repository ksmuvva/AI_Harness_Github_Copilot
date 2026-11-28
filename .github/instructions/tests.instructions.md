---
name: tests
description: Test conventions for .NET tests under tests/ - AC tokens, test structure, real PostgreSQL and deterministic time.
applyTo: "tests/**"
---
# Test conventions

Frameworks and versions are in `docs/context/stack.md`. Patterns and fixtures are in the `dotnet-testing` skill.

- Every acceptance criterion of the active story has at least one test carrying the literal token `<ID>/AC<n>`: xUnit `[Trait("AC", "CSX-123/AC1")]`, Reqnroll tag `@CSX-123/AC1` on the scenario. Use the story ID from the branch name. Never add a token for another story and never change the token on an existing test.
- Write the test first, watch it fail for the reason you expect, then make it pass.
- One behaviour per test. Several assertions are fine when they describe the same outcome. No loops, branches or `try/catch` in a test body.
- Test names are sentences: `Adding_a_book_with_a_duplicate_isbn_returns_409`. The name states the condition and the expected result.
- Arrange, act, assert, in that order, separated by blank lines, with exactly one act.
- No assertion-free tests. Assert on what a caller can observe (status code, response body, stored row), not on which internal methods ran.
- Test each outcome an AC names (for example each status code). Do not write tests for behaviour that no AC states.
- When an AC describes API behaviour, test through HTTP with `WebApplicationFactory<Program>`. Use a plain unit test only for a pure rule.
- When the code under test reads or writes the database (a `DbContext` or SQL), write integration tests against real PostgreSQL started by Testcontainers. Never use the EF Core in-memory provider or SQLite as a stand-in. If Docker is not available, report that; do not swap the database.
- The test database schema comes from the migrations, and the schema comes from `docs/data-model/`. The data model wins; if a test needs a table or column that is not modelled, record a question instead of adding it.
- No `Thread.Sleep`, `Task.Delay` or polling to wait for time to pass. Product code takes `TimeProvider`; tests supply a fixed one.
- Tests are deterministic: no dependence on run order, today's date, random values, machine culture or time zone. Each test creates the data it needs.
- Never skip, weaken or delete an existing test to get a green run. If an existing test contradicts the AC, stop and record a question.
- Use xUnit `Assert` and hand-written fakes. No new assertion, mocking or data-generation packages.
- Test data is fictional: names like "Sam Reader", addresses under `example.test`.

```csharp
[Fact]
[Trait("AC", "CSX-123/AC3")]
public async Task Adding_a_book_with_a_duplicate_isbn_returns_409()
{
    var client = factory.CreateClient();
    await client.PostAsJsonAsync("/books", new { title = "First", isbn = "9780000000002" });

    var response = await client.PostAsJsonAsync("/books", new { title = "Second", isbn = "9780000000002" });

    Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
}
```
