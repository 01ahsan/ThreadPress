// MathML -> Office Math (OMML), so equations in Word are native and editable.
// Covers what chat sites produce: fractions, roots, scripts, big operators, accents,
// matrices, fenced groups and aligned environments.

import type { MathNode } from '../../ir/types';

const NARY = new Set(['∑', '∏', '∐', '∫', '∬', '∭', '∮', '∯', '∰', '⋃', '⋂', '⋁', '⋀', '⨁', '⨂', '⨀']);
const FENCES = new Set(['(', ')', '[', ']', '{', '}', '|', '‖', '⟨', '⟩', '⌊', '⌋', '⌈', '⌉', '']);

/** Escapes XML special characters and drops characters XML cannot hold at all. */
/** XML 1.0 forbids most control characters. */
function stripInvalid(s: string): string {
  // Compared by code point so the bundle never contains these characters literally.
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    if (
      c === 9 ||
      c === 10 ||
      c === 13 ||
      (c >= 0x20 && c <= 0xd7ff) ||
      (c >= 0xe000 && c <= 0xfffd) ||
      c >= 0x10000
    )
      out += ch;
  }
  return out;
}

export function xmlEscape(s: string): string {
  return stripInvalid(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );
}

/** Returns <m:oMath> (inline) or <m:oMathPara> (display) XML. */
export function toOmml(node: MathNode, display: boolean): string {
  const body = finish(sequence(kids(node)));
  return display ? `<m:oMathPara><m:oMath>${body}</m:oMath></m:oMathPara>` : `<m:oMath>${body}</m:oMath>`;
}

function finish(xml: string): string {
  return xml.split(OPERAND).join('<m:e/>');
}

function kids(n: MathNode): MathNode[] {
  return n.children ?? [];
}

const e = (inner: string) => `<m:e>${inner}</m:e>`;
const all = (n: MathNode | undefined) => (n ? conv(n) : '');

function run(text: string, style?: 'p' | 'b' | 'i' | 'bi'): string {
  if (!text) return '';
  const rpr = style ? `<m:rPr><m:sty m:val="${style}"/></m:rPr>` : '';
  return `<m:r>${rpr}<m:t xml:space="preserve">${xmlEscape(text)}</m:t></m:r>`;
}

function opChar(n: MathNode | undefined): string | undefined {
  if (!n) return undefined;
  if (n.tag === 'mo' && n.text && NARY.has(n.text.trim())) return n.text.trim();
  if ((n.tag === 'mrow' || n.tag === 'mstyle') && kids(n).length === 1) return opChar(kids(n)[0]);
  return undefined;
}

