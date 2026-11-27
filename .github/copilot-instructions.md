# Copilot instructions

- Treat the end-user request and its acceptance criteria as the source of truth. If behavior is unclear, ask for clarification instead of inventing product requirements.
- Make the smallest complete change that meets the agreed requirements and preserves existing behavior.
- Add or update tests for changed behavior, especially the stated acceptance criteria. Avoid adding dependencies when the existing .NET libraries are sufficient.
- Before finishing, run `dotnet build` for the affected project and `dotnet test` when a test project exists. Report the commands run and their results.
- Update the README when setup or user-facing behavior changes.
