// A small PDF writer for God view's downloads (driverReport.mjs): pages of
// text, filled boxes and lines in the standard Helvetica fonts, which every
// PDF reader has, so nothing is embedded and no library is loaded. Positions
// are in points (1/72 inch) from the top-left corner of the page.
//
// The standard fonts draw only the Windows-1252 (WinAnsi) characters: Latin
// letters with accents (ñ, é) and common punctuation (– — … ‘ ’ “ ” •). Any
// other character, such as ₱ or →, is drawn as "?", so callers write those
// another way ("PHP 45", "to").

export const A4 = { width: 595.28, height: 841.89 };
const FONTS = { regular: 'F1', bold: 'F2' };

// Glyph widths in thousandths of the font size, for the characters 32 to 126
// (Adobe's metrics for Helvetica and Helvetica-Bold).
const WIDTHS = {
  regular: [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
    278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722,
    667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556,
    333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584],
  bold: [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
    333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722,
    667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611,
    389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584],
};
// The WinAnsi characters from 128 to 159 that differ from Unicode, and some
// of their widths (the rest are as wide as a digit).
const WIN_ANSI = new Map([[0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94],
  [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97], [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f]]);
const SPECIAL_WIDTHS = new Map([[0x85, 1000], [0x89, 1000], [0x91, 222], [0x92, 222], [0x93, 333], [0x94, 333], [0x95, 350], [0x96, 556], [0x97, 1000], [0xb7, 278]]);

// Text as WinAnsi character codes (one per character). Thin and no-break
// spaces, which browsers put in times ("3:45 PM"), become plain spaces; a
// letter outside WinAnsi loses its accent if that makes it one (ā → a);
// anything else becomes "?".
export function encodeText(value) {
  const codes = [];
  for (const char of String(value ?? '').normalize('NFC').replace(/[  -   ]/g, ' ')) {
    const point = char.codePointAt(0);
    if ((point >= 32 && point <= 126) || (point >= 0xa0 && point <= 0xff)) codes.push(point);
    else if (WIN_ANSI.has(point)) codes.push(WIN_ANSI.get(point));
    else if (point < 32) continue;
    else {
      const base = char.normalize('NFD').codePointAt(0);
      codes.push(base >= 32 && base <= 126 ? base : 63);
    }
  }
  return codes;
}

function codeWidth(code, font) {
  if (code >= 32 && code <= 126) return WIDTHS[font][code - 32];
  if (SPECIAL_WIDTHS.has(code)) return SPECIAL_WIDTHS.get(code);
  // An accented Latin letter is as wide as the letter itself.
  const base = String.fromCharCode(code).normalize('NFD').charCodeAt(0);
  return base >= 32 && base <= 126 ? WIDTHS[font][base - 32] : 556;
}

// How wide `value` is, in points, at `size` in `font` (regular or bold).
export function textWidth(value, font = 'regular', size = 10) {
  return encodeText(value).reduce((sum, code) => sum + codeWidth(code, font), 0) * size / 1000;
}

// `value`, shortened with "…" to fit in `width` points.
export function fitText(value, width, font = 'regular', size = 10) {
  const text = String(value ?? '');
  if (textWidth(text, font, size) <= width) return text;
  const chars = [...text];
  while (chars.length && textWidth(`${chars.join('').trimEnd()}…`, font, size) > width) chars.pop();
  return chars.length ? `${chars.join('').trimEnd()}…` : '';
}

// A PDF string literal: WinAnsi bytes, with ( ) \ escaped.
function literal(value) {
  return `(${encodeText(value).map(code => {
    const char = String.fromCharCode(code);
    return char === '(' || char === ')' || char === '\\' ? `\\${char}` : char;
  }).join('')})`;
}

const round = value => Number(value.toFixed(2));
// "#137a5b" → "0.075 0.478 0.357"
function rgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [value >> 16, (value >> 8) & 255, value & 255].map(part => round(part / 255)).join(' ');
}

// pages: drawing operations by page. title names the document in readers.
export function createPdf({ size = A4, title = '' } = {}) {
  const pages = [];
  let current = null;
  const y = top => round(size.height - top);
  const doc = {
    size,
    get pageCount() { return pages.length; },
    addPage() { current = []; pages.push(current); return pages.length; },
    // Switches to an earlier page (1 is the first), to add to it.
    usePage(number) { current = pages[number - 1]; },
    // Text whose baseline is `top` points from the top. align: left, right
    // (x is the right edge) or center.
    text(value, x, top, { font = 'regular', size: fontSize = 10, color = '#20352f', align = 'left' } = {}) {
      if (value === undefined || value === null || value === '') return;
      const width = textWidth(value, font, fontSize);
      const left = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
      current.push(`BT /${FONTS[font]} ${fontSize} Tf ${rgb(color)} rg ${round(left)} ${y(top)} Td ${literal(value)} Tj ET`);
    },
    rect(x, top, width, height, { fill = null, stroke = null, lineWidth = 0.75 } = {}) {
      const box = `${round(x)} ${y(top + height)} ${round(width)} ${round(height)} re`;
      if (fill && stroke) current.push(`${rgb(fill)} rg ${rgb(stroke)} RG ${lineWidth} w ${box} B`);
      else if (fill) current.push(`${rgb(fill)} rg ${box} f`);
      else if (stroke) current.push(`${rgb(stroke)} RG ${lineWidth} w ${box} S`);
    },
    line(x1, top1, x2, top2, { color = '#e4eae6', lineWidth = 0.75 } = {}) {
      current.push(`${rgb(color)} RG ${lineWidth} w ${round(x1)} ${y(top1)} m ${round(x2)} ${y(top2)} l S`);
    },
    // The finished file. Every character in it is one byte, so offsets into
    // the string are the byte offsets the cross-reference table needs.
    toBytes() {
      const objects = [];
      const add = body => { objects.push(body); return objects.length; };
      const catalog = add(''), tree = add('');
      const regular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      const kids = pages.map(operations => {
        const stream = operations.join('\n');
        const contents = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
        return add(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${size.width} ${size.height}] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${contents} 0 R >>`);
      });
      objects[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R >>`;
      objects[tree - 1] = `<< /Type /Pages /Kids [${kids.map(kid => `${kid} 0 R`).join(' ')}] /Count ${kids.length} >>`;
      const info = add(`<< /Title ${literal(title)} /Producer (IndangGO God view) >>`);
      // The comment's bytes above 127 tell tools the file is binary.
      let file = '%PDF-1.4\n%âãÏÓ\n';
      const offsets = objects.map((body, index) => { const offset = file.length; file += `${index + 1} 0 obj\n${body}\nendobj\n`; return offset; });
      const xref = file.length;
      file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
      file += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
      return Uint8Array.from(file, char => char.charCodeAt(0));
    },
  };
  return doc;
}
