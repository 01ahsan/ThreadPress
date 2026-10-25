// Word (.docx) from the IR: heading styles, real tables and lists, shaded code blocks,
// native editable equations (OMML), hyperlinks. No author or personal metadata is written.

import type { Block, Conversation, Inline } from '../../ir/types';
import { messageLabel, siteLabel, type ExportOptions } from '../options';
import { toOmml, xmlEscape } from './omml';
import { zipStore } from './zip';

interface RunStyle {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: boolean;
}

class Writer {
  body: string[] = [];
  rels: string[] = [];
  /** w:num entries: [numId, abstractNumId, start] */
  nums: [number, number, number][] = [[1, 1, 1]];
  private relId = 10;

  constructor(private readonly opts: ExportOptions) {}

  link(href: string): string {
    const id = `rId${this.relId++}`;
    this.rels.push(
      `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEscape(href)}" TargetMode="External"/>`,
    );
    return id;
  }

  newOrderedList(start: number): number {
    const id = this.nums.length + 1;
    this.nums.push([id, 2, start]);
    return id;
  }

  runs(list: Inline[], style: RunStyle = {}): string {
    return list.map((n) => this.inline(n, style)).join('');
  }

  inline(n: Inline, s: RunStyle): string {
    switch (n.type) {
      case 'text':
        return run(n.text, s);
      case 'bold':
        return this.runs(n.children, { ...s, bold: true });
      case 'italic':
        return this.runs(n.children, { ...s, italic: true });
      case 'strike':
        return this.runs(n.children, { ...s, strike: true });
      case 'code':
        return run(n.text, { ...s, code: true });
      case 'link':
        return `<w:hyperlink r:id="${this.link(n.href)}">${this.runs(n.children, { ...s, link: true })}</w:hyperlink>`;
      case 'math':
        return n.mathml ? toOmml(n.mathml, false) : run(n.tex, { ...s, code: true });
      case 'break':
        return '<w:r><w:br/></w:r>';
    }
  }

  para(content: string, pPr = ''): void {
    this.body.push(`<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${content}</w:p>`);
  }

  blocks(list: Block[], ctx: { quote?: boolean; listLevel?: number } = {}): void {
    for (const b of list) this.block(b, ctx);
  }

  block(b: Block, ctx: { quote?: boolean; listLevel?: number }): void {
    const quote = ctx.quote ? '<w:pStyle w:val="Quote"/>' : '';
    switch (b.type) {
      case 'paragraph':
        return this.para(this.runs(b.inlines), quote);
      case 'heading':
        return this.para(this.runs(b.inlines), `<w:pStyle w:val="Heading${Math.min(6, b.level + 1)}"/>`);
      case 'list':
        return this.list(b, ctx);
      case 'code': {
        const lines = b.text
          .split('\n')
          .map((line, i) => (i ? '<w:r><w:br/></w:r>' : '') + run(line, { code: true }));
        if (b.language) this.para(run(b.language, {}), '<w:pStyle w:val="CodeLabel"/>');
        return this.para(lines.join(''), '<w:pStyle w:val="Code"/>');
      }
      case 'math':
        return this.para(
          b.mathml ? toOmml(b.mathml, true) : run(b.tex, { code: true }),
          b.mathml ? '' : '<w:pStyle w:val="Code"/>',
        );
      case 'table':
        return this.table(b);
      case 'image': {
        const label = `Image${b.alt ? `: ${b.alt}` : ''}`;
        if (b.src && this.opts.images === 'link') {
          return this.para(
            `<w:hyperlink r:id="${this.link(b.src)}">${run(label, { link: true })}</w:hyperlink>`,
            quote,
          );
        }
        return this.para(run(label, { italic: true }), quote);
      }
      case 'blockquote':
        return this.blocks(b.blocks, { ...ctx, quote: true });
      case 'hr':
        return this.para(
          '',
          '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D9DCE5"/></w:pBdr>',
        );
      case 'footnote':
        return this.para(run(`[${b.label}] `, {}) + this.runs(b.inlines), quote);
      case 'reasoning':
        this.para(run(b.summary ?? 'Reasoning', { bold: true }), '<w:pStyle w:val="Quote"/>');
        return this.blocks(b.blocks, { ...ctx, quote: true });
      case 'attachment':
        return this.para(run(`Attachment: ${b.name}`, { italic: true }), quote);
    }
  }

