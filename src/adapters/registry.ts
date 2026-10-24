import { siteForUrl, ISSUES_URL, type SiteId } from '../config/sites';
import { VERSION } from '../version';
import { createChatGPTAdapter } from './chatgpt';
import type { Adapter, AdapterContext } from './types';

const FACTORIES: Partial<Record<SiteId, (ctx: AdapterContext) => Adapter>> = {
  chatgpt: createChatGPTAdapter,
};

export function adapterFor(ctx: AdapterContext): Adapter | null {
  const site = siteForUrl(ctx.url);
  const factory = site && FACTORIES[site.id];
  return factory ? factory(ctx) : null;
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
