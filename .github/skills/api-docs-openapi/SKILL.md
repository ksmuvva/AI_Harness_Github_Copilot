---
name: api-docs-openapi
description: Keeps the generated OpenAPI document accurate for exactly the endpoints a story built or changed - operation names, summaries, request and response schemas, status codes, examples and ProblemDetails - shows how to check the generated document in a test, and how to write the short API section of the story's end report. Use after adding or changing an HTTP endpoint, and when writing the end report for a story that touched the API.
---
# Keep the API document true

The OpenAPI document is generated from the endpoints by the built-in generator (`Microsoft.AspNetCore.OpenApi`; versions in `docs/context/stack.md`). Your job is to make the endpoint metadata say what the endpoint really does. Document only endpoints that exist and that this story built or changed. Schemas come from the DTOs, and DTO fields trace back to `docs/data-model/`: the data model wins, so never document a field that is not there; a missing column is a question for the trace, not something to add.

## 1. Is there a document at all?

Look in `Program.cs` for `builder.Services.AddOpenApi()` and `app.MapOpenApi()`.

- Both present: follow sections 2 and 3.
- Absent: do not add them (that is a technical task, not part of a story unless an AC says so). Skip to section 4.

## 2. Describe each endpoint you built or changed

This metadata counts as part of an endpoint this story built. Add it only there, and only when the app already publishes a document.

```csharp
var group = app.MapGroup("/books").WithTags("Books");

group.MapGet("/{isbn}", GetByIsbn)
    .WithName("GetBookByIsbn")
    .WithSummary("Look up a book by ISBN")
    .ProducesProblem(StatusCodes.Status404NotFound);
```

| Item | Rule |
|------|------|
| Operation name | `WithName`, PascalCase verb plus noun, unique in the app. Never rename an existing one: clients depend on it |
| Summary | `WithSummary`, one short imperative phrase in British English, no full stop. Add `WithDescription` only for a rule from an AC that a caller must know |
| Tag | `WithTags` once on the group, the plural feature name |
| Request schema | The request DTO record. Never an entity, never `object` |
| Response schemas | The response DTO per success status; ProblemDetails for errors |
| Status codes | Exactly the codes the handler can return. No more, no fewer |

How status codes get into the document:

- A handler that returns `Results<Ok<BookResponse>, ...>` with `TypedResults` documents `Ok<T>`, `Created<T>`, `NoContent` and `ValidationProblem` by itself. Do not repeat them with `Produces`.
- `ProblemHttpResult` (from `TypedResults.Problem`) carries no status in its type. Add one `.ProducesProblem(<status>)` for each such status the handler returns (404, 409).
- For an endpoint that requires authorisation, add `.Produces(StatusCodes.Status401Unauthorized)` and `.Produces(StatusCodes.Status403Forbidden)`.
- Untyped results (`Results.Ok(value)`, anonymous objects) leave the schema empty. Use `TypedResults` and a DTO.

Required fields: the document must agree with the validation. A field the handler rejects when missing should be listed under `required` in the request schema. Check the generated schema; if it disagrees, adjust the DTO annotation (for example `[Required]`), never the validation. If you cannot make them agree without a new package or a document transformer, say so in the end report rather than leaving it silently wrong.

Examples: use the mechanism the project already has (XML documentation `<example>` elements when documentation-file generation is on, or an existing transformer). If there is none, do not build one; put a request and response example in the end report instead. Example values are fictional.

Do not add: endpoints that do not exist yet, "planned" or "deprecated" notes nobody asked for, servers, contact or licence details, security schemes, a UI for browsing the document, a version bump, or a new package.

If the story removed or changed an endpoint, the document changes with it automatically; remove any now-wrong `Produces` lines.

## 3. Check the generated document

Web tools and command-line HTTP clients are off in this harness, so a test is the only way to check the document. Write this test only when an AC states something about the API document, and give it that AC's token. Otherwise add no test and say in the end report that the document was not checked.

```csharp
[Fact]
[Trait("AC", "CSX-123/AC1")]
public async Task OpenApi_document_describes_the_book_lookup()
{
    var json = await factory.CreateClient().GetStringAsync("/openapi/v1.json");
    using var document = JsonDocument.Parse(json);

    var operation = document.RootElement.GetProperty("paths").GetProperty("/books/{isbn}").GetProperty("get");

    Assert.Equal("GetBookByIsbn", operation.GetProperty("operationId").GetString());
    var statuses = operation.GetProperty("responses").EnumerateObject().Select(r => r.Name).Order().ToArray();
    Assert.Equal(new[] { "200", "404" }, statuses);
}
```

- Use the document route the app maps (`/openapi/v1.json` is the default). It is often mapped only in the Development environment, which is what `WebApplicationFactory` uses by default.
- Assert the path and verb, the operation name and the exact set of status codes. That catches both a missing code and an undocumented extra.
- While writing the test, read the whole operation once (write it to the test output) and confirm by eye: request body schema is the request DTO, each response points at the right schema, error responses use `application/problem+json`, and nothing mentions a field the AC does not.
- At most one such test per endpoint, in the endpoint's integration test class.

## 4. The API section of the end report

Short, factual, one row per endpoint built or changed in this story. If the story touched no endpoint, write "API: no change".

```markdown
### API
| Method and route | Access | Request | Responses | AC |
|------------------|--------|---------|-----------|----|
| GET /books/{isbn} | Librarian | none | 200 BookResponse; 404 problem | AC1, AC2 |

BookResponse: id (uuid), title (string), isbn (string).
OpenAPI: operation GetBookByIsbn, checked by OpenApi_document_describes_the_book_lookup.
Not documented: nothing.
```

- "Responses" lists every status the handler returns and nothing else.
- "Not documented" names anything you could not make accurate and why (for example a `required` flag that needs a transformer). Write "nothing" only when that is true.
- If no test checked the document, end the "OpenAPI" line with "not checked by a test" instead.
- If the app has no OpenAPI document, replace the "OpenAPI" line with "OpenAPI: the app does not publish a document".
- Do not describe endpoints this story did not touch.
