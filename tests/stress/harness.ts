// Fuzz harness, bundled and run inside real browsers (Chromium, Firefox, WebKit) by
// tests/e2e/fuzz.spec.ts. Each run builds a random chat in the page, reads it with the ChatGPT
// reader, renders every format, and checks invariants. Failures carry their seed.

import { adapterForSite } from '../../src/adapters/registry';
import { buildConversation } from '../../src/export-flow';
import { exportFileName } from '../../src/exporters/filename';
import { renderExport, type FormatId } from '../../src/exporters/index';
import { DEFAULT_OPTIONS } from '../../src/exporters/options';
import { int, pick, rng, SITE_NAMES, SITE_URLS, siteChat, TRICKY } from './random';

export interface Failure {
  seed: number;
  check: string;
  detail: string;
}

const FORMATS: FormatId[] = ['md', 'txt', 'json', 'html', 'tex', 'docx'];
const DANGEROUS_TEX =
  /\\(write18|immediate|input|include|openin|openout|catcode|directlua|newread|newwrite|def|csname)(?![a-zA-Z])/;

function unzip(data: Uint8Array): Map<string, string> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out = new Map<string, string>();
  let p = 0;
  while (p + 30 <= data.length && view.getUint32(p, true) === 0x04034b50) {
    const size = view.getUint32(p + 18, true);
    const nameLen = view.getUint16(p + 26, true);
    const start = p + 30 + nameLen + view.getUint16(p + 28, true);
    out.set(
      new TextDecoder().decode(data.subarray(p + 30, p + 30 + nameLen)),
      new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(start, start + size)),
    );
    p = start + size;
  }
  return out;
}

const xmlError = (xml: string) => {
  const d = new DOMParser().parseFromString(xml, 'application/xml');
  const err = d.getElementsByTagName('parsererror')[0] ?? d.getElementsByTagNameNS('*', 'parsererror')[0];
  return err ? (err.textContent ?? 'parse error').slice(0, 200) : null;
};

