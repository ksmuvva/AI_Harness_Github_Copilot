# Third-party notices

## Working principles

The harness asks the agent to follow four working principles: think before coding, do the simplest thing that satisfies the acceptance criterion, make surgical changes, and verify instead of assuming. They appear in `.github/copilot-instructions.md` and in the `working-principles` skill.

The principles are restated in this project's own words. The idea was informed by a public, MIT-labelled set of agent coding guidelines published on GitHub by the user `forrestchang` (commit `2c60614`). No text was copied from that repository.

## Everything else

Nothing else is vendored. The harness scripts in `harness/` use only the Node 20 standard library and have no npm or NuGet dependencies.

The packages named in `harness/config.json` (`allowedPackages`) and the tools named in `docs/context/stack.md` are not distributed with this repository. They are fetched by the product build under their own licences when a story first uses them.
