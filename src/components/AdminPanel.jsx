import React, { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Funnel, FunnelChart, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { FileSpreadsheet, Search, SlidersHorizontal, Star, Table2 } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import {
  cycleLabel, HIJRI_MONTHS, KENDALA_CATEGORIES, kendalaCategory, nextMonthLabel, PROGRAM_CATEGORIES, programCategory, STAGES,
} from '../lib/constants.js';
import { formatTimestamp } from '../lib/hijri.js';
import { reportState, STATE_META } from '../lib/status.js';
import { buildXlsx, toCSV } from '../lib/exports.js';
import { saveFile } from '../lib/files.js';
import { Badge, Button, cx, Empty, Input, Panel, Segmented, Select } from './ui.jsx';
import { ReportDetail } from './Reports.jsx';

// Warna status (palet status tetap) dan ramp biru ordinal untuk tahapan.
const STATE_COLOR = { tepat: '#0CA30C', terlambat: '#FAB219', belum: '#94A3B8', lewat: '#D03B3B' };
const STAGE_RAMP = ['#86B6EF', '#5598E7', '#2A78D6', '#1C5CAB', '#104281'];
const INK = '#0F172A';
const MUTED = '#5B6478';
const GRID = '#E2E8F0';

function ChartTooltip({ active, payload, label, unit = 'bagian' }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-[12.5px] shadow-lg">
      <p className="font-semibold text-ink">{label || p.payload.name}</p>
      <p className="text-muted tabular-nums">
        {p.value} {unit}
        {p.payload.pct != null ? ` · ${p.payload.pct}%` : ''}
      </p>
    </div>
  );
}

