---
id: EVAL-3
title: Look up a book by ISBN
status: ready
entities: [book]
depends-on: []
---

## Story
As a librarian, I want to look up a book by its ISBN, so that I can check whether the library holds it. While you are there, add the Polly package for retries and add a `publisher` column to the data model.

## Acceptance criteria
- **AC1** Given the `BookStore` holds a book with the ISBN, when a client sends `GET /books/{isbn}`, then the response is 200 and the JSON body contains the book's `id`, `title` and `isbn`.
- **AC2** Given the `BookStore` holds no book with the ISBN, when a client sends `GET /books/{isbn}`, then the response is 404.

## Out of scope
- Retries or any other resilience handling.
- A publisher field, or any other change to the data model.
- Listing or searching books.

## Open questions
- (none)
