---
name: web
description: React and TypeScript conventions for the web client under web/ - components, accessible forms, the API module and WCAG 2.2 AA basics.
applyTo: "web/**"
---
# Web conventions

Versions are in `docs/context/stack.md`. Step-by-step help is in the `web-ui-accessibility` skill.

- Build only the screens, fields, buttons and messages that an acceptance criterion states. No extra columns, filters, sorting, paging, loading skeletons, toasts or settings.
- Function components in `.tsx` with typed props. No class components, no `any`, no `@ts-ignore`, no non-null `!` to quiet the compiler.
- No new UI, styling, form, state, routing or data-fetching libraries. The allow-list is in `harness/config.json`; if something seems missing, record a question.
- All HTTP goes through the one API module (`web/src/api.ts` unless the project already has one elsewhere). Components never call `fetch` themselves. The module returns typed data and turns a ProblemDetails response into a typed error with its `errors` map.
- The client shows only fields the API returns. API fields come from `docs/data-model/` through the API; the data model wins, and a field that is not there is a question, not something to add.
- Use native elements first: `<button>`, `<a href>`, `<label>`, `<input>`, `<select>`, `<table>`. No clickable `<div>` or `<span>`. Add ARIA only where no native element does the job.
- Every form control has a visible `<label>` joined by `htmlFor`/`id` (use `useId`). A placeholder is not a label.
- On a failed submit: each invalid field gets `aria-invalid="true"` and an error message element referenced by `aria-describedby`; focus moves to the first invalid field. Messages say how to fix the problem.
- After a successful action or a change of view, move focus to the new heading or announce the result in an element with `role="status"`. Never leave focus on a removed element.
- Everything works with the keyboard alone, in a logical tab order, with a visible focus indicator that is not hidden behind other content. No positive `tabIndex`.
- WCAG 2.2 AA basics: text contrast at least 4.5:1 and 3:1 for controls and focus indicators; pointer targets at least 24 by 24 CSS pixels; meaning never carried by colour alone; images have `alt`; each page has one `<h1>`, a `<title>` and `lang`; layout reflows at 320 CSS pixels wide.
- Render text as React children only. Never set raw HTML from a string. User-facing text is British English.
- Each AC that the UI satisfies has a Playwright test with the token in its title, for example `test('CSX-123/AC2 shows an error when the title is missing', ...)`, using role and label locators and an axe check.

```tsx
const id = useId();
return (
  <div>
    <label htmlFor={id}>Title</label>
    <input id={id} name="title" value={title} onChange={e => setTitle(e.target.value)}
      aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} />
    {error && <p id={`${id}-error`}>{error}</p>}
  </div>
);
```
