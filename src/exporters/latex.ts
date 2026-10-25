// A compilable LaTeX article. Maths is written back exactly as the site's LaTeX source.
// Non-Latin scripts switch the preamble to LuaLaTeX with matching Noto fonts.

import { inlineText } from '../ir/inline';
import type { Block, Conversation, Inline } from '../ir/types';
import { messageLabel, siteLabel, type ExportOptions } from './options';

const LISTINGS_LANGS = new Set([
  'python',
  'java',
  'c',
  'c++',
  'cpp',
  'html',
  'xml',
  'sql',
  'bash',
  'sh',
  'ruby',
  'php',
  'perl',
  'r',
  'matlab',
  'haskell',
  'go',
  'csharp',
  'fortran',
  'lisp',
  'pascal',
  'tex',
  'latex',
]);

const SCRIPTS: [RegExp, string, string][] = [
  [/[ঀ-৿]/, 'bengali', 'Noto Serif Bengali'],
  [/[ऀ-ॿ]/, 'hindi', 'Noto Serif Devanagari'],
  [/[؀-ۿ]/, 'arabic', 'Noto Naskh Arabic'],
  [/[一-鿿]/, 'chinese', 'Noto Serif CJK SC'],
  [/[぀-ヿ]/, 'japanese', 'Noto Serif CJK JP'],
  [/[가-힯]/, 'korean', 'Noto Serif CJK KR'],
  [/[Ѐ-ӿ]/, 'russian', 'Noto Serif'],
];

export function toLatex(conv: Conversation, opts: ExportOptions): string {
  const body: string[] = [];
  for (const m of conv.messages) {
    body.push(`\\section*{${esc(messageLabel(m, opts, conv.site))}}`, '', ...blocks(m.blocks, opts), '');
  }
  const all = body.join('\n') + conv.title;
  const scripts = SCRIPTS.filter(([re]) => re.test(all));
  const date = new Date(conv.exportedAt).toISOString().slice(0, 10);

  const preamble = [
    `% ${conv.title.replace(/\n/g, ' ')}`,
    `% Exported from ${siteLabel(conv.site)} by ThreadPress on ${date}.`,
    scripts.length
      ? '% Compile with LuaLaTeX (needs the Noto fonts listed below).'
      : '% Compile with pdfLaTeX, XeLaTeX or LuaLaTeX.',
    `\\documentclass[11pt,${opts.paper === 'Letter' ? 'letterpaper' : 'a4paper'}]{article}`,
    '\\usepackage{iftex}',
    '\\ifPDFTeX',
    '  \\usepackage[utf8]{inputenc}',
    '  \\usepackage[T1]{fontenc}',
    '\\else',
    '  \\usepackage{fontspec}',
    '\\fi',
    ...(scripts.length
      ? [
          '\\usepackage[english, provide*=*]{babel}',
          ...scripts.flatMap(([, lang, font]) => [
            `\\babelprovide[import, onchar=ids fonts]{${lang}}`,
            `\\babelfont[${lang}]{rm}{${font}}`,
          ]),
        ]
      : []),
    '\\usepackage[margin=2.2cm]{geometry}',
    '\\usepackage{amsmath, amssymb}',
    '\\usepackage[normalem]{ulem}',
    '\\usepackage{xcolor}',
    '\\usepackage{listings}',
    '\\usepackage{array}',
    '\\usepackage{graphicx}',
    '\\usepackage{enumitem}',
    '\\usepackage{hyperref}',
    '\\lstset{basicstyle=\\ttfamily\\small, breaklines=true, columns=fullflexible, keepspaces=true,',
    '  frame=single, rulecolor=\\color{black!15}, backgroundcolor=\\color{black!3}, upquote=true}',
    '\\setlength{\\parindent}{0pt}',
    '\\setlength{\\parskip}{0.6em}',
    `\\title{${esc(conv.title)}}`,
    `\\date{${esc(siteLabel(conv.site))} \\textperiodcentered{} ${date}}`,
    '\\begin{document}',
    '\\maketitle',
    '',
  ];
  return [...preamble, ...body, '\\end{document}', ''].join('\n');
}

function blocks(list: Block[], opts: ExportOptions): string[] {
  return list.flatMap((b) => [...block(b, opts), '']);
}

