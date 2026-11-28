# Copilot agent harness

## What it is

A set of files in the product repository that GitHub Copilot's agent in VS Code loads. It makes Copilot build one user story at a time, inside that story's acceptance criteria and the agreed data model. A check on every pull request applies the same rules. It blocks a merge once the repository ruleset on `main` requires the `harness-check` status and code-owner review.

## What it includes

| Part | Where | What it does |
|------|-------|--------------|
| Always-on rules | `.github/copilot-instructions.md` | Five non-negotiable rules and the workflow. Copilot reads them on every request. |
| Path-scoped rules | `.github/instructions/` | Extra rules for C#, API, database, test and web files. |
| Agents | `.github/agents/` | `story-builder` (plans and builds a story) and `story-reviewer` (read-only review). |
| Skills | `.github/skills/` | On-demand guidance: plan a story, implement it, handle a changed story, and stack how-tos. |
| Hooks (Preview) | `.github/hooks/`, `harness/hook.mjs` | Local feedback. Denies web access, package installs and edits to protected files. |
| Pull-request check | `harness/check.mjs`, workflow `harness-check` | The enforcement. Checks branch, story status, plan, scope, packages and tests per acceptance criterion. |
| Stories | `user-stories/` | One file per story. Only `ready` stories are built. |
| Data model and context | `docs/data-model/`, `docs/context/` | The only source of schema, stack and project facts. Owned by people, not by Copilot. |
| Eval | `harness/eval.mjs`, `eval/` | Six trap stories that test whether Copilot stays inside the rules. |

## Set up your machine (once)

| # | Do this |
|---|---------|
| 1 | Install VS Code 1.143 or later. Copilot Chat is built in: select **Use AI Features** on the Copilot icon in the Status Bar and sign in. |
| 2 | Have Node 20 or later and git on your PATH. Restart VS Code after installing Node. |
| 3 | Open the repository root as a single folder and trust it (**Workspaces: Manage Workspace Trust**). |
| 4 | For every new chat: set the **Session Target** control to **Copilot** (not Local), then pick `story-builder` in the **Agent** dropdown. |
| 5 | In **User** settings set `"chat.useHooks": true`, `"chat.hooks.showWarnings": true`, `"chat.tools.global.autoApprove": false`, `"chat.defaultConfiguration": { "mode": "interactive", "approvals": "manual" }` and the `chat.tools.edits.autoApprove` block from README step 1.3. |
| 6 | Keep the permissions picker on **Manual permissions** (or **Assisted permissions**). Never **Allow all**. Do not select **Autopilot**. |
| 7 | Disable any web-capable MCP server for the session. User-level servers apply to every workspace. |
| 8 | Keep other AI assistants' files (`AGENTS.md`, `GEMINI.md` and similar) out of the repository. |
| 9 | Run **Chat: Open Customizations** and check the Agents and Hooks tabs. Then delete `.harness/hook.log`, send one prompt, and run `node harness/check.mjs doctor`. Repeat after every VS Code update. |

These steps come from the VS Code and GitHub documentation of 25 November 2026 (VS Code 1.148). The README has the click-by-click version and a troubleshooting table. Hooks are a Preview feature and a user or a policy can switch them off. The pull-request check does not depend on them.

## Day to day

1. Pick a story whose file `user-stories/<ID>.md` has `status: ready`.
2. Create the branch from `main`: `story/<ID>-<slug>`.
3. New chat, `story-builder` agent: `Plan story <ID>`.
4. Review the plan in `docs/traces/<ID>.md`. If it lists questions, get them answered before going on.
5. `Implement story <ID>`. Then run `dotnet test` and `node harness/check.mjs pr`.
6. Open a pull request. The `harness-check` status must be green and a reviewer must approve.

Stories, the data model, the context and the harness itself change only on `stories/<slug>` or `harness/<slug>` branches, with code-owner review.

## How we know it works

| Claim | Evidence |
|-------|----------|
| The guard scripts and the pull-request check behave as documented | Unit tests: `node --test harness/tests/` on Node 20, or `node --test "harness/tests/*.test.mjs"` on Node 22 or later. They run on every pull request. |
| Copilot stays inside the rules | The six-trap eval, run by a person in a live Copilot session: `node harness/eval.mjs list`. Pass bar: five traps refused or questioned correctly, one normal story built correctly. |

The second claim cannot be proven by a script. Rerun the eval after a Copilot update, a change of model, or a change to the guidance.

## Limits

- Instructions guide the model. They do not guarantee what it does.
- Hooks are Preview, can be disabled by a user, and fail open.
- The pull-request check sees files, packages and test tags. Human review still decides whether the code matches the story.

## Source of truth

This page is a summary. The repository is authoritative:

- `README.md`: set-up, daily flow, what is enforced, how to run the tests.
- `docs/harness.md`: design reference, every check code and its fix, how to change the harness.

If this page and the repository disagree, the repository is right.

## Who to ask

The code owners listed in `.github/CODEOWNERS`. Raise harness problems as an issue in the repository, with the output of `node harness/check.mjs doctor`.
