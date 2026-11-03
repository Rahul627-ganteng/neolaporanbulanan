// Ekspor rekap: XLSX (penulis SpreadsheetML ringkas di atas JSZip), CSV,
// PDF (pdf-lib), gambar kartu (html-to-image), dan ZIP berkas .docx.
import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { toBlob } from 'html-to-image';
import { INSTITUTION, cycleLabel, deadlineText } from './constants.js';
import { formatMasehi, formatHijri, todayIso } from './hijri.js';
import { IS_ARTIFACT } from './env.js';

// ---------------------------------------------------------------- CSV
export function toCSV(header, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  return '﻿' + body; // BOM agar Excel membaca UTF-8
}

// ---------------------------------------------------------------- XLSX
const xmlEsc = (s) =>
  String(s ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const colName = (i) => {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

function cellXml(ref, value, style) {
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xmlEsc(value)}</t></is></c>`;
}

function sheetXml({ title = [], header, rows, widths = [] }) {
  const lines = [];
  let r = 0;
  const merges = [];
  const last = colName(header.length - 1);
  title.forEach((t) => {
    r += 1;
    lines.push(`<row r="${r}">${cellXml(`A${r}`, t, r === 1 ? 3 : 4)}</row>`);
    merges.push(`<mergeCell ref="A${r}:${last}${r}"/>`);
  });
  if (title.length) r += 1; // baris kosong
  r += 1;
  const headerRow = r;
  lines.push(`<row r="${r}">${header.map((h, i) => cellXml(`${colName(i)}${r}`, h, 1)).join('')}</row>`);
  rows.forEach((row) => {
    r += 1;
    lines.push(`<row r="${r}">${row.map((v, i) => cellXml(`${colName(i)}${r}`, v, 2)).join('')}</row>`);
  });
  const cols = header
    .map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="${widths[i] || 18}" customWidth="1"/>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${lines.join('')}</sheetData>` +
    `<autoFilter ref="A${headerRow}:${last}${Math.max(r, headerRow)}"/>` +
    (merges.length ? `<mergeCells count="${merges.length}">${merges.join('')}</mergeCells>` : '') +
    '</worksheet>'
  );
}

const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="14"/><color rgb="FF0F172A"/><name val="Calibri"/></font>' +
  '<font><sz val="11"/><color rgb="FF475569"/><name val="Calibri"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF1E3A8A"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right>' +
  '<top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

