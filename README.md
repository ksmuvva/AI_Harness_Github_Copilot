# Copilot agent harness

This repository is a harness that GitHub Copilot's agent in VS Code loads. It makes Copilot build a .NET + PostgreSQL + React case-management product one user story at a time, strictly inside the story's acceptance criteria (ACs) and an authoritative data model. The repository root is the workspace root: product code is built in this same repository, under `src/`, `tests/`, `web/` and `db/`. Those folders do not exist yet; Copilot creates them through stories.

The harness has three layers, weakest to strongest:

| Layer | What it is | Where | How strong |
|-------|------------|-------|------------|
| 1. Guidance | Always-on instructions, path-scoped instructions, skills, custom agents | `.github/` | Advisory. The model reads it; nothing guarantees it complies. |
| 2. Hooks | Local, fast feedback that denies some tool calls | `.github/hooks/harness.json`, `harness/hook.mjs` | Preview feature. A user or an organisation policy can switch it off, and a hook that times out lets the call through. |
| 3. Pull-request check | `node harness/check.mjs pr` in GitHub Actions, plus CODEOWNERS | `.github/workflows/harness-check.yml`, `.github/workflows/dotnet-test.yml` | Enforcement. The agent cannot bypass it once the ruleset is on. |

Full design reference: [docs/harness.md](docs/harness.md).

## 1. Set up VS Code

Do this once on each machine. It takes about ten minutes.

Every label, command and setting name below is taken from the VS Code and GitHub Copilot documentation as published on 25 November 2026 (VS Code 1.148). They were read from the documentation, not observed in a live session, so steps 1.5 and 1.6 are checks you run yourself. If a label differs on your machine, VS Code has changed: tell a code owner.

### 1.1 What you need

| Need | Version | How to check |
|------|---------|--------------|
| VS Code | 1.143 or later | `code --version` |
| GitHub Copilot | Any Copilot plan. Copilot Chat is built into VS Code, so there is no extension to install. | Hover the Copilot icon in the Status Bar and select **Use AI Features**, then sign in. |
| Node.js | 20 or later | `node --version`. Restart VS Code after installing Node: the hooks need Node on the PATH of VS Code itself, not only of a terminal. |
| git | Any current version | `git --version` |
| .NET SDK | The version in [docs/context/stack.md](docs/context/stack.md) | `dotnet --version` |

There is nothing to `npm install` for the harness.

On a Copilot Business or Enterprise seat, your organisation must allow two GitHub policies: **Copilot Agent Mode in IDE Chat** and **Editor preview features**. Hooks are a Preview feature, so they are switched off when preview features are not allowed.

### 1.2 Open the folder and trust it

1. **File > Open Folder** and choose the repository root. Open it as a single folder, not as one folder of a multi-root workspace: hooks are loaded from one folder only.
2. When VS Code asks whether you trust the folder, choose to trust it.

Check: Command Palette (`Ctrl+Shift+P`, or `Cmd+Shift+P` on a Mac) > **Workspaces: Manage Workspace Trust** shows the folder as trusted.

Why: in Restricted Mode VS Code disables agents altogether, so nothing in this harness loads.

### 1.3 Add the settings

Command Palette > **Preferences: Open User Settings (JSON)**. Add these keys inside the outer braces of that file:

```json
{
  "chat.useHooks": true,
  "chat.hooks.showWarnings": true,
  "chat.tools.global.autoApprove": false,
  "chat.defaultConfiguration": { "mode": "interactive", "approvals": "manual" },
  "chat.tools.edits.autoApprove": {
    "**/.github/**": false,
    "**/harness/**": false,
    "**/user-stories/**": false,
    "**/docs/data-model/**": false,
    "**/docs/context/**": false
  }
}
```

| Setting | VS Code default | What it does here |
|---------|-----------------|-------------------|
| `chat.useHooks` | `true` | Lets Copilot run the hooks in `.github/hooks/`. You only need the line if hooks were switched off. |
| `chat.hooks.showWarnings` | `false` on Stable | Shows hook errors in the chat. Without it a broken hook is silent. This is the one line that changes a default. |
| `chat.tools.global.autoApprove` | `false` | `true` would approve every tool call without asking you. Keep it `false`. |
| `chat.defaultConfiguration` | interactive, manual | Starts every new chat in the normal mode with Manual permissions. |
| `chat.tools.edits.autoApprove` | `{}` | Asks you before Copilot saves an edit under the protected folders. It is a prompt, not a block. |

These go in **User** settings because the repository cannot set them for you:

- Copilot takes `chat.useHooks` from User settings or from an organisation policy, never from `.vscode/settings.json`.
- `chat.tools.global.autoApprove` and `chat.tools.edits.autoApprove` are application-level settings. The copy of the second one in this repository's `.vscode/settings.json` is not applied.
- If you use a VS Code profile other than the default one, put the two `autoApprove` settings in **Preferences: Open Application Settings (JSON)** instead.

Instructions, skills and custom agents need no setting. Settings that older guides quote, such as `github.copilot.chat.codeGeneration.useInstructionFiles`, apply only to the deprecated Local mode.

### 1.4 Start every chat the same way

Do these in order, before you send the first prompt. The first two cannot be changed once a chat has started.

1. In the Chat view, select **New Chat** (`+`).
2. Open the **Session Target** control in the chat input and select **Copilot**. Do not use **Local**: it is deprecated, it is removed in February 2027, and it does not run this repository's hooks. The chat title shows the target as a prefix.
3. Open the **Agent** dropdown and select `story-builder`.
4. Leave the permissions picker on **Manual permissions**. **Assisted permissions** is acceptable. Never use **Allow all**: it also skips the edit prompts from step 1.3.
5. Do not select **Autopilot** in the mode picker.

While Copilot works, it asks you to approve some commands. Choose **Allow Once**. Do not choose **Always Allow** for a command that installs something or uses the network. To review what you have allowed: Command Palette > **Chat: Manage Tool Approval**.

Start a new chat after you change any setting or any file under `.github/`.

### 1.5 Check that VS Code loaded the harness

With a Copilot chat open, run Command Palette > **Chat: Open Customizations** and look at each tab:

| Tab | You should see |
|-----|----------------|
| Instructions | `copilot-instructions.md` and the five files from `.github/instructions/`, with no errors |
| Skills | 11 skills, including `plan-story` and `implement-story` |
| Agents | `story-builder` and `story-reviewer`, with no file errors |
| Hooks | `harness.json`, with no **Won't run** badge |
| MCP Servers | No server that can reach the web |

Two shortcuts: type `/hooks` in the chat input to open the Hooks tab, and type `/` to list the skills.

### 1.6 Check that the hooks really run

The tab in step 1.5 shows that VS Code found the hooks. This step shows that they ran.

1. Delete `.harness/hook.log` if it exists.
2. Start a chat as in step 1.4 and send: `Read README.md and tell me its title`
3. In a terminal at the repository root, run:

   ```
   node harness/check.mjs doctor
   ```

It must end with `PASS`. It also prints `last hook call` (the time must be the prompt you just sent), `tools seen` (the tool names Copilot used) and `denies`.

Repeat this step after every VS Code update. An old log also passes, which is why you delete it first.

### 1.7 If something is wrong

| What you see | Likely cause | What to do |
|--------------|--------------|------------|
| `story-builder` is not in the Agent dropdown | The Session Target is not Copilot, or the folder is not trusted | Redo steps 1.2 and 1.4 in a new chat. Then look for a file error on the Agents tab (step 1.5). |
| The Hooks tab shows **Won't run** | The folder is not trusted, `chat.useHooks` is `false`, or an organisation policy has switched hooks off | The badge gives the reason. For a policy, ask your administrator. |
| `doctor` fails with `DOCTOR_HOOKS ... has no ... entry` | The hooks did not run | Check the Hooks tab. Check `node --version` and restart VS Code. Make sure the chat used the Copilot target. |
| `doctor` fails with `DOCTOR_HOOKS ... none names a tool` | The hooks ran but could not read what Copilot sent | Send `.harness/hook.log` to a code owner. The hook needs updating. |
| `doctor` fails with `DOCTOR_SECOND_SOURCE` | Another AI assistant's file is in the repository root | Remove it. See step 1.8. |
| Copilot writes code without showing a plan first | The skills did not load, or the wrong agent is selected | Type `/` in the chat input and check that `plan-story` is listed. Check the Agent dropdown. |
| Tool calls are slow, or denied with a reason this README does not mention | Your own hooks or plugins also run in this workspace | Look at the Hooks tab for entries that are not `harness.json`. |
| A hook error appears in the chat | `harness/hook.mjs` failed | Report it with the output of `doctor`. |

For anything else, set `"chat.agentHost.agentDebugLog.enabled": true` in User settings, start a new chat, and open **Show Agent Debug Logs** from the Chat view `...` menu. It lists what was discovered and why something was skipped.

### 1.8 Keep these out of the workspace

- **Other assistants' files.** Copilot also reads `AGENTS.md`, `GEMINI.md`, `.agents/skills/`, `.github/copilot/settings.json` and some other tools' dot-folders as live instructions or hooks. Any of them would be a second set of rules. The dot-folders this repository names in `.gitignore` cannot be committed, and the pull-request check rejects an `AGENTS.md` on a story branch.
- **Web-capable MCP servers.** A server in your user-level `~/.copilot/mcp-config.json` applies to every workspace, including this one. Disable it for the session on the MCP Servers tab (step 1.5).