export function runFuzz(
  firstSeed: number,
  runs: number,
  maxMessages = 12,
): { failures: Failure[]; ms: number; checked: number } {
  const failures: Failure[] = [];
  const t0 = performance.now();
  let checked = 0;
  document.documentElement.style.overflow = 'hidden';

  for (let seed = firstSeed; seed < firstSeed + runs; seed++) {
    const r = rng(seed);
    const site = SITE_NAMES[seed % SITE_NAMES.length]!;
    const count = int(r, 1, maxMessages);
    const chat = siteChat(r, site, count);
    let perSeed = 0;
    const fail = (check: string, detail: string) => {
      if (perSeed++ < 4) failures.push({ seed, check: `${site}: ${check}`, detail: detail.slice(0, 300) });
    };
    try {
      const parsed = new DOMParser().parseFromString(`<body>${chat.html}</body>`, 'text/html');
      document.body.replaceChildren(
        ...Array.from(parsed.body.childNodes, (n) => document.importNode(n, true)),
      );
      const url = new URL(`${SITE_URLS[site]}-${seed}`);
      const adapter = adapterForSite(site, { doc: document, url });
      const turns = adapter.turns();
      if (turns.length !== count) fail('message count', `found ${turns.length}, expected ${count}`);
      const messages = turns.map((t) => adapter.read(t));
      const roles = messages.map((m) => m.role).join(',');
      const expected = Array.from({ length: count }, (_, i) => (i % 2 ? 'assistant' : 'user')).join(',');
      if (roles !== expected) fail('roles', roles);
      const title = pick(r, TRICKY);
      document.title = title;
      const conv = { ...buildConversation(document, url, adapter, messages), title };

      const name = exportFileName(site, title, new Date(), 'md');
      // eslint-disable-next-line no-control-regex -- checking that control characters are gone
      const unsafeName = new RegExp('[\\\\/:*?"<>|\\u0000-\\u001f\\u202a-\\u202e\\u2066-\\u2069]');
      if (unsafeName.test(name)) fail('file name', JSON.stringify(name));

      for (const f of FORMATS) {
        let out: string | Uint8Array;
        try {
          out = renderExport(conv, f, DEFAULT_OPTIONS);
        } catch (e) {
          fail(`${f} threw`, String((e as Error).stack ?? e));
          continue;
        }
        let text: string;
        if (f === 'docx') {
          let files: Map<string, string>;
          try {
            files = unzip(out as Uint8Array);
          } catch (e) {
            fail('docx zip/utf-8', String(e));
            continue;
          }
          for (const [n, xml] of files) {
            const err = xmlError(xml);
            if (err) fail(`docx xml ${n}`, err);
          }
          text = files.get('word/document.xml') ?? '';
        } else text = out as string;

        if (f === 'json') {
          try {
            const back = JSON.parse(text);
            if (back.messages.length !== count) fail('json count', String(back.messages.length));
          } catch (e) {
            fail('json parse', String(e));
          }
        }
        if (f === 'html') {
          const d = new DOMParser().parseFromString(text, 'text/html');
          if (d.querySelector('script, iframe, object, embed'))
            fail('html active content', 'script/iframe present');
          for (const el of Array.from(d.querySelectorAll('*'))) {
            for (const a of Array.from(el.attributes)) {
              if (/^on/i.test(a.name)) fail('html event handler', `${el.localName} ${a.name}`);
              if (/^(href|src)$/.test(a.name) && /^\s*(javascript|vbscript|data:text)/i.test(a.value))
                fail('html bad url', a.value);
            }
          }
        }
        if (f === 'md' && /<script|javascript:|vbscript:/i.test(text))
          fail('md active content', 'script or javascript: link');
        if (f === 'tex' && DANGEROUS_TEX.test(text.replace(/\\backslash\\mathtt\{\w+\}/g, '')))
          fail('tex primitive', text.match(DANGEROUS_TEX)?.[0] ?? '');
        if (/JUNK\d/.test(text)) fail(`${f} leaked clutter`, text.match(/.{0,40}JUNK\d+.{0,40}/)?.[0] ?? '');
        if (/SECRET\d/.test(text)) fail(`${f} leaked image token`, text.match(/.{0,40}SECRET\d+/)?.[0] ?? '');

        // Every marker present, and messages in order.
        let last = -1;
        chat.markers.forEach((ms, i) => {
          for (const m of ms) if (!text.includes(m)) fail(`${f} lost text`, `message ${i} marker ${m}`);
          const at = text.indexOf(ms[0] as string);
          if (at >= 0 && at < last) fail(`${f} order`, `message ${i}`);
          if (at >= 0) last = at;
        });
        checked++;
      }
    } catch (e) {
      fail('crash', String((e as Error).stack ?? e));
    }
    if (failures.length > 200) break;
  }
  return { failures, ms: Math.round(performance.now() - t0), checked };
}

export interface ScaleResult {
  name: string;
  ms: number;
  ok: boolean;
  detail: string;
}

