// Single source of truth for every supported chat site.
// Verified 2026-10-24. When a site moves, change it here and nowhere else.

export type SiteId = 'chatgpt' | 'claude' | 'gemini' | 'grok' | 'deepseek' | 'kimi';

export interface SiteConfig {
  id: SiteId;
  /** Human-readable name, used only in export metadata (never in the product name). */
  label: string;
  /** Exact hostnames the site is served from. */
  hosts: string[];
  /** Optional path prefix when the chat lives under a larger site (Grok on x.com). */
  pathPrefix?: Partial<Record<string, string>>;
  /** Hosts serving images in chats; used only when the user opts into embedding images. */
  imageHosts: string[];
}

export const SITES: readonly SiteConfig[] = [
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    hosts: ['chatgpt.com', 'chat.openai.com'],
    imageHosts: [
      'files.oaiusercontent.com',
      'files09.oaiusercontent.com',
      'sdmntprwestus.oaiusercontent.com',
    ],
  },
  {
    id: 'claude',
    label: 'Claude',
    hosts: ['claude.ai'],
    imageHosts: ['claude.ai'],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    hosts: ['gemini.google.com'],
    imageHosts: ['lh3.googleusercontent.com'],
  },
  {
    id: 'grok',
    label: 'Grok',
    hosts: ['grok.com', 'x.com'],
    pathPrefix: { 'x.com': '/i/grok' },
    imageHosts: ['assets.grok.com', 'pbs.twimg.com'],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    hosts: ['chat.deepseek.com'],
    imageHosts: ['chat.deepseek.com'],
  },
  {
    id: 'kimi',
    label: 'Kimi',
    hosts: ['www.kimi.com', 'kimi.com', 'kimi.moonshot.cn'],
    imageHosts: ['www.kimi.com', 'kimi.moonshot.cn'],
  },
];

/** Where users report a broken site. Opened only when the user clicks the link.
 *  TODO(release): replace OWNER with the GitHub account that hosts the repository. */
export const ISSUES_URL = 'https://github.com/OWNER/threadpress/issues/new';

export function siteForUrl(url: URL): SiteConfig | undefined {
  return SITES.find((site) => {
    if (!site.hosts.includes(url.hostname)) return false;
    const prefix = site.pathPrefix?.[url.hostname];
    return !prefix || url.pathname.startsWith(prefix);
  });
}

export function siteById(id: SiteId): SiteConfig {
  const site = SITES.find((s) => s.id === id);
  if (!site) throw new Error(`Unknown site: ${id}`);
  return site;
}