Hooks are a Preview feature. A user or a policy can switch them off, and a hook that takes longer than 10 seconds is skipped. That is why the pull-request check exists: it does not depend on anyone's local settings.

## 2. Repo admin, once

| Task | Detail |
|------|--------|
| Ruleset on `main` | Require a pull request before merging. Require the status checks `harness-check` and `dotnet-test`. Require review from code owners. |
| CODEOWNERS | `.github/CODEOWNERS` covers `.github/`, `harness/`, `user-stories/`, `docs/data-model/`, `docs/context/`, `eval/`, `.vscode/`, `README.md`, the files directly under `docs/`, `AGENTS.md`, `.gitignore` and `.gitattributes`. Replace the owner in that file with your own team if you copy this repository. |

GitHub offers a status check in the ruleset only after its workflow has run once. Without the ruleset, layer 3 reports problems but does not block a merge.

## 3. Build a story

1. Check the story file. `user-stories/<ID>.md` must be on `main` with `status: ready`. If it is not, see [user-stories/README.md](user-stories/README.md).
2. Create the branch from `main`: `git switch -c story/CSX-123-create-case main`. The story ID is read from the branch name.
3. Open a new chat with the `story-builder` agent and send: `Plan story CSX-123`
4. Review `docs/traces/CSX-123.md`. Every AC has a test. "Planned changes" is no wider than the story. "Questions" is `- (none)`. If there are questions, get them answered by the story owner; do not let Copilot guess.
5. In the same chat, send: `Implement story CSX-123`. In a new chat Copilot shows the plan again and asks for the go-ahead first.
6. Run the checks. Copilot runs them too, but look at the result yourself:

   ```
   dotnet test
   node harness/check.mjs pr
   ```

   Run the web tests as well if `web/` changed. `dotnet test` needs the .NET SDK named in `docs/context/stack.md`. Stories that touch the database also need Docker running: the integration tests start a real PostgreSQL with Testcontainers.
7. Open a pull request to `main`. `harness-check` and `dotnet-test` must be green. Optionally ask the `story-reviewer` agent for a read-only review first.

One story per branch, one branch per pull request.

Story `T-1` (scaffold the API with a health endpoint) is the worked example: read the story in `user-stories/T-1.md` and its plan in `docs/traces/T-1.md`.

## 4. What the harness enforces

Check codes are printed as `FAIL <CODE> <message>`. Each code is explained in [docs/harness.md](docs/harness.md).

| Rule | Guidance (advisory) | Hook (local) | Pull-request check |
|------|---------------------|--------------|--------------------|
| Work on a story branch only | Rule 1; session-start context names the branch and story | Denies product edits on any other branch | `BRANCH`, `STORY_MISSING` |
| Build only `ready` stories | Rule 2; `plan-story` refuses a draft | Denies product edits when the story is missing or not `ready` | `STORY_NOT_READY`, story lint (`STORY_*`) |
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
  workflows/dotnet-test.yml     runs dotnet test once a solution file exists
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
- **Hooks are weak enforcement.** They are a Preview feature, a user or an organisation policy can disable them, and they need a trusted folder. A hook that times out lets the call through, and `harness/hook.mjs` deliberately allows the call when it hits an internal error.
- **Hook tool names are unconfirmed.** GitHub publishes the tool names of the Copilot runtime, and the hook matches those. Which names VS Code actually sends was not observed in a live session. Run `doctor` after a real session and compare the tool names it prints with the patterns in `harness/hook.mjs`. A tool the hook does not recognise is not blocked.
- **The check sees files, not intent.** `SCOPE` catches a file outside the plan. It does not catch an extra endpoint inside a planned file, or a column in code that is not in the data model. The trace review and the pull-request review cover those.
- **The check takes its script and its rules from the base branch.** The workflow runs the base branch's copy of `harness/check.mjs`, and `pr` reads `harness/config.json` from the base ref, so a pull request cannot relax either. A pull request can still edit the workflow file itself. Only `PROTECTED` and code-owner review of `.github/` and `harness/` stop that, so the ruleset in section 2 is not optional.
- **The allow-list and the stack are defaults.** Review `harness/config.json` (`allowedPackages`) and `docs/context/stack.md` before the first story.
- **The editing confirmation is a prompt, not a block.** `chat.tools.edits.autoApprove` is read from each developer's User settings (step 1.3), not from `.vscode/settings.json`, and **Allow all** skips it.

Attribution for the working principles is in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