function conv(n: MathNode): string {
  const c = kids(n);
  switch (n.tag) {
    case 'mi': {
      const v = n.attrs?.mathvariant;
      const multi = (n.text ?? '').length > 1;
      return run(
        n.text ?? '',
        v === 'normal' || multi ? 'p' : v === 'bold' ? 'b' : v === 'bold-italic' ? 'bi' : undefined,
      );
    }
    case 'mn':
    case 'mtext':
    case 'ms':
      return run(n.text ?? '', 'p');
    case 'mo': {
      const t = (n.text ?? '').trim();
      return NARY.has(t) ? nary(t, '', '', 'undOvr', true, true) : run(n.text ?? '', 'p');
    }
    case 'mspace':
      return run(' ', 'p');
    case 'mfrac': {
      const noBar = n.attrs?.linethickness === '0' || n.attrs?.linethickness === '0px';
      const pr = noBar ? '<m:fPr><m:type m:val="noBar"/></m:fPr>' : '';
      return `<m:f>${pr}<m:num>${all(c[0])}</m:num><m:den>${all(c[1])}</m:den></m:f>`;
    }
    case 'msqrt':
      return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>${e(c.map(conv).join(''))}</m:rad>`;
    case 'mroot':
      return `<m:rad><m:deg>${all(c[1])}</m:deg>${e(all(c[0]))}</m:rad>`;
    case 'msup': {
      const op = opChar(c[0]);
      if (op) return nary(op, '', all(c[1]), 'subSup', true, false);
      return `<m:sSup>${e(all(c[0]))}<m:sup>${all(c[1])}</m:sup></m:sSup>`;
    }
    case 'msub': {
      const op = opChar(c[0]);
      if (op) return nary(op, all(c[1]), '', 'subSup', false, true);
      return `<m:sSub>${e(all(c[0]))}<m:sub>${all(c[1])}</m:sub></m:sSub>`;
    }
    case 'msubsup': {
      const op = opChar(c[0]);
      if (op) return nary(op, all(c[1]), all(c[2]), 'subSup', false, false);
      return `<m:sSubSup>${e(all(c[0]))}<m:sub>${all(c[1])}</m:sub><m:sup>${all(c[2])}</m:sup></m:sSubSup>`;
    }
    case 'munder': {
      const op = opChar(c[0]);
      if (op) return nary(op, all(c[1]), '', 'undOvr', false, true);
      if (n.attrs?.accentunder === 'true')
        return `<m:groupChr><m:groupChrPr><m:pos m:val="bot"/></m:groupChrPr>${e(all(c[0]))}</m:groupChr>`;
      return `<m:limLow>${e(all(c[0]))}<m:lim>${all(c[1])}</m:lim></m:limLow>`;
    }
    case 'mover': {
      const op = opChar(c[0]);
      if (op) return nary(op, '', all(c[1]), 'undOvr', true, false);
      if (n.attrs?.accent === 'true' && c[1]?.tag === 'mo' && c[1].text) {
        return `<m:acc><m:accPr><m:chr m:val="${xmlEscape(c[1].text)}"/></m:accPr>${e(all(c[0]))}</m:acc>`;
      }
      return `<m:limUpp>${e(all(c[0]))}<m:lim>${all(c[1])}</m:lim></m:limUpp>`;
    }
    case 'munderover': {
      const op = opChar(c[0]);
      if (op) return nary(op, all(c[1]), all(c[2]), 'undOvr', false, false);
      return `<m:limUpp>${e(`<m:limLow>${e(all(c[0]))}<m:lim>${all(c[1])}</m:lim></m:limLow>`)}<m:lim>${all(c[2])}</m:lim></m:limUpp>`;
    }
    case 'mtable': {
      const rows = c.filter((r) => r.tag === 'mtr' || r.tag === 'mlabeledtr');
      const cols = Math.max(1, ...rows.map((r) => kids(r).length));
      const mcs = `<m:mPr><m:mcs><m:mc><m:mcPr><m:count m:val="${cols}"/><m:mcJc m:val="center"/></m:mcPr></m:mc></m:mcs></m:mPr>`;
      const body = rows
        .map((r) => {
          const cells = kids(r);
          const padded = cells.concat(Array.from({ length: cols - cells.length }, () => ({ tag: 'mtd' })));
          return `<m:mr>${padded.map((cell) => e(kids(cell).map(conv).join(''))).join('')}</m:mr>`;
        })
        .join('');
      return `<m:m>${mcs}${body}</m:m>`;
    }
    case 'mfenced': {
      const open = n.attrs?.open ?? '(';
      const close = n.attrs?.close ?? ')';
      return delim(open, close, c.map(conv).join(''));
    }
    case 'mrow':
    case 'math': {
      // A group with fence operators at both ends becomes a stretchy delimiter.
      const first = c[0];
      const last = c[c.length - 1];
      if (
        c.length >= 2 &&
        first?.tag === 'mo' &&
        last?.tag === 'mo' &&
        (first.attrs?.fence === 'true' || first.attrs?.stretchy === 'true') &&
        FENCES.has((first.text ?? '').trim()) &&
        FENCES.has((last.text ?? '').trim())
      ) {
        return delim((first.text ?? '').trim(), (last.text ?? '').trim(), sequence(c.slice(1, -1)));
      }
      return sequence(c);
    }
    case 'mphantom':
      return '';
    default:
      return sequence(c);
  }
}

function delim(open: string, close: string, inner: string): string {
  return `<m:d><m:dPr><m:begChr m:val="${xmlEscape(open)}"/><m:endChr m:val="${xmlEscape(close)}"/></m:dPr>${e(inner)}</m:d>`;
}

function nary(
  chr: string,
  sub: string,
  sup: string,
  loc: 'undOvr' | 'subSup',
  subHide: boolean,
  supHide: boolean,
): string {
  const pr =
    `<m:naryPr><m:chr m:val="${xmlEscape(chr)}"/><m:limLoc m:val="${loc}"/>` +
    `${subHide || !sub ? '<m:subHide m:val="1"/>' : ''}${supHide || !sup ? '<m:supHide m:val="1"/>' : ''}</m:naryPr>`;
  return `<m:nary>${pr}<m:sub>${sub}</m:sub><m:sup>${sup}</m:sup>${OPERAND}</m:nary>`;
}

/** Placeholder replaced by the operand that follows a big operator (∑ x_i -> operand x_i). */
const OPERAND = '\u0000OPERAND\u0000';

/** Converts a run of siblings, moving the element after each big operator into its body. */
function sequence(list: MathNode[]): string {
  let out = '';
  for (let i = 0; i < list.length; i++) {
    const x = conv(list[i] as MathNode);
    if (x.includes(OPERAND)) {
      const next = list[i + 1];
      out += x.replace(OPERAND, e(next ? conv(next) : ''));
      if (next) i++;
    } else out += x;
  }
  return out;
}
