// Extension content script: runs only on the supported chat sites (see src/config/sites.ts).
// Shows a small floating button on conversation pages; the toolbar icon and the keyboard
// shortcut open the same panel.
import { detect } from '../export-flow';
import { mountLauncher } from '../ui/launcher';
import { mountPanel, type Mounted } from '../ui/mount';

let panel: Mounted | null = null;
const toggle = () => {
  if (panel) panel.toggle();
  else panel = mountPanel(document, new URL(location.href));
};

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (message === 'threadpress:toggle') toggle();
});

// Chat sites are single-page apps: re-check whether a conversation is open as the user navigates.
const launcher = mountLauncher(document, toggle);
let lastUrl = '';
let lastVisible = false;
const refresh = () => {
  const url = new URL(location.href);
  const adapter = detect(document, url);
  const visible = !!adapter && adapter.count() > 0;
  if (visible !== lastVisible || url.href !== lastUrl) launcher.setVisible(visible);
  lastVisible = visible;
  lastUrl = url.href;
};
refresh();
setInterval(refresh, 1500);
