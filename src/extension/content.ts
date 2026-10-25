// Extension content script: runs only on the supported chat sites (see src/config/sites.ts)
// and does nothing until the user clicks the toolbar button or presses the shortcut.
import { mountPanel, type Mounted } from '../ui/mount';

let panel: Mounted | null = null;

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (message !== 'threadpress:toggle') return;
  if (panel) panel.toggle();
  else panel = mountPanel(document, new URL(location.href));
});
