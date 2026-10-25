// Live testing against the real chat sites with dedicated TEST accounts.
//
//   node scripts/live.mjs login   Open the test browser WITHOUT remote control, to sign in (Google
//                                 refuses sign-in in automated browsers). Logins stay in .live-profile/.
//   node scripts/live.mjs open    Open the test browser with the current build. Sign in to the
//                                 test accounts here once; the logins stay in .live-profile/.
//   node scripts/live.mjs setup   Optional: copy test logins from a test Vivaldi into .live-profile/
//                                 (close Vivaldi first). Copies cookies and site storage only:
//                                 no history, bookmarks or saved passwords. Google logins do not
//                                 survive copying, so sign in to Gemini in the test browser.
//
// The test browser is Playwright's Chromium (Vivaldi cannot be driven reliably).
// .live-profile/ is git-ignored and stays on this computer. Delete it to remove the logins.

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// The test browser's profile folder, e.g. LIVE_USER_DATA="D:/Vivaldi/User Data" (no default).
const SOURCE = process.env.LIVE_USER_DATA;
export const PROFILE = resolve('.live-profile');
const EXT = resolve('dist/extension');

// Only what keeps the sites logged in.
const COPY = [
  'Local State',
  'Default/Network',
  'Default/Local Storage',
  'Default/IndexedDB',
  'Default/Preferences',
];

export async function openLive(headless = false) {
  mkdirSync(PROFILE, { recursive: true });
  return chromium.launchPersistentContext(PROFILE, {
    channel: 'chromium',
    headless,
    viewport: { width: 1280, height: 860 },
    acceptDownloads: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run'],
  });
}

// Run the command line only when this file is executed, not when another script imports it.
const command = import.meta.url === pathToFileURL(process.argv[1] ?? '').href ? process.argv[2] : undefined;
if (command === 'setup') {
  if (!SOURCE) throw new Error("Set LIVE_USER_DATA to the test browser's profile folder first.");
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(join(PROFILE, 'Default'), { recursive: true });
  for (const part of COPY) {
    const from = join(SOURCE, part);
    if (existsSync(from)) cpSync(from, join(PROFILE, part), { recursive: true });
    else console.log(`(not found, skipped: ${part})`);
  }
  console.log(`Test logins copied to ${PROFILE}`);
} else if (command === 'login') {
  // A plain browser with no remote control: Google refuses sign-in in automated browsers.
  mkdirSync(PROFILE, { recursive: true });
  const child = spawn(
    chromium.executablePath(),
    [
      `--user-data-dir=${PROFILE}`,
      '--no-first-run',
      'https://accounts.google.com/',
      'https://gemini.google.com/app',
      'https://chatgpt.com/',
      'https://claude.ai/',
      'https://grok.com/',
      'https://chat.deepseek.com/',
      'https://www.kimi.com/',
    ],
    { stdio: 'ignore' },
  );
  console.log('Sign in to the test accounts, then close the browser window.');
  await new Promise((r) => child.on('exit', r));
} else if (command === 'open') {
  const ctx = await openLive(false);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto('https://chatgpt.com/');
  for (const url of ['https://claude.ai/', 'https://gemini.google.com/app'])
    await (await ctx.newPage()).goto(url);
  console.log('Test browser open. Close it when you are done.');
  await new Promise((r) => ctx.on('close', r));
} else if (command) {
  console.log('Usage: node scripts/live.mjs open | setup');
}
