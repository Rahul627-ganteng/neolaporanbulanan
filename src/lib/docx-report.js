// Generator Word (.docx) sesuai template resmi Laporan Bulanan PMDG Kampus 3.
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Tab,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import { HIJRI_MONTHS, kendalaCategory, nextMonthLabel, programCategory } from './constants.js';
import { formatHijri, formatMasehi, isoOfTimestamp, todayIso } from './hijri.js';

const FONT = 'Times New Roman';
const PAGE_W = 11906; // A4
const MARGIN_L = 1418;
const MARGIN_R = 1134;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R; // 9354

const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE };
const TABLE_NO_BORDERS = { ...NO_BORDERS, insideHorizontal: NONE, insideVertical: NONE };
const LINE = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
const BOX = { top: LINE, bottom: LINE, left: LINE, right: LINE };

const run = (text, opts = {}) => new TextRun({ text, font: FONT, size: 24, ...opts });

const para = (children, opts = {}) =>
  new Paragraph({
    spacing: { before: 0, after: 0, line: 276 },
    ...opts,
    children: Array.isArray(children) ? children : [children],
  });

const center = (text, opts = {}, pOpts = {}) => para(run(text, opts), { alignment: AlignmentType.CENTER, ...pOpts });

function numbered(items, render) {
  if (!items.length) return [para(run('—', { color: '666666' }), { spacing: { before: 60, after: 60 } })];
  return items.map((item, i) =>
    para([run(`${i + 1}.`), new TextRun({ children: [new Tab()] }), ...render(item)], {
      indent: { left: 400, hanging: 400 },
      spacing: { before: 40, after: 40, line: 276 },
      alignment: AlignmentType.JUSTIFIED,
    })
  );
}

function sectionBox(title, children) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            borders: BOX,
            width: { size: CONTENT_W, type: WidthType.DXA },
            shading: { fill: 'DCE6F5', type: ShadingType.CLEAR, color: 'auto' },
            margins: { top: 80, bottom: 80, left: 140, right: 140 },
            children: [para(run(title, { bold: true }))],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: BOX,
            width: { size: CONTENT_W, type: WidthType.DXA },
            margins: { top: 100, bottom: 140, left: 140, right: 140 },
            children,
          }),
        ],
      }),
    ],
  });
}

const spacer = (after = 200) => para(run(''), { spacing: { after } });

function metaTable(cycle, departmentName) {
  const w = [1300, 3500, 1200, 3354];
  const cell = (text, width, opts = {}, span) =>
    new TableCell({
      borders: NO_BORDERS,
      width: { size: width, type: WidthType.DXA },
      columnSpan: span,
      margins: { top: 30, bottom: 30, left: 0, right: 60 },
      children: [para(run(text, { bold: opts.bold }))],
    });
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: w,
    borders: TABLE_NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          cell('BULAN', w[0], { bold: true }),
          cell(`: ${HIJRI_MONTHS[cycle.hijri_month - 1]}`, w[1]),
          cell('TAHUN', w[2], { bold: true }),
          cell(`: ${cycle.hijri_year} H / ${cycle.masehi_label} M`, w[3]),
        ],
      }),
      new TableRow({
        children: [cell('BAGIAN', w[0], { bold: true }), cell(`: ${departmentName}`, w[1] + w[2] + w[3], {}, 3)],
      }),
    ],
  });
}

function signatureBlock(report) {
  const half = CONTENT_W / 2;
  const c = (children, span = 1) =>
    new TableCell({
      borders: NO_BORDERS,
      columnSpan: span,
      verticalAlign: VerticalAlign.CENTER,
      width: { size: half * span, type: WidthType.DXA },
      children: Array.isArray(children) ? children : [children],
    });
  // keepNext pada setiap baris menjaga blok tanda tangan tetap utuh di satu halaman
  const K = { keepNext: true, keepLines: true };
  const center = (text, opts = {}) => para(run(text, opts), { alignment: AlignmentType.CENTER, ...K });
  const gap = () => para(run(''), K);
  const name = (n, keep = false) =>
    para(run(`( ${n || '..............................'} )`, { bold: true, underline: n ? {} : undefined }), {
      alignment: AlignmentType.CENTER,
      ...(keep ? K : {}),
    });
  const blank = () => [gap(), gap(), gap()];
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [half, half],
    borders: TABLE_NO_BORDERS,
    rows: [
      new TableRow({ children: [c(center('Mengetahui,'), 2)] }),
      new TableRow({ children: [c(center('Sekretaris Bagian')), c(center('Ketua Bagian'))] }),
      new TableRow({ children: [c(blank()), c(blank())] }),
      new TableRow({ children: [c(name(report.sekretaris_nama, true)), c(name(report.ketua_nama, true))] }),
      new TableRow({ children: [c([para(run(''), { ...K, spacing: { after: 120 } }), center('Menyetujui,')], 2)] }),
      new TableRow({ children: [c(center('Pembimbing Bagian'), 2)] }),
      new TableRow({ children: [c(blank(), 2)] }),
      new TableRow({ children: [c(name(report.pembimbing_nama), 2)] }),
    ],
  });
}

