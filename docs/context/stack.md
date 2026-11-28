# Stack

This file is the single place for technology choices and versions.

- The repository owner maintains it. Copilot never edits it.
- Skills and instruction files defer to it. Where they need a version they say "the versions in `docs/context/stack.md`" instead of repeating a number.
- Changing a choice or a version is a maintenance-branch change (`harness/<slug>`) with code-owner review. See `docs/harness.md`, "Update the stack".

## Choices and versions

| Area | Choice | Version |
|------|--------|---------|
| Runtime | .NET (LTS) | 10 |
| Language | C# | 14 |
| API | ASP.NET Core minimal APIs | 10 |
| API description | Built-in OpenAPI document generation (`Microsoft.AspNetCore.OpenApi`) | 10 |
| Data access | EF Core with the Npgsql provider | 10 |
| Database | PostgreSQL | 17 |
| Web UI | React with Vite and TypeScript | React 19 |
| Unit and integration tests | xUnit | as allow-listed |
| Acceptance tests | Reqnroll (Gherkin) | as allow-listed |
| UI and accessibility tests | Playwright with axe | as allow-listed |
| Accessibility target | WCAG 2.2 level AA | - |

Target framework for every .NET project: `net10.0`.

## Rules that follow from this file

- Use only what is listed here. A framework, library, tool or service that is not listed is not part of the stack; ask before assuming it.
- The packages that may be referenced are the ones in `harness/config.json` under `allowedPackages`. The pull-request check fails with `PACKAGE` for anything else.
- Where the table says "as allow-listed", use the current stable release of the allow-listed package that supports the runtime above.
- These are defaults shipped with the template. The owner should review them before the first story is built.

`eval/fixture/docs/context/stack.md` is a copy of this file used by the eval sandbox. Update both in the same pull request.
