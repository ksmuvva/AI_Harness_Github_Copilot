# Copilot agent harness

This repository is a harness that GitHub Copilot's agent in VS Code loads. It makes Copilot build a .NET + PostgreSQL + React case-management product one user story at a time, strictly inside the story's acceptance criteria (ACs) and an authoritative data model. The repository root is the workspace root: product code is built in this same repository, under `src/`, `tests/`, `web/` and `db/`. Those folders do not exist yet; Copilot creates them through stories.

The harness has three layers, weakest to strongest:

| Layer | What it is | Where | How strong |
|-------|------------|-------|------------|
| 1. Guidance | Always-on instructions, path-scoped instructions, skills, custom agents | `.github/` | Advisory. The model reads it; nothing guarantees it complies. |
| 2. Hooks | Local, fast feedback that denies some tool calls | `.github/hooks/harness.json`, `harness/hook.mjs` | Preview feature. A user can switch it off. Fails open. |
| 3. Pull-request check | `node harness/check.mjs pr` in GitHub Actions, plus CODEOWNERS | `.github/workflows/harness-check.yml` | Enforcement. The agent cannot bypass it once the ruleset is on. |

Full design reference: [docs/harness.md](docs/harness.md).

## 1. Set up your machine

Every developer does this once. The settings come from the current VS Code and GitHub Copilot documentation (November 2026). They were not confirmed in a live session when this was written, so step 9 is how you confirm them on your machine.

1. Install a current VS Code with the GitHub Copilot extension and sign in.
2. Put Node 20 or later and git on your PATH. Hooks and checks run with Node. There is nothing to `npm install`.
3. Open the repository root as the workspace folder and trust it (Workspace Trust). Hooks and custom agents do not run in an untrusted folder.
4. In the chat view, use the **Copilot** agent harness (not "Local") and pick the `story-builder` agent.
5. Add these to your **User** settings (Command Palette: "Preferences: Open User Settings (JSON)"). Hooks are read from User scope, so the repository cannot set them for you.

   ```json
   {
     "chat.useHooks": true,
     "chat.hooks.showWarnings": true,
     "chat.tools.global.autoApprove": false
   }
   ```

   Keep the session permission level at Manual (or Assisted). Do not use "Allow all" or Autopilot.
6. Do not add web-capable MCP servers at user level for this workspace.
7. Do not keep other AI assistants' config files in the repository root. They are gitignored, but the Copilot runtime can read some of them as live hooks or instructions.
8. Create `story/<ID>-<slug>` from `main` before you ask Copilot to build anything.
9. Confirm the set-up. Open a new chat, send one prompt that makes Copilot use a tool (for example "Read README.md and tell me its title"), then run:

   ```
   node harness/check.mjs doctor
   ```

   It ends with `PASS` when Node, git, the harness files and the hooks are in order. It also prints the tool names the hook has seen and the number of denies. Rerun it after every VS Code or Copilot update.

   Also check that the agent can load skills: on a story branch, `Plan story <ID>` should end with `docs/traces/<ID>.md` written and a request for your approval. If Copilot starts coding instead, tell it to read `.github/skills/plan-story/SKILL.md`, and report it to a code owner.

If `doctor` reports `DOCTOR_HOOKS`, the hooks did not run: recheck steps 3, 4 and 5. Hooks are a Preview feature and any user can switch them off. That is why the pull-request check exists: it does not depend on anyone's local settings.

## 2. Repo admin, once

| Task | Detail |
|------|--------|
| Ruleset on `main` | Require a pull request before merging. Require the status check `harness-check`. Require review from code owners. |
| CODEOWNERS | `.github/CODEOWNERS` covers `.github/`, `harness/`, `user-stories/`, `docs/data-model/`, `docs/context/`, `eval/` and `.vscode/`. Replace the owner in that file with your own team if you copy this repository. |

GitHub offers `harness-check` in the ruleset only after the workflow has run once. Without the ruleset, layer 3 reports problems but does not block a merge.

## 3. Build a story

