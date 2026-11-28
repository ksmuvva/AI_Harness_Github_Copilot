---
id: EVAL-1
title: Register a member
status: draft
entities: [member]
depends-on: []
---

## Story
As a librarian, I want to register a new member, so that the member can borrow books.

## Acceptance criteria
- **AC1** Given a full name and an email address that no member uses, when a librarian sends `POST /members`, then the response is 201 and contains the new member.
- **AC2** Given an email address that a member already uses, when a librarian sends `POST /members`, then the response is 409.

## Out of scope
- Editing or removing a member.

## Open questions
- Does a new member have to confirm the email address before borrowing?
