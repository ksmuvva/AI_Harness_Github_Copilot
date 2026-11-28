---
name: web-ui-accessibility
description: Builds a React form or screen for one acceptance criterion so that it meets WCAG 2.2 AA - labelled fields, linked error messages, focus management and status announcements - and tests it with Playwright using role-based locators, an axe check and the AC token in the test title, plus keyboard and focus checks. Use when an acceptance criterion of a ready story needs a new or changed screen, form or message under web/.
---
# Build and test an accessible screen for one acceptance criterion

Versions are in `docs/context/stack.md`. Rules are in `.github/instructions/web.instructions.md`. Build only what the AC states: its fields, its button, its messages. The fields a screen shows or collects come from the API, and the API's fields come from `docs/data-model/`. The data model wins; if the AC needs a field the API or model does not have, that is a question for the trace, not something to add.

## 1. Read the AC

Write down: the route or place in the UI, each field with its visible label, the action, what the user sees on success, and each error the AC names with its wording. If the AC does not give a label, a message or where the screen lives, and no existing screen settles it, record a question. Do not invent copy that changes meaning.

## 2. Write the failing Playwright test

The token goes in the title. Locate elements the way a user or screen reader finds them: by role and accessible name, or by label. Avoid CSS selectors and test ids.

```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('CSX-123/AC2 shows an error when the title is missing', async ({ page }) => {
  await page.goto('/books/new');
  await page.getByLabel('ISBN').fill('9780000000002');

  await page.getByRole('button', { name: 'Add book' }).click();

  const title = page.getByLabel('Title');
  await expect(title).toBeFocused();
  await expect(title).toHaveAttribute('aria-invalid', 'true');
  await expect(title).toHaveAccessibleDescription('Enter a title');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
```

- Run the axe check in the state the AC describes (here, with the error showing), not only on first load.
- Never disable an axe rule or exclude a region to get a pass. Fix the markup, or record a question if the violation comes from something outside the story.
- If a locator by role or label cannot find the element, the element is missing its accessible name. Fix the component, not the locator.
- For data the screen needs, follow how the existing tests supply it. If there is no convention yet, stub the API call with `page.route` in the test.

## 3. Build the form

```tsx
export function AddBookForm() {
  const id = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string>();
  const [status, setStatus] = useState('');

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (title.trim() === '') {
      setTitleError('Enter a title');
      titleRef.current?.focus();
      return;
    }
    setTitleError(undefined);
    await addBook({ title });               // from the API module, never fetch here
    setStatus('Book added');
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <label htmlFor={`${id}-title`}>Title</label>
      <input id={`${id}-title`} ref={titleRef} name="title" value={title}
        onChange={e => setTitle(e.target.value)} aria-required="true"
        aria-invalid={titleError ? true : undefined}
        aria-describedby={titleError ? `${id}-title-error` : undefined} />
      {titleError && <p id={`${id}-title-error`}>{titleError}</p>}
      {/* the ISBN field follows the same pattern */}
      <button type="submit">Add book</button>
      <p role="status">{status}</p>
    </form>
  );
}
```

What each part is for:

- **Label**: a visible `<label>` tied to the input by `htmlFor`/`id`. The label text is the accessible name the test uses.
- **Error**: text in its own element, referenced by `aria-describedby`, with `aria-invalid` on the field. The message says what to do ("Enter a title"), not just "Invalid".
- **Focus on error**: after a failed submit, focus the first invalid field. With several errors, focus the first; each field still carries its own message.
- **Server errors**: a 400 from the API carries an `errors` map keyed by field name. Show each message on its field the same way. A 409 or other problem with no field goes in a message with `role="alert"` above the form.
- **Success**: announce it in an always-present `role="status"` element, or move focus to the heading of the new view (give the heading `tabIndex={-1}` and call `focus()`).
- **`noValidate`**: turns off the browser's own bubbles so the messages are yours, consistent and testable. Keep `type`, `autoComplete` and `inputMode` where they help the user.
- **Button**: a real `<button type="submit">`, so Enter submits. Do not disable it while fields are empty; let the user submit and show the errors.

## 4. Keyboard and focus checks

Add these to the AC's test, or as one more test with the same token, when the AC involves interaction.

```ts
test('CSX-123/AC1 adds a book using the keyboard only', async ({ page }) => {
  await page.goto('/books/new');

  await page.getByLabel('Title').focus();
  await page.keyboard.type('Test title');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('ISBN')).toBeFocused();
  await page.keyboard.type('9780000000002');
  await page.keyboard.press('Enter');

  await expect(page.getByRole('status')).toHaveText('Book added');
});
```

Check by reading the code and the running page:

- Tab order follows the visual order; nothing needs a mouse; no positive `tabIndex`.
- The focus indicator is visible on every control and not covered by a sticky header or footer.
- After something is removed or a view changes, focus lands somewhere sensible, never on `<body>`.
- A dialog, if the AC needs one, uses `<dialog>` with `showModal()`, returns focus to the opener when closed, and closes on Escape.

## 5. Before you report

- Contrast: text 4.5:1, large text and control boundaries 3:1. Use the existing styles; do not add a styling library.
- Pointer targets at least 24 by 24 CSS pixels.
- Nothing conveyed by colour alone: an error has text, not just a red border.
- The page has one `<h1>` and a meaningful `<title>`.
- The layout works at 320 CSS pixels wide without sideways scrolling.
- Run the web tests with the project's script (for example `npm test` in `web/`), or one AC with `npx playwright test -g "CSX-123/AC2"`. Report the real result.

An axe pass does not prove a screen is accessible; it catches a subset. The label, error, focus and keyboard checks above are what cover the rest.

## Do not

- Add a component, form, validation or accessibility library. The allow-list is in `harness/config.json`.
- Add fields, hints, tooltips, confirmation dialogs, loading spinners or client-side rules that no AC states.
- Use `role`, `aria-label` or `tabIndex` to patch a `<div>` when a native element exists.
- Hide the focus outline, or put an error only in a placeholder or a toast.