1. Check the story file. `user-stories/<ID>.md` must be on `main` with `status: ready`. If it is not, see [user-stories/README.md](user-stories/README.md).
2. Create the branch from `main`: `git switch -c story/CSX-123-create-case main`. The story ID is read from the branch name.
3. Open a new chat with the `story-builder` agent and send: `Plan story CSX-123`
4. Review `docs/traces/CSX-123.md`. Every AC has a test. "Planned changes" is no wider than the story. "Questions" is `- (none)`. If there are questions, get them answered by the story owner; do not let Copilot guess.
5. Send: `Implement story CSX-123`
6. Run the checks. Copilot runs them too, but look at the result yourself:

   ```
   dotnet test
   node harness/check.mjs pr
   ```

   Run the web tests as well if `web/` changed. `dotnet test` needs the .NET SDK named in `docs/context/stack.md`. Stories that touch the database also need Docker running: the integration tests start a real PostgreSQL with Testcontainers.
7. Open a pull request to `main`. `harness-check` must be green. Optionally ask the `story-reviewer` agent for a read-only review first.

One story per branch, one branch per pull request.

## 4. What the harness enforces

Check codes are printed as `FAIL <CODE> <message>`. Each code is explained in [docs/harness.md](docs/harness.md).

| Rule | Guidance (advisory) | Hook (local) | Pull-request check |
|------|---------------------|--------------|--------------------|
| Work on a story branch only | Rule 1; session-start context names the branch and story | Denies product edits on any other branch | `BRANCH`, `STORY_MISSING` |
| Build only `ready` stories | Rule 2; `plan-story` refuses a draft | Denies product edits when the story is missing or `draft` | `STORY_NOT_READY`, story lint (`STORY_*`) |
| Build only what the ACs state | Rule 2; trace reviewed before coding | None | `SCOPE` (a file outside the plan), reviewer |
| Plan first, and keep the plan current | Workflow: `plan-story`, `story-change-impact` | None | `TRACE_MISSING`, `TRACE_STORY`, `TRACE_STALE` |
| Open questions block merge | "When blocked" section | None | `QUESTIONS`, `STORY_QUESTIONS` |
| Every AC has a test | Test instructions; token `<ID>/AC<n>` | None | `AC_UNTESTED` |
| Data model is the only source of schema | Rule 3; database instructions and skills | Denies edits under `docs/data-model/` | `STORY_ENTITY`, `PROTECTED`, reviewer |
| No new packages | Rule 4; allow-list in `harness/config.json` | Denies install commands | `PACKAGE` |
| No web lookups or downloads | Rule 4; the agents have no web tool | Denies web tools, `curl`, `wget` and similar | None |
| Harness, stories and config are off limits on a story branch | Rule 5 | Denies edits to protected paths | `PROTECTED`, code-owner review |
| Maintenance branches do not touch product code | Pull-request template | Denies product edits | `MAINT_PRODUCT` |
| No forced push, no skipped git hooks | None | Denies `git push --force` and `--no-verify` | None. The ruleset stops direct pushes to `main`. |

## 5. Prove it works

There are two different claims. They are proven in different ways.

**The guard scripts and the pull-request check do what they say.** This is tested automatically. The unit tests cover the library, the checks, the hook decisions and the eval grader. They run on every pull request and push to `main`.

```
node --test harness/tests/
```

The directory form is for Node 20. On Node 22 or later run `node --test "harness/tests/*.test.mjs"`.

**Copilot actually behaves under the harness.** No script can prove this. It can only be shown by running Copilot against traps in a live session. The eval sets up a throwaway sandbox repository with six stories in a neutral library-lending domain. Five are traps (a draft story, a missing column, an instruction smuggled into story prose, a hostile prompt, an ambiguous AC) and one is a normal story that must be built correctly.

```
node harness/eval.mjs init ../harness-eval
node harness/eval.mjs list
node harness/eval.mjs start EVAL-1 --dir ../harness-eval
node harness/eval.mjs grade EVAL-1 --dir ../harness-eval
```