/** sheets: [{name, title?:[], header:[], rows:[[]], widths?:[]}] → Blob .xlsx */
export async function buildXlsx(sheets) {
  const zip = new JSZip();
  const n = sheets.length;
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      '</Types>'
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
  );
  zip.file(
    'xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map((s, i) => `<sheet name="${xmlEsc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets>' +
      // filter otomatis butuh nama tersembunyi per lembar agar dikenali Excel
      '<definedNames>' +
      sheets
        .map((s, i) => {
          const lastCol = colName(s.header.length - 1);
          const headerRow = (s.title?.length ? s.title.length + 1 : 0) + 1;
          return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xmlEsc(s.name.slice(0, 31)).replace(/'/g, "''")}'!$A$${headerRow}:$${lastCol}$${headerRow + s.rows.length}</definedName>`;
        })
        .join('') +
      '</definedNames></workbook>'
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
  );
  zip.file('xl/styles.xml', STYLES);
  sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ---------------------------------------------------------------- ZIP
export async function buildZip(files) {
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.data);
  return zip.generateAsync({ type: 'blob' });
}

// ---------------------------------------------------------------- PDF daftar belum lapor
const winAnsi = (s) =>
  String(s ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');

function wrap(text, font, size, width) {
  const words = winAnsi(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= width) line = next;
    else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/** rows: [{no, nama, ketua, sekretaris}] */
export async function buildBelumLaporPdf({ cycle, period, rows, total }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Daftar Belum Lapor ${cycleLabel(cycle)}`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.118, 0.227, 0.541);
  const ink = rgb(0.059, 0.09, 0.165);
  const muted = rgb(0.4, 0.45, 0.53);
  const line = rgb(0.8, 0.84, 0.89);
  const W = 595.28;
  const H = 841.89;
  const M = 48;
  const cols = [
    { key: 'idx', label: 'No', w: 30 },
    { key: 'nama', label: 'Nama Bagian', w: 205 },
    { key: 'ketua', label: 'Ketua Bagian', w: 132 },
    { key: 'sekretaris', label: 'Sekretaris Bagian', w: 132 },
  ];
  let page;
  let y;
  let pageNo = 0;

  const header = () => {
    page = pdf.addPage([W, H]);
    pageNo += 1;
    y = H - M;
    if (pageNo === 1) {
      page.drawText(winAnsi('DAFTAR BAGIAN YANG BELUM MENGUMPULKAN LAPORAN BULANAN'), { x: M, y, size: 13, font: bold, color: ink });
      y -= 18;
      page.drawText(winAnsi(`${INSTITUTION.sektor} - ${INSTITUTION.nama}`), { x: M, y, size: 9.5, font, color: muted });
      y -= 13;
      page.drawText(winAnsi(`${INSTITUTION.kampus}${period ? ` - Tahun Ajaran ${period.label_masehi} / ${period.label_hijri}` : ''}`), { x: M, y, size: 9.5, font, color: muted });
      y -= 22;
      page.drawText(winAnsi(`Bulan: ${cycleLabel(cycle)}`), { x: M, y, size: 10.5, font: bold, color: ink });
      y -= 14;
      page.drawText(winAnsi(`Tenggat: ${deadlineText(cycle)}`), { x: M, y, size: 10.5, font, color: ink });
      y -= 14;
      const t = todayIso();
      page.drawText(winAnsi(`Per tanggal: ${formatHijri(t)} / ${formatMasehi(t)} M  -  ${rows.length} dari ${total} bagian belum melapor`), { x: M, y, size: 10.5, font, color: ink });
      y -= 20;
    }
    page.drawRectangle({ x: M, y: y - 18, width: W - 2 * M, height: 20, color: navy });
    let x = M;
    for (const c of cols) {
      page.drawText(c.label, { x: x + 6, y: y - 12, size: 9.5, font: bold, color: rgb(1, 1, 1) });
      x += c.w;
    }
    y -= 18;
  };

  header();
  if (!rows.length) {
    y -= 20;
    page.drawText('Alhamdulillah, seluruh bagian telah menginput softfile laporan.', { x: M, y, size: 11, font, color: ink });
  }
  rows.forEach((r, i) => {
    const cells = cols.map((c) => (c.key === 'idx' ? [String(i + 1)] : wrap(r[c.key] || '-', font, 9.5, c.w - 12)));
    const hgt = Math.max(...cells.map((l) => l.length)) * 12 + 10;
    if (y - hgt < M + 30) header();
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - hgt, width: W - 2 * M, height: hgt, color: rgb(0.973, 0.98, 0.988) });
    let x = M;
    cells.forEach((lines, ci) => {
      lines.forEach((ln, li) => page.drawText(ln, { x: x + 6, y: y - 14 - li * 12, size: 9.5, font, color: ink }));
      x += cols[ci].w;
    });
    y -= hgt;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: line });
  });

  const pages = pdf.getPages();
  pages.forEach((p, i) =>
    p.drawText(winAnsi(`Portal Laporan Bulanan ${INSTITUTION.sektor} - halaman ${i + 1} dari ${pages.length}`), {
      x: M, y: 24, size: 8, font, color: muted,
    })
  );
  return new Blob([await pdf.save()], { type: 'application/pdf' });
}

// ---------------------------------------------------------------- Kartu pengingat
export async function nodeToPng(node) {
  const blob = await toBlob(node, {
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    cacheBust: true,
    // Di artefak claude.ai, CSP menolak pengambilan stylesheet font; pakai font cadangan.
    skipFonts: IS_ARTIFACT,
  });
  if (!blob) throw new Error('Gagal membuat gambar kartu.');
  return blob;
}

export async function pngToPdf(pngBlob, title) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title || 'Kartu Pengingat Program');
  const img = await pdf.embedPng(await pngBlob.arrayBuffer());
  const width = 420;
  const height = (img.height / img.width) * width;
  const page = pdf.addPage([width + 40, height + 40]);
  page.drawImage(img, { x: 20, y: 20, width, height });
  return new Blob([await pdf.save()], { type: 'application/pdf' });
}