function block(b: Block, opts: ExportOptions): string[] {
  switch (b.type) {
    case 'paragraph':
      return [inlines(b.inlines)];
    case 'heading': {
      const cmd = ['subsection', 'subsection', 'subsubsection', 'paragraph', 'paragraph', 'paragraph'][
        b.level - 1
      ];
      return [`\\${cmd}*{${inlines(b.inlines).replace(/\\\\\n/g, ' ')}}`];
    }
    case 'list': {
      const env = b.ordered ? 'enumerate' : 'itemize';
      const start = b.ordered && b.start && b.start !== 1 ? `[start=${b.start}]` : '';
      return [
        `\\begin{${env}}${start}`,
        ...b.items.flatMap((item) => {
          const box = item.checked === undefined ? '' : item.checked ? '[$\\boxtimes$] ' : '[$\\square$] ';
          const inner = blocks(item.blocks, opts).filter((l, i, a) => !(l === '' && i === a.length - 1));
          return [`  \\item ${box}${inner.join('\n    ')}`];
        }),
        `\\end{${env}}`,
      ];
    }
    case 'code': {
      const lang =
        b.language && LISTINGS_LANGS.has(b.language) ? `[language=${listingsLang(b.language)}]` : '';
      // A listing cannot contain its own end marker; break it if it appears.
      return [
        `\\begin{lstlisting}${lang}`,
        b.text.replace(/\\end\{lstlisting\}/g, '\\end {lstlisting}'),
        '\\end{lstlisting}',
      ];
    }
    case 'math':
      return displayMath(b.tex);
    case 'table': {
      const cols = b.align.map((a) => (a === 'center' ? 'c' : a === 'right' ? 'r' : 'l')).join('|');
      const row = (cells: Inline[][]) =>
        cells.map((c) => inlines(c).replace(/\\\\\n/g, ' ')).join(' & ') + ' \\\\';
      return [
        '\\begin{center}\\resizebox{\\ifdim\\width>\\linewidth\\linewidth\\else\\width\\fi}{!}{%',
        `\\begin{tabular}{|${cols}|}`,
        '\\hline',
        row(b.header.map((c) => [{ type: 'bold', children: c } as Inline])),
        '\\hline',
        ...b.rows.map(row),
        '\\hline',
        '\\end{tabular}}',
        '\\end{center}',
      ];
    }
    case 'image': {
      const label = `Image${b.alt ? `: ${esc(b.alt)}` : ''}`;
      return opts.images === 'link' && b.src
        ? [`\\fbox{\\href{${url(b.src)}}{${label}}}`]
        : [`\\fbox{${label}}`];
    }
    case 'blockquote':
      return ['\\begin{quote}', ...blocks(b.blocks, opts), '\\end{quote}'];
    case 'hr':
      return ['\\noindent\\rule{\\linewidth}{0.4pt}'];
    case 'footnote':
      return [`[${esc(b.label)}] ${inlines(b.inlines)}`];
    case 'reasoning':
      return [
        '\\begin{quote}',
        `\\textbf{${esc(b.summary ?? 'Reasoning')}}`,
        '',
        ...blocks(b.blocks, opts),
        '\\end{quote}',
      ];
    case 'attachment':
      return [`\\emph{Attachment: ${esc(b.name)}}`];
  }
}

// Primitives that read or write files, run programs or rewrite TeX itself. Maths copied from
// a web page must never be able to do that when the user compiles the file, so these are
// printed as text instead of executed.
const DANGEROUS =
  /\\(write18|immediate|write|input|include|InputIfFileExists|openin|openout|read|readline|catcode|directlua|latelua|luaexec|luadirect|newread|newwrite|special|usepackage|RequirePackage|documentclass|def|gdef|edef|xdef|csname|scantokens|endinput|shipout|everyeof|everyjob|everymath|everydisplay|pdfprimitive|primitive)(?![a-zA-Z])/g;

export function safeTex(tex: string): string {
  return tex.replace(DANGEROUS, '\\backslash\\mathtt{$1}');
}

/** Display maths: environments that are already display-level stand alone; everything else goes in \[ \]. */
function displayMath(raw: string): string[] {
  const tex = safeTex(raw);
  const t = tex.trim();
  if (/^\\begin\{(equation|align|gather|multline|flalign|eqnarray)\*?\}/.test(t)) return [t];
  return ['\\[', t, '\\]'];
}

function inlines(list: Inline[]): string {
  return list
    .map((n) => {
      switch (n.type) {
        case 'text':
          return esc(n.text);
        case 'bold':
          return `\\textbf{${inlines(n.children)}}`;
        case 'italic':
          return `\\emph{${inlines(n.children)}}`;
        case 'strike':
          return `\\sout{${inlines(n.children)}}`;
        case 'code':
          return `\\texttt{${esc(n.text)}}`;
        case 'link': {
          const label =
            inlineText(n.children) === n.href
              ? `\\url{${url(n.href)}}`
              : `\\href{${url(n.href)}}{${inlines(n.children)}}`;
          return label;
        }
        case 'math':
          return `$${safeTex(n.tex).replace(/\s*\n\s*/g, ' ')}$`;
        case 'break':
          return '\\\\\n';
      }
    })
    .join('');
}

const ESC: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  '^': '\\textasciicircum{}',
  _: '\\_',
  '%': '\\%',
  '~': '\\textasciitilde{}',
  '<': '\\textless{}',
  '>': '\\textgreater{}',
  '|': '\\textbar{}',
};

function esc(s: string): string {
  return s.replace(/[\\{}$&#^_%~<>|]/g, (c) => ESC[c] as string);
}

function url(u: string): string {
  return u.replace(/[\\{}%#]/g, (c) => `\\${c}`);
}

function listingsLang(l: string): string {
  return (
    ({ cpp: 'C++', 'c++': 'C++', csharp: '[Sharp]C', sh: 'bash', latex: 'TeX' } as Record<string, string>)[
      l
    ] ?? l
  );
}
