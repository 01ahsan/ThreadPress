# ThreadPress

Save your AI chats as files. Free, private, no sign-up.

**Works on:** ChatGPT, Claude, Gemini, Grok, DeepSeek and Kimi.

**Saves as:** PDF, Word, Markdown, HTML, LaTeX, plain text or JSON. Equations, code, tables and every language stay intact.

## Install on Chrome, Edge or Brave

1. [Download ThreadPress](https://github.com/01ahsan/ThreadPress/releases/latest/download/ThreadPress-extension.zip).
2. Open the downloaded file and choose **Extract all**. You get a folder called **ThreadPress**.
3. Type `chrome://extensions` in the address bar and press Enter. (Edge: `edge://extensions`. Brave: `brave://extensions`.)
4. Turn on **Developer mode**.
5. Click **Load unpacked** and select the **ThreadPress** folder.

That's it: an **Export chat** button now appears on the right edge of every AI chat page.

## Install on Firefox

ThreadPress is coming to Firefox Add-ons. Until then, either:

- **Try it now:** extract the same download, type `about:debugging#/runtime/this-firefox` in the address bar, click **Load Temporary Add-on…**, and pick `manifest.json` in the **ThreadPress** folder. Firefox removes it when it restarts.
- **Use the bookmark:** open the [install page](docs/index.html), click **Download raw file**, open the file, and drag the **ThreadPress** button onto your bookmarks bar.

## Use

1. Open a chat and click the **Export chat** button on the right edge of the page (or the ThreadPress icon in the toolbar).
2. Choose **Whole chat**, or **Choose messages** to tick the ones you want.
3. Pick a format and click **Export**.

For a PDF, choose **Save as PDF** in the print window that opens.

**Just one answer?** Click the export icon next to that message's Copy button, then pick PDF, Word, Markdown or Copy.

Want only a few lines? Highlight them first, then click ThreadPress.

## Your privacy

- Everything happens in your browser. Nothing is uploaded.
- No account, no tracking, no ads.
- Your name, email and other chats are never included in the file.

## Problems?

[Report a problem](https://github.com/01ahsan/ThreadPress/issues)

---

<details>
<summary>For developers</summary>

```
npm ci
npm run check        # lint, types, unit tests, build
npm run test:e2e     # browser tests in Chromium, Firefox and WebKit, incl. fuzz and stress
FUZZ_RUNS=5000 npx playwright test tests/e2e/fuzz.spec.ts   # bigger fuzz run (FUZZ_SEED replays a failure)
npm run test:live    # real sites with your own test accounts (see scripts/live.mjs)
```

When a chat site changes its layout, see [docs/fixing-a-site.md](docs/fixing-a-site.md).

</details>

## Licence

MIT © 2026 01ahsan. ThreadPress includes [Preact](https://preactjs.com) (MIT); see `THIRD_PARTY_NOTICES.txt` in the download.

ThreadPress is an independent project and is not affiliated with or endorsed by OpenAI, Anthropic, Google, xAI, DeepSeek or Moonshot AI. Product names belong to their owners.