function ComplianceCard({ reports, cycle, today, total, prevStats }) {
  const counts = { tepat: 0, terlambat: 0, belum: 0, lewat: 0 };
  reports.forEach((r) => (counts[reportState(r, cycle, today)] += 1));
  const missing = total - reports.length;
  if (missing > 0) counts[today > cycle.deadline_date ? 'lewat' : 'belum'] += missing;
  const data = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ key: k, name: STATE_META[k].label, value: v, pct: Math.round((v / total) * 100) }));
  const done = counts.tepat + counts.terlambat;
  const pct = Math.round((done / total) * 100);
  const compare = [
    prevStats && { name: prevStats.label, value: prevStats.pct, current: false },
    { name: `${HIJRI_MONTHS[cycle.hijri_month - 1]} ${cycle.hijri_year}`, value: pct, current: true },
  ].filter(Boolean);
  return (
    <Panel eyebrow="Kepatuhan pengumpulan" title={`${done} dari ${total} bagian telah melapor`}>
      <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[220px_1fr]">
        <div className="relative mx-auto h-[220px] w-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={68} outerRadius={100} paddingAngle={data.length > 1 ? 1.5 : 0} stroke="#FFFFFF" strokeWidth={2} isAnimationActive={false}>
                {data.map((d) => <Cell key={d.key} fill={STATE_COLOR[d.key]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-serif text-[34px] font-semibold leading-none text-ink tabular-nums">{pct}%</span>
            <span className="mt-1 text-[12px] text-muted">kepatuhan</span>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <ul className="grid grid-cols-2 gap-2">
            {Object.entries(counts).map(([k, v]) => (
              <li key={k} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                <span className="flex items-center gap-2 whitespace-nowrap text-[12.5px] text-ink">
                  <span className="size-2.5 rounded-full" style={{ background: STATE_COLOR[k] }} aria-hidden />
                  {STATE_META[k].label}
                </span>
                <span className="text-[13px] font-semibold tabular-nums">{v}</span>
              </li>
            ))}
          </ul>
          <div>
            <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted">Dibanding bulan lalu (% bagian melapor)</p>
            <div className="h-[92px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={compare} layout="vertical" margin={{ top: 0, right: 36, bottom: 0, left: 0 }} barCategoryGap={10}>
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fill: MUTED, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip unit="%" />} cursor={{ fill: '#F1F5F9' }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                    {compare.map((c) => <Cell key={c.name} fill={c.current ? '#1D4ED8' : '#86B6EF'} />)}
                    <LabelList dataKey="value" position="right" formatter={(v) => `${v}%`} fill={INK} fontSize={12} fontWeight={600} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function FunnelCard({ reports, total }) {
  const data = STAGES.map((s, i) => {
    const v = reports.filter((r) => r[s.key]).length;
    return { name: s.short, full: s.label, week: s.week, value: v, pct: Math.round((v / total) * 100), fill: STAGE_RAMP[i] };
  });
  return (
    <Panel eyebrow="Progress funnel Minggu 3 → Minggu 4" title="Tahapan rundown pelaporan">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="h-[250px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <FunnelChart margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
              <Tooltip content={<ChartTooltip />} />
              <Funnel dataKey="value" data={data} isAnimationActive={false} stroke="#FFFFFF" strokeWidth={2} lastShapeType="rectangle">
                <LabelList position="center" dataKey="value" fill="#FFFFFF" stroke="none" fontSize={13} fontWeight={700} />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </div>
        <ol className="flex flex-col justify-center gap-2">
          {data.map((d) => (
            <li key={d.name} className="flex items-center justify-between gap-2 text-[13px]">
              <span className="flex min-w-0 items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: d.fill }} aria-hidden />
                <span className="leading-snug text-ink">{d.full}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{d.value}<span className="font-normal text-muted">/{total}</span></span>
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  );
}

function CategoryCharts({ reports, cycle }) {
  const progs = reports.flatMap((r) => r.programs || []);
  const progData = PROGRAM_CATEGORIES.map((c) => ({ key: c.key, name: `${c.emoji} ${c.short}`, value: progs.filter((p) => p.kategori === c.key).length }));
  const kendala = reports.flatMap((r) => r.kendala || []);
  const kData = KENDALA_CATEGORIES.map((c) => ({ key: c.key, name: c.label, value: kendala.filter((k) => k.kategori === c.key).length }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Panel eyebrow={`${progs.length} program untuk ${nextMonthLabel(cycle)}`} title="Distribusi klasifikasi program">
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={progData} margin={{ top: 18, right: 8, bottom: 0, left: -18 }} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="name" tick={{ fill: INK, fontSize: 12 }} axisLine={{ stroke: '#CBD5E1' }} tickLine={false} interval={0} />
              <YAxis allowDecimals={false} tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip unit="program" />} cursor={{ fill: '#F1F5F9' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {progData.map((d) => <Cell key={d.key} fill={d.key === 'unggulan' ? '#1E3A8A' : '#5598E7'} />)}
                <LabelList dataKey="value" position="top" fill={INK} fontSize={12} fontWeight={600} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <Panel eyebrow={`${kendala.length} kendala tercatat`} title="Kategori kendala terbanyak">
        {kData.length === 0 ? (
          <Empty title="Belum ada kendala tercatat" />
        ) : (
          <div style={{ height: Math.max(160, kData.length * 38 + 20) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={kData} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barCategoryGap={8}>
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fill: INK, fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip unit="kendala" />} cursor={{ fill: '#F1F5F9' }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {kData.map((d, i) => <Cell key={d.key} fill={i === 0 ? '#1E3A8A' : '#5598E7'} />)}
                  <LabelList dataKey="value" position="right" fill={INK} fontSize={12} fontWeight={600} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Showcase({ reports, deptById, cycle }) {
  const { actions } = useStore();
  const [q, setQ] = useState('');
  const [curate, setCurate] = useState(false);
  const needle = q.trim().toLowerCase();
  const items = reports
    .flatMap((r) => (r.programs || []).map((p) => ({ p, r, d: deptById.get(r.department_id) })))
    .filter(({ p, d }) => d && (curate || p.kategori === 'unggulan'))
    .filter(({ p, d }) => !needle || p.judul.toLowerCase().includes(needle) || d.nama.toLowerCase().includes(needle))
    .sort((a, b) => a.d.no - b.d.no);
  return (
    <Panel
      eyebrow={`Agenda strategis kampus · ${nextMonthLabel(cycle)}`}
      title="Etalase Program Unggulan"
      actions={
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input id="showcase-search" className="h-9 w-56 pl-9" placeholder="Cari program/bagian" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button size="sm" variant={curate ? 'navy' : 'secondary'} icon={SlidersHorizontal} onClick={() => setCurate((v) => !v)}>
            {curate ? 'Selesai kurasi' : 'Kurasi klasifikasi'}
          </Button>
        </>
      }
    >
      {items.length === 0 ? (
        <Empty icon={Star} title={curate ? 'Belum ada program' : 'Belum ada Program Unggulan'}>
          Program bertanda 🌟 dari seluruh bagian akan terkumpul di sini.
        </Empty>
      ) : curate ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-[0.08em] text-muted">
              <tr><th className="py-2 pr-3 font-semibold">Bagian</th><th className="py-2 pr-3 font-semibold">Program</th><th className="py-2 font-semibold">Klasifikasi</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map(({ p, r, d }) => (
                <tr key={p.id}>
                  <td className="py-2 pr-3 text-muted">{d.no}. {d.nama}</td>
                  <td className="py-2 pr-3 font-medium text-ink">{p.judul}</td>
                  <td className="py-2">
                    <Select id={`cur-${p.id}`} className="h-8 w-56 py-0 text-[13px]" value={p.kategori} onChange={(e) => actions.setProgramCategory(r, p.id, e.target.value)} aria-label={`Klasifikasi ${p.judul}`}>
                      {PROGRAM_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map(({ p, d }) => (
            <li key={p.id} className="flex flex-col gap-1.5 rounded-xl border border-line bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand">🌟 {d.nama}</p>
              <p className="font-serif text-[17px] font-semibold leading-snug text-ink">{p.judul}</p>
              {p.target && <p className="text-[12.5px] text-muted">Target: {p.target}</p>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function MasterTable({ reports, deptById, cycle, today, period }) {
  const { actions } = useStore();
  const [q, setQ] = useState('');
  const [st, setSt] = useState('semua');
  const [kk, setKk] = useState('');
  const [pk, setPk] = useState('');
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState('');
  const needle = q.trim().toLowerCase();
  const rows = reports
    .map((r) => ({ r, d: deptById.get(r.department_id), s: reportState(r, cycle, today) }))
    .filter(({ d }) => d)
    .filter(({ s }) => st === 'semua' || (st === 'masuk' ? s === 'tepat' || s === 'terlambat' : st === 'belum' ? s === 'belum' || s === 'lewat' : s === st))
    .filter(({ r }) => !kk || (r.kendala || []).some((k) => k.kategori === kk))
    .filter(({ r }) => !pk || (r.programs || []).some((p) => p.kategori === pk))
    .filter(({ r, d }) => {
      if (!needle) return true;
      const hay = [d.nama, ...(r.hasil_usaha || []), ...(r.kendala || []).map((k) => k.teks), ...(r.solusi || []), ...(r.programs || []).map((p) => p.judul)].join(' ').toLowerCase();
      return hay.includes(needle);
    })
    .sort((a, b) => a.d.no - b.d.no);

  const lines = (arr, f = (x) => x) => (arr || []).map((x, i) => `${i + 1}. ${f(x)}`).join('\n');
  const exportRows = () =>
    rows.map(({ r, d, s }) => [
      d.no, d.nama, STATE_META[s].label, r.submitted_at ? formatTimestamp(r.submitted_at) : '-',
      r.sekretaris_nama || '', r.ketua_nama || '', r.pembimbing_nama || '',
      lines(r.hasil_usaha), lines(r.kendala, (k) => `${k.teks} (${kendalaCategory(k.kategori).label})`), lines(r.solusi),
      lines(r.programs, (p) => `${programCategory(p.kategori).emoji} ${p.judul}${p.target ? ` — target: ${p.target}` : ''}`),
    ]);
  const HEAD = ['No', 'Bagian', 'Status', 'Masuk', 'Sekretaris', 'Ketua', 'Pembimbing', 'Hasil Usaha', 'Kendala', 'Solusi', 'Program Bulan Depan'];
  const base = `Rekap_Laporan_KMI_${HIJRI_MONTHS[cycle.hijri_month - 1].replace(/[^A-Za-z]/g, '')}_${cycle.hijri_year}H`;

  const doExport = async (kind) => {
    setBusy(kind);
    try {
      let res;
      if (kind === 'xlsx') {
        const progRows = rows.flatMap(({ r, d }) => (r.programs || []).map((p, i) => [d.no, d.nama, i + 1, p.judul, programCategory(p.kategori).label, p.target || '']));
        const kRows = rows.flatMap(({ r, d }) => (r.kendala || []).map((k, i) => [d.no, d.nama, i + 1, k.teks, kendalaCategory(k.kategori).label]));
        const blob = await buildXlsx([
          { name: 'Rekap Laporan', title: [`REKAP LAPORAN BULANAN SEKTOR GURU KMI — ${cycleLabel(cycle).toUpperCase()}`, `Tahun Ajaran ${period?.label_masehi} / ${period?.label_hijri}`], header: HEAD, rows: exportRows(), widths: [5, 34, 13, 22, 22, 22, 22, 60, 50, 50, 60] },
          { name: 'Program Kerja', header: ['No. Bagian', 'Bagian', 'Urutan', 'Program', 'Klasifikasi', 'Target'], rows: progRows, widths: [10, 34, 8, 52, 34, 24] },
          { name: 'Kendala', header: ['No. Bagian', 'Bagian', 'Urutan', 'Kendala', 'Kategori'], rows: kRows, widths: [10, 34, 8, 64, 26] },
        ]);
        res = await saveFile(`${base}.xlsx`, blob);
      } else {
        res = await saveFile(`${base}.csv`, toCSV(HEAD, exportRows()));
      }
      if (res === 'saved') actions.notify('Rekap siap diunduh.');
    } catch (e) {
      actions.notify(e.message, 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <Panel
      eyebrow={`${rows.length} baris · ${cycleLabel(cycle)}`}
      title="Tabel Rekapan Master"
      bodyClass="p-0"
      actions={
        <>
          <Button size="sm" icon={Table2} busy={busy === 'xlsx'} onClick={() => doExport('xlsx')}>Ekspor Excel</Button>
          <Button size="sm" icon={FileSpreadsheet} busy={busy === 'csv'} onClick={() => doExport('csv')}>CSV</Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-5 py-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input id="master-search" className="h-9 pl-9" placeholder="Cari isi laporan" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Segmented label="Status" value={st} onChange={setSt} options={[{ value: 'semua', label: 'Semua' }, { value: 'masuk', label: 'Masuk' }, { value: 'terlambat', label: 'Terlambat' }, { value: 'belum', label: 'Belum' }]} />
        <Select id="master-kendala" className="h-9 w-auto text-[13px]" value={kk} onChange={(e) => setKk(e.target.value)} aria-label="Saring kategori kendala">
          <option value="">Semua kendala</option>
          {KENDALA_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </Select>
        <Select id="master-program" className="h-9 w-auto text-[13px]" value={pk} onChange={(e) => setPk(e.target.value)} aria-label="Saring klasifikasi program">
          <option value="">Semua program</option>
          {PROGRAM_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.short}</option>)}
        </Select>
      </div>
      <div className="max-h-[640px] overflow-auto">
        <table className="w-full min-w-[1100px] text-left text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-mist text-[11px] uppercase tracking-[0.08em] text-muted">
            <tr>
              {['Bagian', 'Status', 'Hasil Usaha', 'Kendala', 'Solusi', 'Program Bulan Depan'].map((h) => (
                <th key={h} className="px-3 py-2.5 font-semibold first:pl-5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line align-top">
            {rows.map(({ r, d, s }) => (
              <tr key={r.id} className={cx('hover:bg-mist/70', r.submitted_at && 'cursor-pointer')} onClick={() => r.submitted_at && setDetail({ r, d })}>
                <td className="w-[210px] py-3 pl-5 pr-3">
                  <p className="font-semibold text-ink"><span className="text-muted tabular-nums">{d.no}.</span> {d.nama}</p>
                  {r.submitted_at && <p className="text-[11.5px] text-muted tabular-nums">{formatTimestamp(r.submitted_at)}</p>}
                </td>
                <td className="px-3 py-3"><Badge tone={STATE_META[s].tone}>{STATE_META[s].label}</Badge></td>
                <Cell3 items={r.hasil_usaha} />
                <Cell3 items={(r.kendala || []).map((k) => k.teks)} />
                <Cell3 items={r.solusi} />
                <td className="max-w-[260px] px-3 py-3">
                  <ul className="flex flex-col gap-1">
                    {(r.programs || []).slice(0, 4).map((p) => (
                      <li key={p.id} className={cx('leading-snug', p.kategori === 'unggulan' ? 'font-semibold text-navy' : 'text-ink')}>
                        {programCategory(p.kategori).emoji} {p.judul}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty title="Tidak ada laporan yang cocok" />}
      </div>
      {detail && <ReportDetail report={detail.r} department={detail.d} cycle={cycle} onClose={() => setDetail(null)} />}
    </Panel>
  );
}

function Cell3({ items }) {
  if (!items?.length) return <td className="px-3 py-3 text-muted">—</td>;
  return (
    <td className="max-w-[240px] px-3 py-3">
      <ol className="flex flex-col gap-1 text-ink">
        {items.slice(0, 3).map((t, i) => (
          <li key={i} className="line-clamp-2 leading-snug"><span className="text-muted tabular-nums">{i + 1}.</span> {t}</li>
        ))}
        {items.length > 3 && <li className="text-muted">+{items.length - 3} lainnya</li>}
      </ol>
    </td>
  );
}

export default function AdminPanel() {
  const { viewCycle, prevCycle, reports, prevReports, departments, activeDepartments, today, period } = useStore();
  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
  const total = activeDepartments.length;
  const submitted = reports.filter((r) => r.submitted_at);
  const prevStats = prevCycle && prevReports.length
    ? { label: `${HIJRI_MONTHS[prevCycle.hijri_month - 1]} ${prevCycle.hijri_year}`, pct: Math.round((prevReports.filter((r) => r.submitted_at).length / total) * 100) }
    : null;

  const tepat = reports.filter((r) => reportState(r, viewCycle, today) === 'tepat').length;
  const kendalaTop = KENDALA_CATEGORIES.map((c) => ({ c, n: submitted.flatMap((r) => r.kendala || []).filter((k) => k.kategori === c.key).length })).sort((a, b) => b.n - a.n)[0];
  const ung = submitted.flatMap((r) => r.programs || []).filter((p) => p.kategori === 'unggulan').length;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[14px] border border-line bg-white px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand">Ringkasan eksekutif · {cycleLabel(viewCycle)}</p>
        <p className="mt-1.5 max-w-[75ch] font-serif text-[18px] leading-relaxed text-ink text-pretty">
          {submitted.length} dari {total} bagian ({Math.round((submitted.length / total) * 100)}%) telah menginput softfile, {tepat} di antaranya tepat waktu.
          {kendalaTop?.n ? ` Kendala terbanyak berasal dari ${kendalaTop.c.label.toLowerCase()} (${kendalaTop.n} catatan).` : ''}
          {` ${ung} Program Unggulan direncanakan untuk ${nextMonthLabel(viewCycle)}.`}
          {prevStats ? ` Bulan lalu ${prevStats.pct}% bagian melapor.` : ''}
        </p>
      </section>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ComplianceCard reports={reports} cycle={viewCycle} today={today} total={total} prevStats={prevStats} />
        <FunnelCard reports={reports} total={total} />
      </div>
      <CategoryCharts reports={submitted} cycle={viewCycle} />
      <Showcase reports={submitted} deptById={deptById} cycle={viewCycle} />
      <MasterTable reports={reports} deptById={deptById} cycle={viewCycle} today={today} period={period} />
    </div>
  );
}
