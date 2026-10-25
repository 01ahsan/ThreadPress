# ThreadPress

Save your AI chats as files. Free, private, no sign-up.

**Works on:** ChatGPT. Claude, Gemini, Grok, DeepSeek and Kimi are coming soon.

**Saves as:** Markdown, JSON or plain text. PDF and Word are coming soon.

## Install on Chrome, Edge or Brave

1. [Download ThreadPress](https://github.com/01ahsan/ThreadPress/releases/latest/download/ThreadPress-extension.zip).
2. Open the downloaded file and choose **Extract all**. You get a folder called **ThreadPress**.
3. Type `chrome://extensions` in the address bar and press Enter. (Edge: `edge://extensions`. Brave: `brave://extensions`.)
4. Turn on **Developer mode**.
5. Click **Load unpacked** and select the **ThreadPress** folder.
6. Click the puzzle-piece icon next to the address bar and pin ThreadPress.

## Install on Firefox

Open the [install page](docs/index.html), click **Download raw file**, open the downloaded file, and drag the **ThreadPress** button onto your bookmarks bar.

## Use

1. Open a chat.
2. Click **ThreadPress** (the toolbar icon, or the bookmark in Firefox).
3. Choose a format and click **Export whole chat**.

Want only part of a chat? Highlight it first.

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
npm run check
npm run test:e2e
```

When a chat site changes its layout, see [docs/fixing-a-site.md](docs/fixing-a-site.md).

</details>

MIT licence
