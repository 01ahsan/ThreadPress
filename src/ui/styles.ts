// Panel styles, applied inside a Shadow DOM so the site's CSS cannot reach them.
export const PANEL_CSS = `
:host { all: initial; }
.panel {
  --bg: #ffffff; --fg: #16181d; --muted: #646977; --line: #e6e8ee; --soft: #f4f5f8; --hover: #eceef3;
  --accent: #2457c5; --accent-2: #1d4aa8; --accent-soft: #e9effc; --accent-fg: #ffffff;
  --warn: #fff5dc; --error: #c4321f; --ring: #2457c5;
  position: fixed; top: 14px; right: 14px; z-index: 2147483647;
  width: min(372px, calc(100vw - 28px)); max-height: calc(100vh - 28px); overflow: auto; overscroll-behavior: contain;
  box-sizing: border-box; padding: 14px; border-radius: 18px;
  background: var(--bg); color: var(--fg); border: 1px solid var(--line);
  box-shadow: 0 2px 6px rgba(15, 20, 35, .06), 0 18px 48px rgba(15, 20, 35, .18);
  font: 13.5px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Bengali", "Nirmala UI", sans-serif;
  animation: tp-in .16s ease-out;
}
@keyframes tp-in { from { opacity: 0; transform: translateY(-6px) scale(.98); } }
@media (prefers-reduced-motion: reduce) { .panel { animation: none; } .bar span { animation: none !important; } }
@media (prefers-color-scheme: dark) {
  .panel { --bg: #1b1d23; --fg: #eceef4; --muted: #a2a7b5; --line: #30333c; --soft: #23262e; --hover: #2b2f38;
    --accent: #7ea2ff; --accent-2: #9bb7ff; --accent-soft: #252f4a; --accent-fg: #0d1222; --warn: #3a3222; --error: #ff8f80; --ring: #7ea2ff; }
}
* { box-sizing: border-box; }
svg { display: block; }
button, select, input { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }

.top { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.logo { width: 34px; height: 34px; color: var(--accent); flex: none; }
.logo svg { width: 34px; height: 34px; }
.heading { flex: 1; min-width: 0; }
h2 { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
.sub { margin: 0; color: var(--muted); font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
button.icon { display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 10px; background: transparent; cursor: pointer; color: var(--muted); }
button.icon:hover { background: var(--hover); color: var(--fg); }
button.icon svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

.notice { margin: 0 0 12px; padding: 10px 12px; border-radius: 12px; background: var(--accent-soft); }
.notice.warn { background: var(--warn); margin: 10px 0 0; }
.hint { margin: -4px 0 12px; color: var(--muted); font-size: 12.5px; }
a { color: var(--accent); }

.seg { display: flex; gap: 2px; padding: 3px; margin-bottom: 12px; border-radius: 12px; background: var(--soft); }
.seg button { flex: 1; border: 0; border-radius: 9px; padding: 7px 6px; background: transparent; color: var(--muted); font-weight: 600; cursor: pointer; white-space: nowrap; }
.seg button[aria-checked="true"] { background: var(--bg); color: var(--fg); box-shadow: 0 1px 3px rgba(0,0,0,.12); }
.seg button:disabled { opacity: .45; cursor: not-allowed; }

.picker { margin-bottom: 12px; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px; border-bottom: 1px solid var(--line); background: var(--soft); }
.chips button { border: 1px solid var(--line); background: var(--bg); border-radius: 999px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
.chips button:hover { border-color: var(--accent); color: var(--accent); }
.chips .count { margin-left: auto; color: var(--muted); font-size: 12px; }
.msgs { list-style: none; margin: 0; padding: 4px; max-height: 240px; overflow: auto; }
.msgs label { display: flex; align-items: flex-start; gap: 8px; padding: 7px 8px; border-radius: 8px; cursor: pointer; user-select: none; }
.msgs label:hover { background: var(--hover); }
.msgs input { margin: 2px 0 0; accent-color: var(--accent); flex: none; }
.who { flex: none; font-size: 10.5px; font-weight: 700; padding: 1px 6px; border-radius: 6px; margin-top: 1px; background: var(--soft); color: var(--muted); }
.who.assistant { background: var(--accent-soft); color: var(--accent); }
.text { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.msgs label:not(.on) .text { color: var(--muted); }

.formats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px; }
.fmt { position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 9px 4px 7px; border: 1px solid var(--line); border-radius: 12px; cursor: pointer; transition: border-color .12s, background .12s; }
.fmt:hover { background: var(--soft); }
.fmt.on { border-color: var(--accent); background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent); }
.fmt input { position: absolute; opacity: 0; pointer-events: none; }
.fmt:has(input:focus-visible) { outline: 2px solid var(--ring); outline-offset: 2px; }
.badge { display: grid; place-items: center; min-width: 34px; height: 22px; padding: 0 5px; border-radius: 6px; font: 800 10px/1 ui-monospace, Consolas, monospace; color: #fff; letter-spacing: .02em; }
.b-pdf { background: #d93f2e; } .b-docx { background: #2b62d9; } .b-md { background: #3a3f4b; } .b-html { background: #e2711d; }
.b-txt { background: #6b7280; } .b-json { background: #8a4fd8; } .b-tex { background: #148a5c; }
.name { font-size: 12px; font-weight: 600; }

.more { margin-bottom: 12px; border-radius: 12px; }
.more summary { cursor: pointer; color: var(--muted); font-weight: 600; padding: 4px 2px; list-style: none; display: flex; align-items: center; gap: 6px; }
.more summary::-webkit-details-marker { display: none; }
.more summary::before { content: ""; width: 6px; height: 6px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(-45deg); transition: transform .15s; }
.more[open] summary::before { transform: rotate(45deg); }
.row { display: flex; align-items: flex-start; gap: 8px; padding: 6px 2px; cursor: pointer; }
.row input { margin: 2px 0 0; accent-color: var(--accent); }
.row small { display: block; color: var(--muted); font-size: 11.5px; }
.row select { margin-left: auto; border: 1px solid var(--line); border-radius: 8px; padding: 3px 8px; background: var(--bg); }

.actions { display: flex; gap: 8px; }
button.primary { flex: 1; border: 0; border-radius: 12px; padding: 11px 14px; background: var(--accent); color: var(--accent-fg); font-weight: 700; font-size: 14px; cursor: pointer; transition: background .12s; }
button.primary:hover:not(:disabled) { background: var(--accent-2); }
button.primary:disabled { opacity: .45; cursor: not-allowed; }
button.square { width: 44px; height: auto; border: 1px solid var(--line); border-radius: 12px; }
button.square:disabled { opacity: .45; cursor: not-allowed; }

.status { min-height: 18px; margin-top: 10px; color: var(--muted); font-size: 12.5px; overflow-wrap: anywhere; }
.status:empty { display: none; }
.bar { height: 4px; border-radius: 4px; background: var(--soft); overflow: hidden; margin-bottom: 6px; }
.bar span { display: block; height: 100%; width: 35%; border-radius: 4px; background: var(--accent); animation: tp-slide 1.1s ease-in-out infinite; }
@keyframes tp-slide { from { transform: translateX(-100%); } to { transform: translateX(300%); } }
.error { color: var(--error); }

.privacy { display: flex; align-items: center; gap: 6px; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); color: var(--muted); font-size: 11.5px; }
.privacy svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex: none; }
`;
