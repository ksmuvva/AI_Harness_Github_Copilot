<!--
Story pull request (branch story/<ID>-<slug>): fill in every section.
Maintenance pull request (branch harness/... or stories/...): replace the sections below
with what changed and why. Product paths (src, tests, web, db) must be untouched.
-->

## Story

- Story ID: <!-- e.g. CSX-123; one story per pull request -->
- Story file: `user-stories/<ID>.md`
- Trace file: `docs/traces/<ID>.md`

## Acceptance criteria

List every AC in the story with the test that proves it. The test carries the token `<ID>/AC<n>`.

- [ ] AC1: `<test file>`: `<test name>`
- [ ] AC2: `<test file>`: `<test name>`

## Checks

- [ ] Questions answered: "Questions" in the trace file is `- (none)`.
- [ ] `harness-check` is green on this pull request.
- [ ] Nothing outside the story: every changed file is covered by "Planned changes" in the trace, and no endpoint, field, screen, option, package or refactor was added that no AC asks for.

## Notes for the reviewer

<!-- Anything left out because it is out of scope, and any problem noticed in other code but not fixed here. -->
