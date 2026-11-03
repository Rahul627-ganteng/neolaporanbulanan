import React, { useMemo, useState } from 'react';
import { Archive, Eye, FileText, Inbox, Search, Star } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { cycleLabel, HIJRI_MONTHS, kendalaCategory, nextMonthLabel, programCategory } from '../lib/constants.js';
import { formatTimestamp } from '../lib/hijri.js';
import { reportState, STATE_META } from '../lib/status.js';
import { reportDocxBlob, reportDocxFilename } from '../lib/docx-report.js';
import { buildZip } from '../lib/exports.js';
import { saveFile } from '../lib/files.js';
import { Badge, Button, Empty, Input, Modal, Panel, Segmented } from './ui.jsx';
import { ReminderCardModal } from './ReminderCard.jsx';

export function ReportDetail({ report, department, cycle, onClose }) {
  if (!report) return null;
  const Section = ({ title, children }) => (
    <section className="flex flex-col gap-2">
      <h4 className="font-serif text-[16px] font-semibold text-navy">{title}</h4>
      {children}
    </section>
  );
  const List = ({ items, render }) =>
    items?.length ? (
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[14px] leading-relaxed text-ink marker:text-muted">
        {items.map((x, i) => <li key={i}>{render ? render(x) : x}</li>)}
      </ol>
    ) : (
      <p className="text-[13px] text-muted">—</p>
    );
  return (
    <Modal open onClose={onClose} size="lg" eyebrow={cycleLabel(cycle)} title={department.nama}>
      <div className="flex flex-col gap-5">
        <dl className="grid grid-cols-1 gap-3 rounded-lg bg-mist px-4 py-3 text-[13px] sm:grid-cols-3">
          <div><dt className="text-muted">Sekretaris</dt><dd className="font-semibold">{report.sekretaris_nama || '—'}</dd></div>
          <div><dt className="text-muted">Ketua</dt><dd className="font-semibold">{report.ketua_nama || '—'}</dd></div>
          <div><dt className="text-muted">Pembimbing</dt><dd className="font-semibold">{report.pembimbing_nama || '—'}</dd></div>
        </dl>
        <Section title="Hasil Usaha"><List items={report.hasil_usaha} /></Section>
        <Section title="Kendala-kendala">
          <List items={report.kendala} render={(k) => <>{k.teks} <span className="text-[12px] text-muted">· {kendalaCategory(k.kategori).label}</span></>} />
        </Section>
        <Section title="Solusi dari Kendala"><List items={report.solusi} /></Section>
        <Section title={`Program Kerja ${nextMonthLabel(cycle)}`}>
          <List
            items={report.programs}
            render={(p) => {
              const c = programCategory(p.kategori);
              return (
                <span className={p.kategori === 'unggulan' ? 'font-semibold' : ''}>
                  {c.emoji} {p.judul}
                  {p.target && <span className="font-normal text-muted"> · target: {p.target}</span>}
                </span>
              );
            }}
          />
        </Section>
      </div>
    </Modal>
  );
}

export default function Reports() {
  const { viewCycle, period, reports, departments, today, actions } = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('masuk');
  const [card, setCard] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState('');
  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return reports
      .map((r) => ({ r, d: deptById.get(r.department_id) }))
      .filter(({ r, d }) => d && (!needle || d.nama.toLowerCase().includes(needle)))
      .filter(({ r }) => (filter === 'masuk' ? r.submitted_at : filter === 'belum' ? !r.submitted_at : true))
      .sort((a, b) => a.d.no - b.d.no);
  }, [reports, deptById, q, filter]);

  const downloadOne = async (r, d) => {
    setBusy(r.id);
    try {
      const res = await saveFile(reportDocxFilename({ department: d, cycle: viewCycle }), await reportDocxBlob({ report: r, department: d, cycle: viewCycle, period }));
      if (res === 'saved') actions.notify(`Laporan ${d.nama} siap diunduh.`);
    } catch (e) {
      actions.notify(e.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const downloadAll = async () => {
    setBusy('zip');
    try {
      const submitted = reports.filter((r) => r.submitted_at);
      const files = [];
      for (const r of submitted) {
        const d = deptById.get(r.department_id);
        files.push({ name: reportDocxFilename({ department: d, cycle: viewCycle }), data: await reportDocxBlob({ report: r, department: d, cycle: viewCycle, period }) });
      }
      const zip = await buildZip(files);
      const res = await saveFile(`Laporan_Bulanan_KMI_${HIJRI_MONTHS[viewCycle.hijri_month - 1].replace(/[^A-Za-z]/g, '')}_${viewCycle.hijri_year}H.zip`, zip);
      if (res === 'saved') actions.notify(`${files.length} laporan Word dikemas dalam satu ZIP.`);
    } catch (e) {
      actions.notify(e.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const submittedCount = reports.filter((r) => r.submitted_at).length;

  return (
    <div className="flex flex-col gap-6">
      <Panel
        eyebrow={`${submittedCount} laporan · ${cycleLabel(viewCycle)}`}
        title="Laporan masuk"
        actions={
          <Button variant="primary" icon={Archive} busy={busy === 'zip'} disabled={!submittedCount} onClick={downloadAll}>
            Unduh semua (.zip berisi .docx)
          </Button>
        }
        bodyClass="p-0"
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input id="reports-search" className="h-9 pl-9" placeholder="Cari bagian" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Segmented
            label="Saring laporan"
            value={filter}
            onChange={setFilter}
            options={[{ value: 'masuk', label: 'Sudah masuk' }, { value: 'belum', label: 'Belum' }, { value: 'semua', label: 'Semua' }]}
          />
        </div>
        {rows.length === 0 ? (
          <Empty icon={Inbox} title="Tidak ada laporan pada saringan ini" />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(({ r, d }) => {
              const st = reportState(r, viewCycle, today);
              const ung = (r.programs || []).filter((p) => p.kategori === 'unggulan').length;
              return (
                <li key={r.id} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-baseline gap-3">
                    <span className="w-6 shrink-0 text-right text-[12px] font-semibold text-muted tabular-nums">{d.no}</span>
                    <div className="min-w-0">
                      <p className="text-[14.5px] font-semibold text-ink">{d.nama}</p>
                      <p className="text-[12.5px] text-muted tabular-nums">
                        {r.submitted_at ? `Masuk ${formatTimestamp(r.submitted_at)}` : 'Belum menginput softfile'}
                        {r.submitted_at && ` · ${r.hasil_usaha?.length || 0} hasil usaha · ${r.kendala?.length || 0} kendala · ${r.programs?.length || 0} program`}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 pl-9 sm:pl-0">
                    {ung > 0 && <Badge tone="brand" icon={Star}>{ung} unggulan</Badge>}
                    <Badge tone={STATE_META[st].tone}>{STATE_META[st].label}</Badge>
                    {r.submitted_at && (
                      <>
                        <Button size="sm" variant="ghost" icon={Eye} onClick={() => setDetail({ r, d })}>Isi</Button>
                        <Button size="sm" onClick={() => setCard({ r, d })}>Kartu</Button>
                        <Button size="sm" icon={FileText} busy={busy === r.id} onClick={() => downloadOne(r, d)}>.docx</Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {detail && <ReportDetail report={detail.r} department={detail.d} cycle={viewCycle} onClose={() => setDetail(null)} />}
      <ReminderCardModal open={Boolean(card)} onClose={() => setCard(null)} report={card?.r} department={card?.d} cycle={viewCycle} />
    </div>
  );
}
