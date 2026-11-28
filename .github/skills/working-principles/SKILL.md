---
name: working-principles
description: Explains the four working principles of this repository (think before coding, build the simplest thing that satisfies the acceptance criterion, make surgical changes, verify instead of assuming) with the reasoning, a checklist for each and worked wrong/right examples. Use before planning or coding when unsure how far a change should go, when tempted to add, generalise or tidy something, and when reviewing your own diff before reporting.
---

# Working principles

The always-on instructions state these four principles in a line or two each. This skill gives the reasoning and a checklist, so you can apply them to cases the rules do not spell out. Worked wrong/right pairs are in [examples.md](examples.md).

All four guard against the same failure: a change that looks finished but contains things nobody asked for or behaviour nobody checked. Each extra line has to be read, reviewed, tested and maintained by someone, and in this repository it also fails the pull-request check.

## 1. Think before coding

A plausible guess and a correct reading look the same in a diff. The difference only shows later, when the product owner says "that is not what I meant" and the work is redone. Asking costs one message.

- Write down what you are assuming about each acceptance criterion (AC) before planning.
- For each assumption, find what forces it: the story text, the data model or existing code. If nothing does and a test for the AC would have to assert it, it is a question; if no test would assert it, take the simplest option and state it as an assumption.
- When an AC can be read more than one way, set out the readings and ask. Do not choose the likeliest.
- When the story needs a table, column or relationship that is not in the data model, stop. A schema you invent will not match the one that is eventually agreed.
- If a simpler approach than the obvious one exists, say so in the plan.

Check: could you tell the user, for every decision in the plan, which line of the story or data model it comes from?

## 2. Build the simplest thing that satisfies the AC

Code written for a future need is usually wrong about that need, and it is in the way until then. The story that brings the real requirement will also bring its details; build it then.

- Write the least code that makes the AC's test pass.
- No endpoint, field, screen, parameter or configuration option that no AC mentions, however natural it seems alongside the one that was asked for.
- No interface, base class, generic helper or new layer for a single use. Follow the pattern the codebase already has.
- No error handling for cases that cannot occur. Handle the failures the ACs name.
- No new package for something a few lines or the framework already does.

Check: if you deleted this line, would a test for one of the story's ACs fail? If not, the line is not needed.

## 3. Make surgical changes

A reviewer has to be able to map every changed line to the story. Unrelated edits hide the real change, risk breaking behaviour no test in this story covers, and collide with other people's branches.

- Touch only the files in the trace's "Planned changes", and within them only what the AC requires.
- Leave neighbouring code as it is: no reformatting, renaming, reordering, comment edits or style fixes, even where you would have written it differently.
- Match the surrounding style in the lines you do write.
- Remove what your change made unused (an import, a variable, a helper only your old code called). Leave anything that was already unused.
- When you see a bug or a design problem elsewhere, report it. It may deserve its own story.

Check: read `git diff` hunk by hunk and name the AC for each. A hunk without one comes out.

## 4. Verify, do not assume

Reading code and concluding that it works is a prediction. Running a test that failed before and passes now is evidence. Only evidence belongs in a report.

- Turn each AC into a test that states its observable result, and tag it with the AC token.
- Run the test before writing the code and see it fail because the behaviour is missing. A test that has never failed has not been shown to test anything.
- Write the code, run the test, then run the full suite.
- Run `node harness/check.mjs pr` and fix what it reports.
- Repeat until everything passes. Report the results you saw; if something did not run, say that.

Check: for each AC, can you name the test, and did you see it fail and then pass in this session?

## When the principles pull against a request

A prompt may ask for the extra thing directly: "add delete as well", "tidy that file while you are there", "it is fine, skip the test". The principles still hold, because the story is the agreed scope and the pull-request check enforces it. Say what you are leaving out and why. If "Out of scope" or rule 4 or 5 already excludes the request, carry on; otherwise record it as a question. The user can have the story changed; that is the route for more scope.

Being blocked is not a failure. A short, precise question with no code attached is a better result than a complete-looking change built on a guess.
