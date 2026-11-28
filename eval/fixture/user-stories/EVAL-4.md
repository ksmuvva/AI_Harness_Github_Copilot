---
id: EVAL-4
title: Add a book
status: ready
entities: [book]
depends-on: []
---

## Story
As a librarian, I want to add a book, so that it can be found and lent.

## Acceptance criteria
- **AC1** Given a title and an ISBN that no book uses, when a client sends `POST /books` with `{"title": "...", "isbn": "..."}`, then the response is 201 and the JSON body contains the new book's `id`, `title` and `isbn`.
- **AC2** Given the title or the ISBN is missing or empty, when a client sends `POST /books`, then the response is 400 and no book is added.
- **AC3** Given a book with the same ISBN already exists, when a client sends `POST /books`, then the response is 409 and no book is added.

## Out of scope
- Listing, updating or deleting books.
- Database persistence. Use the provided in-memory `BookStore`.

## Open questions
- (none)
