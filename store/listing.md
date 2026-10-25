# Store listing (copy and paste)

Images: `store/screenshots/*.png` (1280×800), `store/promo-440x280.png`, icon `assets/icons/icon-128.png`.
Packages (from the latest GitHub release): `chrome-edge.zip` for Chrome and Edge, `firefox.zip` for Firefox.
Privacy policy URL: https://github.com/01ahsan/ThreadPress/blob/main/PRIVACY.md

## Name

ThreadPress – AI Chat Exporter

## Short description (max 132 characters)

Save AI chats as PDF, Word, Markdown and more, with equations and code intact. Free, private, nothing leaves your device.

## Long description

ThreadPress saves your AI conversations as clean, readable files.

Works with ChatGPT, Claude, Gemini, Grok, DeepSeek and Kimi.

• Export the whole chat, chosen messages, or a single answer from its own toolbar
• PDF, Word (.docx), Markdown, HTML, LaTeX, plain text and JSON
• Equations stay real equations: editable in Word, sharp in PDF, original LaTeX in Markdown
• Code blocks, tables, lists and every language (Bengali, Chinese, Arabic…) come through intact
• Long chats are read in full, even when the site only shows part of them at a time

Private by design
• Works entirely in your browser: no account, no tracking, no ads
• Makes no network requests and asks for no permissions
• Never includes your name, email or other chats in exported files

Free and open source (MIT): https://github.com/01ahsan/ThreadPress

ThreadPress is an independent project and is not affiliated with OpenAI, Anthropic, Google, xAI, DeepSeek or Moonshot AI.

## Category

Productivity

## Single purpose (Chrome)

Export the AI chat conversation open in the current tab to a file (PDF, Word, Markdown and other formats).

## Permission justification (Chrome)

- Content scripts on chatgpt.com, chat.openai.com, claude.ai, gemini.google.com, grok.com, x.com/i/grok, chat.deepseek.com, kimi.com and kimi.moonshot.cn: to read the conversation the user chooses to export and to show the export button. No other permissions are requested.
- Remote code: No. All code is in the package.

## Data use (Chrome "Privacy practices" / Edge / Firefox)

- Collects or transmits user data: **No** (none of the listed categories).
- Sold to third parties: No. Used for unrelated purposes: No. Used for creditworthiness: No.
- Firefox manifest declares `data_collection_permissions: none`.

## Note for Firefox reviewers (source code)

The add-on is bundled and minified with esbuild. Source: https://github.com/01ahsan/ThreadPress (tag matching the version).
Build: Node.js 22+, then `npm ci && npm run build`. The Firefox package is `dist/store/firefox.zip`.
