// Panel styles, applied inside a Shadow DOM so the site's CSS cannot reach them.
export const PANEL_CSS = `
:host { all: initial; }
.panel {
  --bg: #ffffff; --fg: #1b1b1f; --muted: #5b5b66; --line: #d9d9e0; --accent: #2457c5; --accent-fg: #ffffff;
  --warn-bg: #fff4d6; --error: #b42318; --focus: #2457c5;
  position: fixed; top: 16px; right: 16px; z-index: 2147483647;
  width: min(340px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto;
  box-sizing: border-box; padding: 14px 16px; border-radius: 12px;
  background: var(--bg); color: var(--fg); border: 1px solid var(--line);
  box-shadow: 0 8px 28px rgba(0,0,0,.18);
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Bengali", sans-serif;
}
@media (prefers-color-scheme: dark) {
  .panel { --bg: #1e1f24; --fg: #ececf1; --muted: #a5a5b3; --line: #3a3b44; --accent: #7aa2ff; --accent-fg: #0d1222;
    --warn-bg: #3a3020; --error: #ff8a80; --focus: #7aa2ff; }
}
* { box-sizing: border-box; }
header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
h2 { font-size: 16px; margin: 0; font-weight: 650; }
.meta { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 0 0 10px; color: var(--muted); }
.meta dd { margin: 0; color: var(--fg); overflow-wrap: anywhere; }
fieldset { border: 1px solid var(--line); border-radius: 8px; margin: 0 0 10px; padding: 6px 10px 8px; }
legend { padding: 0 4px; color: var(--muted); font-size: 12px; }
label { display: flex; gap: 8px; align-items: flex-start; padding: 3px 0; cursor: pointer; }
input { margin: 3px 0 0; accent-color: var(--accent); }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
button { font: inherit; border-radius: 8px; padding: 7px 12px; border: 1px solid var(--line);
  background: transparent; color: var(--fg); cursor: pointer; }
button.primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
button:disabled { opacity: .5; cursor: not-allowed; }
button.icon { border: none; font-size: 20px; line-height: 1; padding: 2px 8px; }
button.link { border: none; padding: 0; color: var(--accent); text-decoration: underline; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.note { margin: 0 0 10px; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--accent) 10%, transparent); }
.note.warn { background: var(--warn-bg); }
a { color: var(--accent); }
.status { min-height: 1.45em; margin: 10px 0 0; overflow-wrap: anywhere; }
.error { color: var(--error); }
.privacy { margin: 8px 0 0; font-size: 12px; color: var(--muted); }
`;
