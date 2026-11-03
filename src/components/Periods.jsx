import React, { useEffect, useMemo, useState } from 'react';
import { Archive, CalendarPlus, CalendarRange, CheckCircle2, Eye, Plus, RefreshCw } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { cycleLabel, deadlineText, formatGregorian, HIJRI_MONTHS, nextHijriMonth } from '../lib/constants.js';
import { academicYearFor, hijriMonthRange, masehiLabelFor, nextAcademicLabels, toHijri } from '../lib/hijri.js';
import { Badge, Button, Callout, Empty, Field, Input, Modal, Panel, Select } from './ui.jsx';

export function OpenCycleModal({ open, onClose }) {
  const { cycles, periods, activeCycle, activeDepartments, today, actions, reportByDept } = useStore();
  const suggestion = useMemo(() => {
    const latest = [...cycles].sort((a, b) => b.hijri_year - a.hijri_year || b.hijri_month - a.hijri_month)[0];
    if (latest) return nextHijriMonth(latest.hijri_month, latest.hijri_year);
    const h = toHijri(today);
    return { month: h.month, year: h.year };
  }, [cycles, today]);
  const [month, setMonth] = useState(suggestion.month);
  const [year, setYear] = useState(suggestion.year);
  const [dates, setDates] = useState(() => hijriMonthRange(suggestion.month, suggestion.year));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMonth(suggestion.month);
      setYear(suggestion.year);
    }
  }, [open, suggestion.month, suggestion.year]);
  useEffect(() => {
    if (month && year > 1400) setDates(hijriMonthRange(Number(month), Number(year)));
  }, [month, year]);

  if (!open) return null;
  const ta = academicYearFor(Number(month), Number(year));
  const period = periods.find((p) => p.label_hijri === ta.label_hijri);
  const exists = cycles.some((c) => c.hijri_month === Number(month) && c.hijri_year === Number(year));
  const pending = activeCycle ? activeDepartments.filter((d) => !reportByDept.get(d.id)?.submitted_at).length : 0;
  const masehi = masehiLabelFor(dates.start, dates.end);
  const valid = !exists && dates.start && dates.end && dates.deadline && dates.deadline > dates.end && dates.end >= dates.start;

  const confirm = async () => {
    setBusy(true);
    try {
      let periodId = period?.id;
      if (!periodId) periodId = (await actions.createPeriod(ta)).id;
      await actions.openCycle({
        period_id: periodId,
        hijri_month: Number(month),
        hijri_year: Number(year),
        masehi_label: masehi,
        start_date: dates.start,
        end_date: dates.end,
        deadline_date: dates.deadline,
      });
      onClose();
    } catch {
      /* toast tampil */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow="Buka Periode Bulan / Tahun Baru"
      title={`${HIJRI_MONTHS[month - 1]} ${year} H / ${masehi} M`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button variant="primary" icon={RefreshCw} busy={busy} disabled={!valid} onClick={confirm}>
            Buka periode & reset 48 status
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Bulan Hijriah">
            <Select id="oc-month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {HIJRI_MONTHS.map((m, i) => <option key={m} value={i + 1}>{i + 1}. {m}</option>)}
            </Select>
          </Field>
          <Field label="Tahun Hijriah">
            <Input id="oc-year" type="number" min={1440} max={1600} value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </Field>
          <Field label="Mulai (1 bulan Hijriah)" hint={formatGregorian(dates.start, true)}>
            <Input id="oc-start" type="date" value={dates.start} onChange={(e) => setDates((d) => ({ ...d, start: e.target.value }))} />
          </Field>
          <Field label="Akhir bulan" hint={formatGregorian(dates.end, true)}>
            <Input id="oc-end" type="date" value={dates.end} onChange={(e) => setDates((d) => ({ ...d, end: e.target.value }))} />
          </Field>
          <Field label="Tenggat (tanggal 5 bulan berikutnya)" hint={formatGregorian(dates.deadline, true)} className="sm:col-span-2">
            <Input id="oc-deadline" type="date" value={dates.deadline} onChange={(e) => setDates((d) => ({ ...d, deadline: e.target.value }))} />
          </Field>
        </div>
        <p className="text-[12.5px] text-muted">
          Tanggal dihitung dari kalender Umm al-Qura dan dapat disesuaikan dengan penetapan awal bulan Kemenag/pondok.
        </p>
        {exists ? (
          <Callout tone="error">Periode {HIJRI_MONTHS[month - 1]} {year} H sudah pernah dibuka. Pilih bulan lain.</Callout>
        ) : (
          <Callout tone="info" title="Yang terjadi saat periode dibuka">
            <ul className="list-disc pl-4">
              <li>Tahun ajaran: {ta.label_masehi} / {ta.label_hijri}{period ? '' : ' (akan dibuat otomatis)'}.</li>
              {activeCycle && <li>{cycleLabel(activeCycle)} diarsipkan; {pending} bagian yang belum lapor masih bisa mengirim sampai {deadlineText(activeCycle)}.</li>}
              <li>{activeDepartments.length} status pelaporan baru dibuat dengan status belum lapor.</li>
              <li>Rundown minggu 1–4 dihitung ulang dari tanggal mulai.</li>
            </ul>
          </Callout>
        )}
      </div>
    </Modal>
  );
}

export default function Periods({ onOpenCycle }) {
  const { periods, cycles, viewCycle, reportsByCycle, actions, loadReports } = useStore();
  const latestPeriod = [...periods].sort((a, b) => b.label_hijri.localeCompare(a.label_hijri))[0];
  const [next, setNext] = useState(() => (latestPeriod ? nextAcademicLabels(latestPeriod) : { label_masehi: '2026-2027', label_hijri: '1447-1448' }));
  const [editDates, setEditDates] = useState(null);

  useEffect(() => {
    cycles.forEach((c) => loadReports(c.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycles.length]);
  useEffect(() => {
    if (latestPeriod) setNext(nextAcademicLabels(latestPeriod));
  }, [latestPeriod?.id]);

  const sortedPeriods = [...periods].sort((a, b) => b.label_hijri.localeCompare(a.label_hijri));
  const validNext = /^\d{4}-\d{4}$/.test(next.label_masehi) && /^\d{4}-\d{4}$/.test(next.label_hijri) && !periods.some((p) => p.label_hijri === next.label_hijri);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <Panel eyebrow="Lintas tahun, tanpa batas periode" title="Tahun ajaran">
        <ul className="flex flex-col gap-2">
          {sortedPeriods.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3.5 py-2.5">
              <div>
                <p className="font-serif text-[16px] font-semibold text-ink tabular-nums">{p.label_masehi}</p>
                <p className="text-[12.5px] text-muted tabular-nums">{p.label_hijri} H</p>
              </div>
              {p.is_active ? (
                <Badge tone="ok" icon={CheckCircle2}>aktif</Badge>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => actions.activatePeriod(p.id)}>Aktifkan</Button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
          <p className="text-[13px] font-semibold text-ink">Tambah tahun ajaran</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Masehi"><Input id="np-m" value={next.label_masehi} onChange={(e) => setNext((x) => ({ ...x, label_masehi: e.target.value }))} /></Field>
            <Field label="Hijriah"><Input id="np-h" value={next.label_hijri} onChange={(e) => setNext((x) => ({ ...x, label_hijri: e.target.value }))} /></Field>
          </div>
          <Button icon={Plus} disabled={!validNext} onClick={() => actions.createPeriod(next)}>
            Tambah {next.label_masehi} / {next.label_hijri}
          </Button>
        </div>
      </Panel>

      <Panel
        eyebrow={`${cycles.length} siklus tercatat`}
        title="Siklus bulanan & arsip"
        bodyClass="p-0"
        actions={<Button variant="primary" icon={CalendarPlus} onClick={onOpenCycle}>Buka Periode Bulan Baru</Button>}
      >
        {cycles.length === 0 ? (
          <Empty icon={CalendarRange} title="Belum ada siklus" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="bg-mist text-[11px] uppercase tracking-[0.08em] text-muted">
                <tr>
                  <th className="py-2.5 pl-5 pr-3 font-semibold">Bulan</th>
                  <th className="px-3 py-2.5 font-semibold">Rentang Masehi</th>
                  <th className="px-3 py-2.5 font-semibold">Tenggat</th>
                  <th className="px-3 py-2.5 font-semibold">Masuk</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="py-2.5 pl-3 pr-5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {cycles.map((c) => {
                  const reps = reportsByCycle[c.id];
                  const n = reps ? reps.filter((r) => r.submitted_at).length : null;
                  return (
                    <tr key={c.id} className={c.id === viewCycle?.id ? 'bg-sky-wash/60' : ''}>
                      <td className="py-2.5 pl-5 pr-3 font-semibold text-ink">{cycleLabel(c)}</td>
                      <td className="px-3 py-2.5 text-muted tabular-nums">{formatGregorian(c.start_date)} – {formatGregorian(c.end_date)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatGregorian(c.deadline_date)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{n == null ? '…' : `${n}/${reps.length}`}</td>
                      <td className="px-3 py-2.5">{c.status === 'aktif' ? <Badge tone="ok">aktif</Badge> : <Badge icon={Archive}>arsip</Badge>}</td>
                      <td className="py-2.5 pl-3 pr-5 text-right">
                        <div className="flex justify-end gap-1">
                          {c.status === 'aktif' && <Button size="sm" variant="ghost" onClick={() => setEditDates({ ...c })}>Ubah tanggal</Button>}
                          <Button size="sm" variant="ghost" icon={Eye} onClick={() => actions.setViewCycleId(c.id)}>Lihat</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {editDates && (
        <Modal
          open
          onClose={() => setEditDates(null)}
          eyebrow="Sesuaikan dengan penetapan awal bulan"
          title={cycleLabel(editDates)}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditDates(null)}>Batal</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  await actions.updateCycleDates(editDates.id, {
                    start_date: editDates.start_date, end_date: editDates.end_date, deadline_date: editDates.deadline_date,
                    masehi_label: masehiLabelFor(editDates.start_date, editDates.end_date),
                  });
                  setEditDates(null);
                }}
              >
                Simpan tanggal
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            {[['start_date', 'Mulai'], ['end_date', 'Akhir'], ['deadline_date', 'Tenggat (tgl 5)']].map(([k, l]) => (
              <Field key={k} label={l} hint={formatGregorian(editDates[k], true)}>
                <Input id={`ed-${k}`} type="date" value={editDates[k]} onChange={(e) => setEditDates((x) => ({ ...x, [k]: e.target.value }))} />
              </Field>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
