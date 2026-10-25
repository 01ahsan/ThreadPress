# Changelog

All notable changes to ThreadPress. Versions follow [semantic versioning](https://semver.org).

## 1.0.1 (2026-10-25)

- The floating button's hide (×) is now always clickable; on some systems the button's corner covered it.

## 1.0.0 (2026-10-25)

First production release.

- Exports ChatGPT, Claude, Gemini, Grok, DeepSeek and Kimi chats to PDF, Word, Markdown, HTML, LaTeX, plain text and JSON, with equations, code, tables and every language intact.
- Whole chats, chosen messages, or a single message from its own toolbar.
- One download for Chrome, Edge, Brave and Firefox.
- The store icon follows Chrome's size guidelines.

## 0.6.2 (2026-10-25)

- The download now also installs in Firefox (it showed "background.service_worker is currently disabled"). Chrome and Edge need version 121 or newer.

## 0.6.1 (2026-10-25)

- The store name is now "ThreadPress - AI Chat Exporter".
- Requires Chrome or Edge 111 or newer (the version it actually needs).
- Downloads now include the licence notices of the open-source code ThreadPress uses.
- Clearer copyright and independence statements.

## 0.6.0 (2026-10-25)

Found and fixed by new automated stress testing (54,000 random exports in Chrome, Firefox and Safari's engine, plus scale, attack and scrolling stress tests):

- Long chats on slow sites or connections are now exported in full. Before, if older messages took more than about a second to load, only the newest part of the chat was exported.
- Very long chats on sites that draw messages late now keep every message in the right order (one message could be lost and the order scrambled).
- Exporting while a reply is still being written no longer keeps waiting.
- Security: chat titles can no longer disguise an exported file's real type with invisible characters.
- Grok: lists, code and tables in your own messages are no longer dropped.
- The floating button's hide (×) no longer moves away as you reach for it.

## 0.5.1 (2026-10-25)

Fixes found by testing on the real ChatGPT, Claude and Gemini sites:

- ChatGPT: prompts and answers are exported as separate messages again (they were merged into one answer).
- ChatGPT: code blocks keep their lines and language (they were exported as one-line inline code).
- ChatGPT: no extra export icon next to code blocks' own Copy buttons.
- Gemini: code blocks keep their language name.
- Text with Windows line endings no longer leaves stray characters in exports.

## 0.5.0 (2026-10-25)

- The export icon next to each message now has a light blue tint, so it stands apart from the site's own buttons.
- A short "Saved" / "Copied" note confirms single-message exports, and errors are shown instead of failing silently.
- Escape in the chat's text box no longer closes the panel, and text selected while typing is no longer offered for export.
- Security: equations in LaTeX exports can no longer run file or shell commands when compiled; IDs are masked in the page layout file.
- Word: invisible control characters can no longer make a file fail to open.
- Faster while answers are streaming in very long chats.
- Firefox package declares that it collects no data, as Firefox Add-ons now requires.

## 0.4.1 (2026-10-25)

(0.4.0 was not published; its changes shipped in 0.4.1.)

- Export a single message: an export icon now sits next to each message's own Copy button. Pick PDF, Word, Markdown or Copy, with or without your question.
- Faster reading of long chats: no message is read twice, scrolling takes bigger steps, and ThreadPress waits only as long as the site takes to load older messages.
- Short chats no longer wait to confirm there is nothing older.

## 0.3.1 (2026-10-25)

- ChatGPT: works with ChatGPT's new page layout (2026), so the Export chat button appears and whole chats export again.
- Loads older messages on sites that only respond to mouse-wheel scrolling.
- Pictures attached to your prompts are kept.
- New in Options: "Save page layout for a bug report". It saves the page's structure with no chat text, so a broken site can be fixed without sharing your conversation.

## 0.3.0 (2026-10-25)

- Exports the entire conversation, however long: ThreadPress scrolls back to the first message, waits for older messages to load, and reads every message even on sites that only keep part of the chat on screen.
- New "Export chat" button on the right edge of AI chat pages. Hover to reveal it, drag it up or down, or hide it until the page reloads.
- Faster on very long chats.

## 0.2.0 (2026-10-25)

- Works on ChatGPT, Claude, Gemini, Grok, DeepSeek and Kimi.
- New formats: PDF, Word (with real, editable equations), HTML and LaTeX, plus Markdown, text and JSON.
- Choose messages: tick the ones you want, or pick all, none, only your prompts or only the answers.
- Long chats are read in full, even on sites that only show part of the conversation at a time.
- Reasoning sections are kept and clearly marked.
- A redesigned panel, now also in Bengali.

## 0.1.0 (2026-10-25)

- Save ChatGPT conversations as Markdown, JSON or plain text, or copy them as Markdown.
- Export a whole chat, or only the part you highlight.
- Equations, code, tables and non-Latin text are kept intact.
- Works entirely on your device: no account, no tracking, nothing uploaded.
