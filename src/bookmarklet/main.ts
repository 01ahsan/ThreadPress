// Bookmarklet entry. Clicking the bookmark again toggles the panel.
import { mountPanel, type Mounted } from '../ui/mount';

declare global {
  interface Window {
    __threadpress?: Mounted;
  }
}

if (window.__threadpress) window.__threadpress.toggle();
else window.__threadpress = mountPanel(document, new URL(location.href));
