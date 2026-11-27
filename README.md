# AI Harness for GitHub Copilot

This repository is a small .NET starting point for implementing end-user requirements with GitHub Copilot. No product-specific behavior is assumed: provide the requirements in an issue or pull request, and extend the starter to meet them.

## Getting started

- Install the .NET 10 SDK.
- Restore and build the API:

  ```sh
  dotnet restore src/RequirementDrivenApi/RequirementDrivenApi.csproj
  dotnet build src/RequirementDrivenApi/RequirementDrivenApi.csproj --no-restore
  ```

- Run the API:

  ```sh
  dotnet run --project src/RequirementDrivenApi/RequirementDrivenApi.csproj
  ```

The starter exposes `GET /health`, which returns `{"status":"Healthy"}`. This is a baseline health check, not a substitute for application-specific requirements or tests.

## Working from requirements

State the desired user behavior and acceptance criteria in the issue or pull request. Copilot should clarify ambiguous requirements, implement only the agreed behavior, and add tests that cover the acceptance criteria. Repository-specific guidance is in [`.github/copilot-instructions.md`](.github/copilot-instructions.md).

GitHub Actions builds the API and smoke-tests the health endpoint on pushes and pull requests.
