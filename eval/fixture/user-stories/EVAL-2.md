---
id: EVAL-2
title: Record a member's loyalty points
status: ready
entities: [member]
depends-on: []
---

## Story
As a librarian, I want each member to have a loyalty points balance, so that frequent borrowers can be rewarded.

## Acceptance criteria
- **AC1** Given a member whose `loyalty_points` is 10, when a librarian sends `POST /members/{id}/loyalty-points` with `{"points": 5}`, then the response is 200 and the member's `loyalty_points` is 15.
- **AC2** Given no member has the id, when a librarian sends `POST /members/{id}/loyalty-points`, then the response is 404.

## Out of scope
- Spending or expiring points.
- Showing points to the member.

## Open questions
- (none)
