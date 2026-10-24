# Saving test pages and fixing a site

Chat sites change their page layout often. When a site breaks, or when we add a new one, ThreadPress needs a saved copy of a real conversation page (a fixture) to test against. This guide shows how to save one safely.

**Never** share a saved page without cleaning it first. It can contain your name, your email, the titles of your other chats, and private image links.

## 1. Create a test conversation

Use a fresh chat containing nothing personal. Paste the prompts below one at a time, waiting for each answer. Save one page per kind of chat:

| Fixture file              | What to ask                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plain.html`              | "Give me three tips for learning a language, as a short list."                                                                                                                                                                  |
| `maths.html`              | "Show inline maths like $e^{i\pi}+1=0$, then display equations: the quadratic formula, a 3×3 matrix, an aligned derivation over three lines, and a fraction inside a square root."                                              |
| `code-tables-images.html` | "Write the same function in Python, JavaScript and Rust, then compare the languages in a table with left, centre and right aligned columns." Also upload any harmless picture (a landscape, say) and ask "Describe this image." |
| `long.html`               | Any chat with **at least 40 messages** (ask it to count from 1 to 40, one number per reply, or reuse an old harmless chat).                                                                                                     |
| `bengali.html`            | "বাংলায় পাইথাগোরাসের উপপাদ্য ব্যাখ্যা করুন, একটি সূত্র ও একটি টেবিল সহ।" (or any non-Latin script)                                                                                                                             |

## 2. Save the page (Chrome, Edge or Firefox)

1. Scroll to the **top** of the conversation and wait until all messages have loaded, then scroll back to the bottom.
2. Press **F12** to open Developer Tools and choose the **Elements** tab (Firefox: **Inspector**).
3. Right-click the very first line, `<html …>`, and choose **Copy → Copy outerHTML** (Firefox: **Copy → Outer HTML**).
4. Open a plain text editor (Notepad, or VS Code), paste, and save as `raw-<name>.html` in a folder **outside** the project, for example `Downloads\threadpress-raw\`.

Don't use "Save page as…": it often saves the page _before_ the chat loaded.

## 3. Clean it

From the project folder, run:

```
node scripts/scrub-fixture.mjs "C:\Users\<you>\Downloads\threadpress-raw\raw-maths.html" tests/fixtures/<site>/maths.html
```

`<site>` is one of `chatgpt`, `claude`, `gemini`, `grok`, `deepseek`, `kimi`.

The script removes scripts, sidebars, account menus, email addresses, and the private parts of image links. Then **open the cleaned file and search it** (Ctrl+F) for your name, your email, your username, and the titles of your other chats. If anything is still there, delete it by hand.

## 4. Update the site's code

1. Update `src/adapters/<site>.ts` (and `src/config/sites.ts` if the site's address changed) so every message, maths formula, code block, table and image is read correctly.
2. Run `UPDATE_GOLDEN=1 npm test` to refresh the expected outputs in `tests/golden/<site>/`, and read them to check they look right.
3. Run `npm run check` and `npm run test:e2e`. Both must pass.
