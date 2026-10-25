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
 * Prefilled GitHub issue for a broken site. Contains only the site, a path shape with
 * conversation IDs removed, and the ThreadPress version. Nothing is sent automatically.
 */
export function brokenSiteIssueUrl(url: URL, siteLabel: string): string {
  const pathShape = url.pathname.replace(/[0-9a-f-]{8,}|[A-Za-z0-9_-]{16,}/g, ':id');
  const body = [
    `**Site:** ${siteLabel} (${url.hostname})`,
    `**Page shape:** \`${pathShape}\``,
    `**ThreadPress version:** ${VERSION}`,
    `**Browser:** (please fill in, e.g. Chrome 141)`,
    '',
    'What happened: ThreadPress could not find the messages on this page.',
    '',
    'Please do not paste your conversation or any personal information here.',
  ].join('\n');
  const q = new URLSearchParams({ title: `Layout changed: ${siteLabel}`, body, labels: 'site-broken' });
  return `${ISSUES_URL}?${q.toString()}`;
}
