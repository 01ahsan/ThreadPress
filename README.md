# ThreadPress

Export AI chat conversations, whole or in part, to clean files. Free and open source, with no accounts, limits or watermarks.

> **Status:** early development (milestone 1 of 6). ChatGPT works today; Claude, Gemini, Grok, DeepSeek and Kimi come next. PDF, Word, HTML and LaTeX exports are on the way.

## Use it

1. Build it (see below) and open `dist/install.html`.
2. Drag the **ThreadPress** button to your bookmarks bar.
3. Open a chat and click the bookmark. Choose a format and press **Export whole chat**. To export only part of a chat, highlight it first.

| Format     | Notes                                                                           |
| ---------- | ------------------------------------------------------------------------------- |
| Markdown   | GitHub-flavoured, `$…$` / `$$…$$` maths, fenced code, tables, YAML front matter |
| JSON       | The structured conversation (useful for your own tools)                         |
| Plain text | UTF-8; maths kept as LaTeX                                                      |

## Privacy

ThreadPress runs only when you click it, on the page you are viewing, on your device. It:

- makes **no network requests** (the build fails if the code contains any network call);
- never reads cookies, logins, or site storage, and stores nothing itself;
- reads only the conversation, never the sidebar or your account details, and labels messages "You" and "Assistant";
- leaves image addresses out by default, because they can contain private access tokens.

## Build from source

Requires Node.js 20.19 or newer.

```
npm ci
npm run check      # lint, type-check, unit tests, build
npm run test:e2e   # end-to-end tests in Chromium (first run: npx playwright install chromium)
```

The bookmarklet is written to `dist/bookmarklet.txt`, and an install page to `dist/install.html`.

When a site changes its layout, see [docs/fixing-a-site.md](docs/fixing-a-site.md).

## Licence

MIT
