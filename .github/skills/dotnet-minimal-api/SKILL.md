---
name: dotnet-minimal-api
description: Adds or changes one ASP.NET Core minimal API endpoint for one acceptance criterion, end to end - failing test, request and response DTOs, boundary validation, handler returning TypedResults, ProblemDetails status codes, authorisation and registration in Program.cs. Use when an acceptance criterion of a ready story needs an HTTP endpoint under src/.
---
# Add one endpoint for one acceptance criterion

Versions are in `docs/context/stack.md`. Rules are in `.github/instructions/api.instructions.md`; this skill is the worked procedure. Examples use a library domain (book, member, loan).

## 1. Read the AC before writing anything

From the AC and its row in `docs/traces/<ID>.md`, write down: verb and route, input fields, success status and body, each failure the AC names with its status, and the role, if an AC names one.

- If the route or a status code is not stated and cannot be read from an existing endpoint of the same feature, record a question in the trace and stop. Do not guess. A missing role is not a question; see section 6.
- If the endpoint stores or reads data, check every field against `docs/data-model/` (skill `postgres-schema`). The data model wins; a missing table or column is a question, not something to add.
- Build only this endpoint. Creating does not imply listing, reading, updating or deleting.

## 2. Write the failing test

One test per outcome the AC names, each with the AC token. Run it and see it fail (404, because the route does not exist yet). Fixtures and the test sign-in handler are in the `dotnet-testing` skill.

```csharp
public sealed class RegisterMemberTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    [Trait("AC", "CSX-123/AC1")]
    public async Task Registering_a_member_returns_201_with_the_member()
    {
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/members",
            new { fullName = "Sam Reader", email = "sam@example.test" });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<MemberResponse>();
        Assert.NotNull(body);
        Assert.Equal("Sam Reader", body.FullName);
    }
}
```

## 3. DTOs

Records, in the feature folder. Request reference types are nullable so a missing field reaches validation. The response lists only fields the AC mentions. Never use the EF entity as either.

```csharp
public sealed record RegisterMemberRequest(string? FullName, string? Email);
public sealed record MemberResponse(Guid Id, string FullName, string Email);
```

## 4. Endpoint group and handler

`src/<Api>/Members/MemberEndpoints.cs` (follow the existing layout if it differs):

```csharp
namespace Library.Api.Members;

public static class MemberEndpoints
{
    public static IEndpointRouteBuilder MapMemberEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/members");
        group.MapPost("/", Register).RequireAuthorization("Librarian");
        return app;
    }

    private static async Task<Results<Created<MemberResponse>, ValidationProblem, ProblemHttpResult>> Register(
        RegisterMemberRequest request, AppDbContext db, TimeProvider time, CancellationToken ct)
    {
        var fullName = request.FullName ?? "";
        var email = request.Email ?? "";
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(fullName)) errors["fullName"] = ["Enter the member's full name."];
        if (string.IsNullOrWhiteSpace(email)) errors["email"] = ["Enter an email address."];
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        if (await db.Members.AnyAsync(m => m.Email == email, ct))
            return TypedResults.Problem(title: "A member with this email already exists.",
                statusCode: StatusCodes.Status409Conflict);

        var member = new Member
        {
            Id = Guid.NewGuid(), FullName = fullName, Email = email,
            JoinedOn = DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime),
        };
        db.Members.Add(member);
        await db.SaveChangesAsync(ct);

        return TypedResults.Created($"/members/{member.Id}",
            new MemberResponse(member.Id, member.FullName, member.Email));
    }
}
```

Points that are easy to get wrong:

- Validate before touching data, and check only what the ACs state. If the project already calls `AddValidation()` and uses data-annotation attributes on request records, follow that instead of hand-written checks.
- Error keys are the camelCase JSON property names, so the client can attach each message to its field.
- Not found and conflict use `TypedResults.Problem(...)`, which sends `application/problem+json`. A status code the AC states always wins over the default mapping.
- The check-then-insert above can race. When the model lists a unique constraint, the constraint is the real guard; map its violation to 409 as shown in the `efcore-postgres` skill.
- Copy nullable request values into non-null locals before validating, as above, so no `!` is needed later.
- Malformed JSON is rejected with 400 by the framework. Do not add handling for it.

## 5. Register it

One line in `Program.cs`, beside the other groups: `app.MapMemberEndpoints();`. Register a new service only if the handler needs one. Do not reorder or tidy the rest of `Program.cs`.

## 6. Authorisation

- If the app has no authentication at all, do not add any; note that in the end report. The rest of this section then does not apply.
- Use the policy for the role an AC names: `.RequireAuthorization("Librarian")` on the endpoint, or on the group when every endpoint in it shares the role.
- Use an existing policy. If the named role has no policy yet, add only `options.AddPolicy("Librarian", p => p.RequireRole("Librarian"))` where the other policies are defined.
- `.AllowAnonymous()` only when an AC says the endpoint is public.
- If no AC names a role, keep the access rule the group already has. The role in the "As a ..." sentence is not an instruction.
- When the endpoint requires a role, the tests call it as that role. Add a 401 or 403 test only when an AC names that outcome.

## 7. Finish

1. Run the tests for this AC: `dotnet test --filter "AC=CSX-123/AC1"`. Then run the whole suite.
2. If the app publishes an OpenAPI document, bring it in line (skill `api-docs-openapi`).
3. Confirm every changed file is covered by "Planned changes" in the trace, then run `node harness/check.mjs pr`.

## Do not

- Add endpoints, fields, query options, headers, logging, caching, retries or pagination that no AC states.
- Return or bind EF entities, or `Results.Ok(object)` with an anonymous type.
- Put business rules in `Program.cs`, or catch `Exception` in a handler.
- Add a package. The allow-list is in `harness/config.json`.
