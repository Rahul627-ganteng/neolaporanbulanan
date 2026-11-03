import React, { useMemo, useState } from 'react';
import { ArrowRight, ClipboardList, Download, FileEdit, Inbox, Star } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { cycleMonthName, daysBetween, deadlineText, nextMonthLabel, formatGregorian } from '../lib/constants.js';
import { formatTimestamp } from '../lib/hijri.js';
import { reportState, STATE_META } from '../lib/status.js';
import { Badge, Button, Empty, Panel, Progress, StatusDot } from './ui.jsx';
import WeekStepper from './WeekStepper.jsx';
import BelumLaporModal, { useBelumLapor } from './BelumLaporModal.jsx';
import { ReminderCardModal } from './ReminderCard.jsx';

function Stat({ label, value, sub, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-[14px] border border-line bg-white px-5 py-4">
      <span className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</span>
      <span className="font-serif text-[30px] font-semibold leading-none text-ink">{value}</span>
      {sub && <span className="text-[12.5px] text-muted">{sub}</span>}
      {children}
    </div>
  );
}

export default function Dashboard({ go }) {
  const { viewCycle, reports, activeDepartments, departments, week, today, isAdmin } = useStore();
  const belum = useBelumLapor();
  const [belumOpen, setBelumOpen] = useState(false);
  const [card, setCard] = useState(null);
  const total = activeDepartments.length;
  const submitted = reports.filter((r) => r.submitted_at);
  const left = daysBetween(today, viewCycle.deadline_date);
  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
  const unggulan = submitted.flatMap((r) => (r.programs || []).filter((p) => p.kategori === 'unggulan'));
  const latest = [...submitted].sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at))).slice(0, 7);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Softfile masuk" value={<span className="tabular-nums">{submitted.length}<span className="text-[18px] text-muted">/{total}</span></span>}>
          <Progress value={submitted.length} max={total} className="mt-1" />
        </Stat>
        <Stat label="Belum lapor" value={<span className="tabular-nums">{belum.length}</span>} sub={belum.length ? 'bagian perlu diingatkan' : 'Alhamdulillah, lengkap'} />
        <Stat
          label="Tenggat"
          value={<span className="tabular-nums">{left >= 0 ? `${left} hari` : 'Lewat'}</span>}
          sub={`${deadlineText(viewCycle).replace(/ \(.*/, '')} · ${formatGregorian(viewCycle.deadline_date, true)}`}
        />
        <Stat
          label="Program unggulan"
          value={<span className="tabular-nums">{unggulan.length}</span>}
          sub={`untuk ${nextMonthLabel(viewCycle)} dari ${new Set(submitted.filter((r) => r.programs?.some((p) => p.kategori === 'unggulan')).map((r) => r.department_id)).size} bagian`}
        />
      </div>

      <Panel eyebrow={`Bulan ${cycleMonthName(viewCycle)} ${viewCycle.hijri_year} H`} title="Rundown pelaporan 4 minggu">
        <WeekStepper week={viewCycle.status === 'aktif' ? week : 5} />
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Panel
          eyebrow={`${belum.length} dari ${total} bagian`}
          title="Belum menginput softfile"
          actions={
            <Button variant="primary" icon={Download} onClick={() => setBelumOpen(true)}>
              Unduh / Salin Daftar Belum Lapor
            </Button>
          }
          bodyClass="p-0"
        >
          {belum.length === 0 ? (
            <Empty icon={ClipboardList} title="Seluruh bagian sudah melapor">Jazakumullah khairan untuk semua sekretaris bagian.</Empty>
          ) : (
            <ol className="max-h-[420px] divide-y divide-line overflow-y-auto">
              {belum.map((d) => {
                const st = reportState(null, viewCycle, today);
                return (
                  <li key={d.id} className="flex items-start justify-between gap-3 px-5 py-2.5 sm:items-center">
                    <div className="flex min-w-0 items-baseline gap-3">
                      <span className="w-6 shrink-0 text-right text-[12px] font-semibold text-muted tabular-nums">{d.no}</span>
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-ink sm:truncate">{d.nama}</p>
                        {isAdmin && <p className="text-[12px] text-muted sm:truncate">Ketua: {d.ketua_nama || '—'} · Sekretaris: {d.sekretaris_nama || '—'}</p>}
                      </div>
                    </div>
                    <StatusDot tone={STATE_META[st].tone} label={STATE_META[st].label} />
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>

        <Panel
          eyebrow="Masuk terakhir"
          title="Laporan terbaru"
          actions={
            isAdmin ? (
              <Button variant="ghost" icon={ArrowRight} onClick={() => go('laporan')}>
                Semua laporan
              </Button>
            ) : (
              <Button variant="ghost" icon={FileEdit} onClick={() => go('input')}>
                Input laporan
              </Button>
            )
          }
          bodyClass="p-0"
        >
          {latest.length === 0 ? (
            <Empty icon={Inbox} title="Belum ada laporan masuk">Laporan akan tampil di sini begitu sekretaris bagian menginput softfile.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {latest.map((r) => {
                const d = deptById.get(r.department_id);
                const st = reportState(r, viewCycle, today);
                const ung = (r.programs || []).filter((p) => p.kategori === 'unggulan').length;
                return (
                  <li key={r.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-ink sm:truncate">{d?.nama}</p>
                      <p className="text-[12px] text-muted tabular-nums">{formatTimestamp(r.submitted_at)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {ung > 0 && <Badge tone="brand" icon={Star}>{ung}</Badge>}
                      <Badge tone={STATE_META[st].tone}>{STATE_META[st].label}</Badge>
                      {isAdmin && (
                        <Button size="sm" variant="ghost" onClick={() => setCard({ report: r, department: d })}>
                          Kartu
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <BelumLaporModal open={belumOpen} onClose={() => setBelumOpen(false)} />
      <ReminderCardModal open={Boolean(card)} onClose={() => setCard(null)} report={card?.report} department={card?.department} cycle={viewCycle} />
    </div>
  );
}
