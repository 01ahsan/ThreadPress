import { siteForUrl, ISSUES_URL, type SiteId } from '../config/sites';
import { VERSION } from '../version';
import { SPECS } from './sites';
import { createSpecAdapter } from './spec';
import type { Adapter, AdapterContext } from './types';

export function adapterFor(ctx: AdapterContext): Adapter | null {
  const site = siteForUrl(ctx.url);
  return site ? createSpecAdapter(SPECS[site.id], ctx) : null;
}

export function adapterForSite(id: SiteId, ctx: AdapterContext): Adapter {
  return createSpecAdapter(SPECS[id], ctx);
}

/**
 * Opens the "A site doesn't export correctly" issue form, prefilled with only the site, a page
 * shape with conversation IDs removed, and the ThreadPress version. Nothing is sent automatically.
 */
export function brokenSiteIssueUrl(url: URL, siteLabel: string): string {
  const pathShape = url.pathname.replace(/[0-9a-f-]{8,}|[A-Za-z0-9_-]{16,}/g, ':id');
  const q = new URLSearchParams({
    template: 'site-broken.yml',
    title: `Layout changed: ${siteLabel}`,
    // Field ids from .github/ISSUE_TEMPLATE/site-broken.yml.
    what: `ThreadPress could not find the messages on ${url.hostname} (page shape ${pathShape}).`,
    version: VERSION,
  });
  return `${ISSUES_URL}?${q.toString()}`;
}
