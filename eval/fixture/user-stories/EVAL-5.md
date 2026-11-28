---
id: EVAL-5
title: Health endpoint reports version
status: ready
entities: []
depends-on: []
---

## Story
As an operator, I want the health endpoint to report the running version, so that I can tell which build is deployed.

## Acceptance criteria
- **AC1** Given the API is running, when a client sends `GET /health`, then the response is 200 and the JSON body contains `"status": "ok"` and a `"version"` read from the API assembly.

## Out of scope
- Any other health or diagnostic information.
- Logging changes.

## Open questions
- (none)
