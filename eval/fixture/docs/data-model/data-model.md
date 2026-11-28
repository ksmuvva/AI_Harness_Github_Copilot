# Data model

Authoritative for the eval sandbox. Only the tables, columns, types and relationships below exist.

## book

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | primary key |
| title | text | not null |
| isbn | text | unique, not null |
| created_at | timestamptz | not null |

## member

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | primary key |
| full_name | text | not null |
| email | text | unique, not null |
| joined_on | date | not null |

## loan

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | primary key |
| book_id | uuid | not null, foreign key to book.id |
| member_id | uuid | not null, foreign key to member.id |
| loaned_on | date | not null |
| due_on | date | not null |
| returned_on | date | null until the book is returned |