export function buildReportDocument({ report, department, cycle, period }) {
  const programs = report.programs || [];
  const kendala = report.kendala || [];
  const dateIso = report.submitted_at ? isoOfTimestamp(report.submitted_at) : todayIso();

  const children = [
    center('LAPORAN BULANAN', { bold: true, size: 28 }),
    center('PONDOK MODERN DARUSSALAM GONTOR KAMPUS 3', { bold: true }),
    center("DARUL MA'RIFAT SUMBERCANGKRING GURAH KEDIRI", { bold: true }),
    center(`TAHUN AJARAN ${period ? `${period.label_masehi} / ${period.label_hijri}` : ''}`, { bold: true }, {
      border: { bottom: { style: BorderStyle.DOUBLE, size: 6, color: '000000', space: 4 } },
      spacing: { after: 240 },
    }),
    metaTable(cycle, department.nama),
    spacer(200),
    sectionBox('HASIL USAHA', numbered(report.hasil_usaha || [], (t) => [run(t)])),
    spacer(120),
    sectionBox(
      'KENDALA-KENDALA',
      numbered(kendala, (k) => [run(k.teks), run(`  (${kendalaCategory(k.kategori).label})`, { italics: true, size: 20, color: '555555' })])
    ),
    spacer(120),
    sectionBox('SOLUSI DARI KENDALA', numbered(report.solusi || [], (t) => [run(t)])),
    spacer(120),
    sectionBox(`PROGRAM KERJA SATU BULAN KE DEPAN (${nextMonthLabel(cycle).toUpperCase()})`, numbered(programs, (p) => {
      const cat = programCategory(p.kategori);
      const unggulan = p.kategori === 'unggulan';
      const parts = [run(p.judul, { bold: unggulan })];
      if (p.target) parts.push(run(` — target: ${p.target}`));
      parts.push(run(`  [${unggulan ? 'Program Unggulan' : cat.short}]`, { italics: true, size: 20, bold: unggulan, color: unggulan ? '1E3A8A' : '555555' }));
      return parts;
    })),
    spacer(280),
    para(run(`Darul Ma'rifat, ${formatHijri(dateIso)} / ${formatMasehi(dateIso)} M`), {
      alignment: AlignmentType.RIGHT,
      spacing: { after: 200 },
      keepNext: true,
    }),
    signatureBlock(report),
    spacer(320),
    para(run('NB:', { bold: true, size: 22 })),
    para(run('- Laporan bulanan dikumpulkan pada tanggal 5 hijriah pada bulan selanjutnya', { italics: true, size: 22 }), { indent: { left: 200 } }),
    para(run('- Penulisan laporan bulanan bersifat inovatif bukan rutinitas', { italics: true, size: 22 }), { indent: { left: 200 } }),
  ];

  return new Document({
    creator: 'Portal Laporan Bulanan Sektor Guru KMI',
    title: `Laporan Bulanan ${department.nama}`,
    description: `Laporan bulanan ${HIJRI_MONTHS[cycle.hijri_month - 1]} ${cycle.hijri_year} H`,
    styles: { default: { document: { run: { font: FONT, size: 24 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: 16838 },
            margin: { top: 1134, bottom: 1134, left: MARGIN_L, right: MARGIN_R },
          },
        },
        children,
      },
    ],
  });
}

export function reportDocxBlob(args) {
  return Packer.toBlob(buildReportDocument(args));
}

export function reportDocxFilename({ department, cycle }) {
  const month = HIJRI_MONTHS[cycle.hijri_month - 1].replace(/[^A-Za-z]+/g, '');
  const dept = department.nama.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `Laporan_${String(department.no).padStart(2, '0')}_${dept}_${month}_${cycle.hijri_year}H.docx`;
}