/** Large and deeply nested inputs, timed. Budgets are generous for slow CI machines. */
export function runScale(): ScaleResult[] {
  const results: ScaleResult[] = [];
  document.documentElement.style.overflow = 'hidden';
  const url = new URL('https://chatgpt.com/c/scale');
  const formats: FormatId[] = ['md', 'txt', 'json', 'html', 'tex', 'docx'];

  const run = (
    name: string,
    budgetMs: number,
    html: string,
    check: (texts: Map<FormatId, string>, count: number) => string | null,
  ) => {
    const t0 = performance.now();
    try {
      const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
      document.body.replaceChildren(
        ...Array.from(parsed.body.childNodes, (n) => document.importNode(n, true)),
      );
      const adapter = adapterForSite('chatgpt', { doc: document, url });
      const messages = adapter.turns().map((t) => adapter.read(t));
      const conv = buildConversation(document, url, adapter, messages);
      const texts = new Map<FormatId, string>();
      for (const f of formats) {
        const out = renderExport(conv, f, DEFAULT_OPTIONS);
        texts.set(f, typeof out === 'string' ? out : `docx:${out.length}`);
      }
      const ms = Math.round(performance.now() - t0);
      const problem =
        check(texts, messages.length) ?? (ms > budgetMs ? `over budget (${budgetMs} ms)` : null);
      results.push({ name, ms, ok: !problem, detail: problem ?? `${messages.length} messages` });
    } catch (e) {
      results.push({
        name,
        ms: Math.round(performance.now() - t0),
        ok: false,
        detail: String((e as Error).message ?? e).slice(0, 300),
      });
    }
  };
  const turn = (role: string, inner: string, i: number) =>
    `<div data-message-author-role="${role}" data-message-id="s${i}"><div class="${role === 'user' ? 'whitespace-pre-wrap' : 'markdown'}">${inner}</div></div>`;

  // 1. 5,000 messages.
  const many = Array.from({ length: 5000 }, (_, i) =>
    turn(
      i % 2 ? 'assistant' : 'user',
      i % 2
        ? `<p>Answer <strong>${i}</strong> <code>x${i}</code></p><ul><li>a</li><li>b</li></ul>`
        : `Question ${i}`,
      i,
    ),
  ).join('');
  run('5,000 messages', 30000, `<main>${many}</main>`, (t, n) =>
    n !== 5000
      ? `read ${n} messages`
      : !t.get('md')!.includes('Answer **4999**')
        ? 'last answer missing'
        : null,
  );

  // 2. One 1 MB message.
  const big = 'lorem ipsum dolor sit amet '.repeat(40000);
  run('1 MB message', 15000, `<main>${turn('assistant', `<p>${big}END1MB</p>`, 0)}</main>`, (t) =>
    t.get('txt')!.includes('END1MB') ? null : 'end of message lost',
  );

  // 3. 10,000-line code block.
  const code = Array.from({ length: 10000 }, (_, i) => `line_${i} = ${i} &lt;&gt; "x"`).join('\n');
  run(
    '10,000-line code block',
    15000,
    `<main>${turn('assistant', `<pre><code class="language-python">${code}</code></pre>`, 0)}</main>`,
    (t) => (t.get('md')!.includes('line_9999 = 9999 <> "x"') ? null : 'last code line lost'),
  );

  // 4. 500-row table.
  const rows = Array.from(
    { length: 500 },
    (_, i) => `<tr>${Array.from({ length: 8 }, (_, c) => `<td>r${i}c${c}</td>`).join('')}</tr>`,
  ).join('');
  run(
    '500-row table',
    15000,
    `<main>${turn('assistant', `<table><thead><tr>${'<th>h</th>'.repeat(8)}</tr></thead><tbody>${rows}</tbody></table>`, 0)}</main>`,
    (t) => (t.get('md')!.includes('| r499c0 |') ? null : 'last row lost'),
  );

  // 5. Deep nesting (no stack overflow, text kept).
  const deepDivs = `${'<div>'.repeat(300)}<p>DEEPDIV</p>${'</div>'.repeat(300)}`;
  run('300 nested containers', 10000, `<main>${turn('assistant', deepDivs, 0)}</main>`, (t) =>
    t.get('txt')!.includes('DEEPDIV') ? null : 'text lost',
  );
  const deepList = `${'<ul><li>level'.repeat(60)}DEEPLIST${'</li></ul>'.repeat(60)}`;
  run('60 nested lists', 10000, `<main>${turn('assistant', deepList, 0)}</main>`, (t) =>
    t.get('md')!.includes('DEEPLIST') ? null : 'text lost',
  );
  const deepQuote = `${'<blockquote>'.repeat(100)}<p>DEEPQUOTE</p>${'</blockquote>'.repeat(100)}`;
  run('100 nested quotes', 10000, `<main>${turn('assistant', deepQuote, 0)}</main>`, (t) =>
    t.get('html')!.includes('DEEPQUOTE') ? null : 'text lost',
  );
  const deepMath = `<span class="katex"><span class="katex-mathml"><math><semantics>${'<mrow><msup><mi>x</mi>'.repeat(200)}<mn>9</mn>${'</msup></mrow>'.repeat(200)}<annotation encoding="application/x-tex">x</annotation></semantics></math></span></span>`;
  run(
    'equation nested 200 deep',
    10000,
    `<main>${turn('assistant', `<p>${deepMath} DEEPMATH</p>`, 0)}</main>`,
    (t) => (t.get('txt')!.includes('DEEPMATH') ? null : 'text lost'),
  );

  return results;
}
