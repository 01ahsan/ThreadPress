// Recovers the original LaTeX from rendered maths (KaTeX, MathJax, raw MathML).
// Order: TeX annotation -> data attributes -> MathML (as linear text) -> plain text.

import type { MathNode } from './types';

const TEX_ATTRS = ['data-tex', 'data-latex', 'data-math', 'data-formula', 'data-original'];

/** Returns true for an element that is the root of a rendered formula. */
export function isMathRoot(el: Element): boolean {
  const cls = el.classList;
  if (cls.contains('katex-display') || cls.contains('katex')) return true;
  const tag = el.localName;
  if (tag === 'mjx-container' || tag === 'math') return true;
  if (cls.contains('MathJax') || cls.contains('MathJax_Display')) return true;
  // Gemini: <span class="math-inline" data-math="…"> / <div class="math-block" data-math="…">
  if ((cls.contains('math-inline') || cls.contains('math-block')) && el.hasAttribute('data-math'))
    return true;
  if (tag === 'script' && /^math\/tex/.test(el.getAttribute('type') ?? '')) return true;
  return (
    TEX_ATTRS.some((a) => el.hasAttribute(a)) && el.querySelector('.katex, math, mjx-container') !== null
  );
}

export function isDisplayMath(el: Element): boolean {
  const cls = el.classList;
  if (cls.contains('katex-display') || cls.contains('MathJax_Display') || cls.contains('math-block'))
    return true;
  if (el.closest('.katex-display')) return true;
  if (el.localName === 'mjx-container') return el.getAttribute('display') === 'true';
  if (el.localName === 'math') return el.getAttribute('display') === 'block';
  if (el.localName === 'script') return /mode=display/.test(el.getAttribute('type') ?? '');
  const math = el.querySelector('math');
  return math?.getAttribute('display') === 'block';
}

export function extractTex(el: Element): string {
  if (el.localName === 'script') return clean(el.textContent ?? '');

  const annotation = el.querySelector('annotation[encoding="application/x-tex"], annotation[encoding="TeX"]');
  if (annotation?.textContent) return clean(annotation.textContent);

  for (const holder of [el, ...Array.from(el.querySelectorAll(TEX_ATTRS.map((a) => `[${a}]`).join(',')))]) {
    for (const attr of TEX_ATTRS) {
      const v = holder.getAttribute(attr);
      if (v) return clean(v);
    }
  }

  const math = el.localName === 'math' ? el : el.querySelector('math');
  if (math) return clean(mathmlToText(math));

  return clean(el.textContent ?? '');
}

function clean(tex: string): string {
  return tex.replace(/\u00a0/g, ' ').trim();
}

/** Best-effort linear form of MathML when no TeX source survives. */
function mathmlToText(node: Element): string {
  const kids = Array.from(node.children);
  const t = (i: number) => (kids[i] ? mathmlToText(kids[i]) : '');
  switch (node.localName) {
    case 'semantics':
      return t(0);
    case 'annotation':
    case 'annotation-xml':
      return '';
    case 'mfrac':
      return `\\frac{${t(0)}}{${t(1)}}`;
    case 'msqrt':
      return `\\sqrt{${kids.map(mathmlToText).join('')}}`;
    case 'mroot':
      return `\\sqrt[${t(1)}]{${t(0)}}`;
    case 'msup':
      return `${t(0)}^{${t(1)}}`;
    case 'msub':
      return `${t(0)}_{${t(1)}}`;
    case 'msubsup':
      return `${t(0)}_{${t(1)}}^{${t(2)}}`;
    case 'munder':
      return `${t(0)}_{${t(1)}}`;
    case 'mover':
      return `${t(0)}^{${t(1)}}`;
    case 'munderover':
      return `${t(0)}_{${t(1)}}^{${t(2)}}`;
    case 'mtable':
      return `\\begin{matrix}${kids.map(mathmlToText).join(' \\\\ ')}\\end{matrix}`;
    case 'mtr':
      return kids.map(mathmlToText).join(' & ');
    case 'mi':
    case 'mn':
    case 'mo':
    case 'mtext':
      return node.textContent ?? '';
    default:
      return kids.length ? kids.map(mathmlToText).join('') : (node.textContent ?? '');
  }
}

const TOKEN_TAGS = new Set(['mi', 'mn', 'mo', 'mtext', 'ms', 'mspace']);
const MATH_TAGS = new Set([
  'math',
  'mrow',
  'mi',
  'mn',
  'mo',
  'mtext',
  'ms',
  'mspace',
  'mfrac',
  'msqrt',
  'mroot',
  'msup',
  'msub',
  'msubsup',
  'munder',
  'mover',
  'munderover',
  'mtable',
  'mtr',
  'mtd',
  'mstyle',
  'mpadded',
  'mphantom',
  'menclose',
  'mfenced',
  'mmultiscripts',
  'mprescripts',
  'none',
  'semantics',
  'merror',
  'mlabeledtr',
]);
const MATH_ATTRS = new Set([
  'display',
  'mathvariant',
  'stretchy',
  'fence',
  'separator',
  'lspace',
  'rspace',
  'accent',
  'accentunder',
  'columnalign',
  'rowalign',
  'rowspacing',
  'columnspacing',
  'displaystyle',
  'scriptlevel',
  'linethickness',
  'mathsize',
  'width',
  'height',
  'depth',
  'notation',
  'open',
  'close',
  'separators',
  'minsize',
  'maxsize',
  'movablelimits',
  'largeop',
  'symmetric',
  'form',
  'columnlines',
  'rowlines',
  'frame',
  'align',
]);

/**
 * Copies the page's MathML (KaTeX and MathJax both emit it) through an allowlist of
 * MathML elements and attributes. Used for native equations in PDF, HTML and Word.
 */
export function extractMathML(el: Element): MathNode | undefined {
  const math = el.localName === 'math' ? el : el.querySelector('math');
  if (!math) return undefined;
  const node = copy(math);
  if (node && isDisplayMath(el)) node.attrs = { ...node.attrs, display: 'block' };
  return node;
}

function copy(el: Element): MathNode | undefined {
  const tag = el.localName;
  if (tag === 'semantics') {
    const first = el.firstElementChild;
    return first ? copy(first) : undefined;
  }
  if (!MATH_TAGS.has(tag)) return undefined;
  const node: MathNode = { tag };
  for (const { name, value } of Array.from(el.attributes)) {
    if (MATH_ATTRS.has(name)) (node.attrs ??= {})[name] = value;
  }
  if (TOKEN_TAGS.has(tag)) {
    node.text = (el.textContent ?? '').replace(/\u00a0/g, ' ');
    return node;
  }
  const children = Array.from(el.children)
    .map(copy)
    .filter((c): c is MathNode => c !== undefined);
  if (children.length) node.children = children;
  return node;
}