1. `init` creates the sandbox. The directory must be outside this repository and must not exist yet (or be empty).
2. `start` resets the sandbox to branch `story/<ID>-eval` and prints the prompt. After the first trap add `--force`; it discards the previous trap's changes, so grade first.
3. Open the sandbox folder in VS Code, trust it, start a **new** chat with the `story-builder` agent, and paste the prompt.
4. Do not help Copilot. If it shows a plan, reply `Go ahead.` and nothing else. If it asks a question, do not answer. When it stops, run `grade`. It prints `PASS` or `FAIL` for each expectation and a verdict.
5. Repeat for `EVAL-2` to `EVAL-6`, with a fresh chat each time. After the first trap, run `node harness/check.mjs doctor --root ../harness-eval` to confirm the hooks fired in the sandbox.

Pass bar: all five traps pass and `EVAL-4` (the normal story) passes, on the model your team actually uses. No run has been recorded yet. Until one is, treat layers 1 and 2 as unproven. One run is one sample, for one model on one day. The full procedure, what the eval does not prove, the results table and the optional ablation run are in [eval/README.md](eval/README.md).

## 6. What you still have to supply

The harness ships without your project's content. Nothing useful can be built until these exist.

| What | Where | Notes |
|------|-------|-------|
| Data model | `docs/data-model/` | Authoritative tables, columns, types and relationships. Until it exists, a `ready` story that lists entities fails lint. See [docs/data-model/README.md](docs/data-model/README.md). |
| Project context | `docs/context/` | Glossary, roles, business rules, decisions. Ships empty apart from `stack.md`. See [docs/context/README.md](docs/context/README.md). |
| Ready stories | `user-stories/` | One file per story, lint-clean, set to `ready` by a code owner. See [user-stories/README.md](user-stories/README.md). |

All three change only on maintenance branches (`harness/<slug>` or `stories/<slug>`) with code-owner review.

## 7. Repo map

```
.github/
  copilot-instructions.md   always-on rules (the only always-on file)
  instructions/             path-scoped rules for C#, API, database, tests, web
  agents/                   story-builder, story-reviewer
  skills/                   on-demand how-to guidance (plan-story, implement-story, ...)
  hooks/harness.json        wires harness/hook.mjs into Copilot (Preview)
  workflows/harness-check.yml   the pull-request check
  CODEOWNERS, pull_request_template.md
harness/
  config.json               ID pattern, protected paths, package allow-list
  check.mjs                 lint-stories, hash, pr, doctor
  hook.mjs                  session-start context and tool-call denies
  eval.mjs                  the trap eval
  lib.mjs, tests/           shared code and unit tests
user-stories/               one file per story, plus README and _TEMPLATE
docs/
  harness.md                design reference
  confluence-page.md        short wiki page, ready to paste
  data-model/               authoritative data model (you supply it)
  context/                  stack.md and your project context
  traces/                   one plan per story, written by Copilot
eval/                       traps and the sandbox fixture
src/ tests/ web/ db/        product code; created by stories, not present yet
```

## 8. Limits and known gaps

- **Instructions are advisory.** Layer 1 guides the model. It does not guarantee compliance.
- **Hooks are weak enforcement.** They are a Preview feature, a user can disable them in User settings, they need a trusted folder, and `harness/hook.mjs` fails open on any error or timeout.
- **Hook tool names are unconfirmed.** VS Code does not publish the tool names its agent uses. The hook matches a list of known names. Run `doctor` after a real session and compare the tool names it prints with the patterns in `harness/hook.mjs`. A tool the hook does not recognise is not blocked.
- **The check sees files, not intent.** `SCOPE` catches a file outside the plan. It does not catch an extra endpoint inside a planned file, or a column in code that is not in the data model. The trace review and the pull-request review cover those.
- **The check takes its script and its rules from the base branch.** The workflow runs the base branch's copy of `harness/check.mjs`, and `pr` reads `harness/config.json` from the base ref, so a pull request cannot relax either. A pull request can still edit the workflow file itself. Only `PROTECTED` and code-owner review of `.github/` and `harness/` stop that, so the ruleset in section 2 is not optional.
- **The allow-list and the stack are defaults.** Review `harness/config.json` (`allowedPackages`) and `docs/context/stack.md` before the first story.
- **The editing confirmation in `.vscode/settings.json` is partial.** It asks for an extra confirmation on some protected folders. It is a prompt, not a block.

Attribution for the working principles is in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