  list(b: Extract<Block, { type: 'list' }>, ctx: { quote?: boolean; listLevel?: number }): void {
    const level = Math.min(8, ctx.listLevel ?? 0);
    const numId = b.ordered ? this.newOrderedList(b.start ?? 1) : 1;
    for (const item of b.items) {
      const [first, ...rest] = item.blocks;
      const box = item.checked === undefined ? '' : run(item.checked ? '☑ ' : '☐ ', {});
      const numPr = `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr>`;
      if (first?.type === 'paragraph') this.para(box + this.runs(first.inlines), numPr);
      else {
        this.para(box, numPr);
        if (first) this.block(first, { ...ctx, listLevel: level + 1 });
      }
      for (const r of rest) {
        if (r.type === 'list') this.list(r, { ...ctx, listLevel: level + 1 });
        else if (r.type === 'paragraph')
          this.para(this.runs(r.inlines), `<w:ind w:left="${720 * (level + 1)}"/>`);
        else this.block(r, { ...ctx, listLevel: level + 1 });
      }
    }
  }

  table(b: Extract<Block, { type: 'table' }>): void {
    const cols = Math.max(1, b.header.length);
    const cell = (content: Inline[], i: number, head: boolean) => {
      const jc = b.align[i]
        ? `<w:jc w:val="${b.align[i] === 'center' ? 'center' : b.align[i] === 'right' ? 'right' : 'left'}"/>`
        : '';
      const shade = head ? '<w:shd w:val="clear" w:color="auto" w:fill="F3F5FA"/>' : '';
      return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${shade}</w:tcPr><w:p><w:pPr><w:spacing w:after="0"/>${jc}</w:pPr>${this.runs(content, head ? { bold: true } : {})}</w:p></w:tc>`;
    };
    const row = (cells: Inline[][], head: boolean) =>
      `<w:tr>${head ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells.map((c, i) => cell(c, i, head)).join('')}</w:tr>`;
    const grid = `<w:tblGrid>${'<w:gridCol/>'.repeat(cols)}</w:tblGrid>`;
    this.body.push(
      `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/><w:tblLook w:val="04A0" w:firstRow="1"/></w:tblPr>${grid}${row(b.header, true)}${b.rows.map((r) => row(r, false)).join('')}</w:tbl>`,
    );
    this.para('', '<w:spacing w:after="0"/>');
  }
}

function run(text: string, s: RunStyle): string {
  if (!text) return '';
  const props = [
    s.bold ? '<w:b/>' : '',
    s.italic ? '<w:i/>' : '',
    s.strike ? '<w:strike/>' : '',
    s.code ? '<w:rStyle w:val="InlineCode"/>' : '',
    s.link ? '<w:rStyle w:val="Hyperlink"/>' : '',
  ].join('');
  const parts = text.split('\t').map((t) => `<w:t xml:space="preserve">${xmlEscape(t)}</w:t>`);
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${parts.join('<w:tab/>')}</w:r>`;
}

export function toDocx(conv: Conversation, opts: ExportOptions): Uint8Array {
  const w = new Writer(opts);
  w.para(run(conv.title, {}), '<w:pStyle w:val="Title"/>');
  const date = new Date(conv.exportedAt).toLocaleDateString(undefined, { dateStyle: 'long' });
  w.para(
    run(`${siteLabel(conv.site)} · ${date} · ${conv.messages.length} messages`, {}),
    '<w:pStyle w:val="Subtitle"/>',
  );
  for (const m of conv.messages) {
    w.para(
      run(messageLabel(m, opts, conv.site), {}),
      `<w:pStyle w:val="${m.role === 'user' ? 'SpeakerUser' : 'Speaker'}"/>`,
    );
    w.blocks(m.blocks);
  }
  const size =
    opts.paper === 'Letter' ? '<w:pgSz w:w="12240" w:h="15840"/>' : '<w:pgSz w:w="11906" w:h="16838"/>';
  const sect = `<w:sectPr>${size}<w:pgMar w:top="1134" w:right="1077" w:bottom="1134" w:left="1077" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;
  const document =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">` +
    `<w:body>${w.body.join('')}${sect}</w:body></w:document>`;

  return zipStore([
    { name: '[Content_Types].xml', data: CONTENT_TYPES },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'docProps/core.xml', data: core(conv.title) },
    { name: 'word/document.xml', data: document },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/numbering.xml', data: numbering(w.nums) },
    {
      name: 'word/_rels/document.xml.rels',
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>` +
        `${w.rels.join('')}</Relationships>`,
    },
  ]);
}

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
  `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
  `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;

const ROOT_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;

/** Title only: no creator, no last-modified-by, nothing personal. */
function core(title: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">` +
    `<dc:title>${xmlEscape(title)}</dc:title></cp:coreProperties>`
  );
}

function numbering(nums: [number, number, number][]): string {
  const bullets = ['•', '◦', '▪'];
  const fmts = ['decimal', 'lowerLetter', 'lowerRoman'];
  const lvl = (i: number, ordered: boolean) =>
    `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${ordered ? fmts[i % 3] : 'bullet'}"/>` +
    `<w:lvlText w:val="${ordered ? `%${i + 1}.` : bullets[i % 3]}"/><w:lvlJc w:val="left"/>` +
    `<w:pPr><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr></w:lvl>`;
  const abstract = (id: number, ordered: boolean) =>
    `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${Array.from({ length: 9 }, (_, i) => lvl(i, ordered)).join('')}</w:abstractNum>`;
  const num = ([id, abs, start]: [number, number, number]) =>
    `<w:num w:numId="${id}"><w:abstractNumId w:val="${abs}"/>${abs === 2 ? `<w:lvlOverride w:ilvl="0"><w:startOverride w:val="${start}"/></w:lvlOverride>` : ''}</w:num>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `${abstract(1, false)}${abstract(2, true)}${nums.map(num).join('')}</w:numbering>`
  );
}

const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
  `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei" w:cs="Nirmala UI"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>` +
  `<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="288" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
  `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/><w:color w:val="15171E"/></w:rPr></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="6" w:color="2457C5"/></w:pBdr><w:spacing w:after="240"/></w:pPr><w:rPr><w:color w:val="5D6170"/><w:sz w:val="19"/></w:rPr></w:style>` +
  [1, 2, 3, 4, 5, 6]
    .map(
      (i) =>
        `<w:style w:type="paragraph" w:styleId="Heading${i}"><w:name w:val="heading ${i}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
        `<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="${i - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${[36, 30, 26, 24, 22, 22][i - 1]}"/><w:color w:val="15171E"/></w:rPr></w:style>`,
    )
    .join('') +
  `<w:style w:type="paragraph" w:styleId="Speaker"><w:name w:val="Speaker"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="80"/></w:pPr><w:rPr><w:b/><w:caps/><w:spacing w:val="10"/><w:color w:val="2457C5"/><w:sz w:val="18"/></w:rPr></w:style>` +
  `<w:style w:type="paragraph" w:styleId="SpeakerUser"><w:name w:val="Speaker (you)"/><w:basedOn w:val="Speaker"/><w:next w:val="Normal"/><w:rPr><w:color w:val="6B7080"/></w:rPr></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F5F6F8"/><w:spacing w:after="160" w:line="240" w:lineRule="auto"/><w:ind w:left="144" w:right="144"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="18"/></w:rPr></w:style>` +
  `<w:style w:type="paragraph" w:styleId="CodeLabel"><w:name w:val="Code label"/><w:basedOn w:val="Normal"/><w:next w:val="Code"/><w:pPr><w:keepNext/><w:shd w:val="clear" w:color="auto" w:fill="F5F6F8"/><w:spacing w:after="0"/><w:ind w:left="144" w:right="144"/></w:pPr><w:rPr><w:color w:val="6B7080"/><w:sz w:val="16"/></w:rPr></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="C9D3EA"/></w:pBdr><w:ind w:left="240"/></w:pPr><w:rPr><w:color w:val="41454F"/></w:rPr></w:style>` +
  `<w:style w:type="character" w:styleId="InlineCode"><w:name w:val="Inline code"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="20"/><w:shd w:val="clear" w:color="auto" w:fill="EFF1F5"/></w:rPr></w:style>` +
  `<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="2457C5"/><w:u w:val="single"/></w:rPr></w:style>` +
  `<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders>` +
  ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="D9DCE5"/>`)
    .join('') +
  `</w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>` +
  `</w:styles>`;
