import { render } from 'preact';
import { detect } from '../export-flow';
import { Panel } from './panel';
import { PANEL_CSS } from './styles';

export interface Mounted {
  toggle(): void;
  /** Opens the panel if it is closed. */
  show(): void;
}

/** Mounts the panel in a Shadow DOM attached to <html>, outside the site's app root. */
export function mountPanel(doc: Document, url: URL): Mounted {
  const host = doc.createElement('threadpress-panel');
  const shadow = host.attachShadow({ mode: 'open' });
  // Constructed stylesheets are not subject to the page's style-src policy; <style> is the fallback.
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(PANEL_CSS);
    shadow.adoptedStyleSheets = [sheet];
  } catch {
    const style = doc.createElement('style');
    style.textContent = PANEL_CSS;
    shadow.append(style);
  }
  const root = doc.createElement('div');
  shadow.append(root);
  doc.documentElement.appendChild(host);

  let open = false;
  const show = () => {
    open = true;
    // Chat sites are single-page apps: re-read the URL each time the panel opens.
    const current = new URL(doc.location?.href ?? url.href);
    render(<Panel doc={doc} url={current} adapter={detect(doc, current)} host={host} onClose={hide} />, root);
  };
  function hide() {
    open = false;
    render(null, root);
  }
  show();
  return { toggle: () => (open ? hide() : show()), show: () => !open && show() };
}
