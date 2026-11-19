import React, { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle, Building2, CheckCircle2, ChevronDown, Circle, Contact, Download, FileEdit, KeyRound, ListChecks, MessageSquare, Pencil, Repeat, Target,
} from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import {
  computeWeek, cycleLabel, cycleMonthName, daysBetween, deadlineText, kendalaCategory, nextMonthLabel, PROGRAM_CATEGORIES, programCategory, RUNDOWN, STAGES,
} from '../lib/constants.js';
import { cycleKey, formatTimestamp, inCollectionWindow, inputOpenText, isInputOpen, isoOfTimestamp } from '../lib/hijri.js';
import { reportState, STATE_META } from '../lib/status.js';
import { evalScore, evalStatus } from '../lib/evaluasi.js';
import { reportDocxBlob, reportDocxFilename } from '../lib/docx-report.js';
import { saveFile } from '../lib/files.js';
import { Badge, Button, Callout, cx, Empty, Field, Input, Panel, Progress, Select, Textarea } from './ui.jsx';
import BagianSetup from './BagianSetup.jsx';
import { formatWa } from '../lib/constants.js';

const CAT_COLOR = { unggulan: '#1E3A8A', inovasi: '#2563EB', tindak_lanjut: '#60A5FA', reguler: '#CBD5E1' };
const INK = '#0F172A';
const GRID = '#E2E8F0';

const shortMonth = (c) =>
  cycleMonthName(c)
    .replace('Jumadil ', 'Jum. ')
    .replace('Rabiul ', 'Rab. ')
    .replace("Dzulqa'dah", 'Dzulqa.')
    .replace('Dzulhijjah', 'Dzulh.');

function Stat({ label, value, sub, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-[14px] border border-line bg-white px-5 py-4">
      <span className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</span>
      <span className="font-serif text-[30px] font-semibold leading-none text-ink tabular-nums">{value}</span>
      {sub && <span className="text-[12.5px] text-muted">{sub}</span>}
      {children}
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-[12.5px] shadow-lg">
      <p className="mb-1 font-semibold text-ink">{label}</p>
      {payload.filter((p) => p.value).map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-ink">
          <span className="size-2.5 rounded-sm" style={{ background: p.color }} aria-hidden />
          {p.name}: <span className="font-semibold tabular-nums">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ headline rundown
function Headline({ cycle, report, today, go, canSubmit, owed }) {
  const collecting = inCollectionWindow(cycle, today) && !cycle.active_week;
  const open = isInputOpen(cycle, today);
  const week = computeWeek(cycle, today);
  const left = daysBetween(today, cycle.deadline_date);
  const month = cycleMonthName(cycle);
  const agenda = RUNDOWN[collecting ? 0 : week - 1];
  const sent = Boolean(report?.submitted_at);

  let title;
  let text;
  let urgent = false;
  if (sent) {
    title = `Laporan ${month} sudah terkirim`;
    text = `Softfile masuk ${formatTimestamp(report.submitted_at)}. ${
      collecting ? `Sekarang laksanakan program kerja ${nextMonthLabel(cycle)} dan pastikan hardfile sudah diserahkan ke Staf Sekretaris Wakil Pengasuh.` : `Perbaikan isi masih bisa dikirim ulang sampai ${deadlineText(cycle)}.`
    }`;
  } else if (collecting) {
    urgent = left <= 1;
    title = left > 0 ? `Kirim laporan ${month} · ${left} hari lagi` : left === 0 ? `Hari ini tenggat laporan ${month}` : `Laporan ${month} lewat tenggat`;
    text = `Tenggat ${deadlineText(cycle)}. Isi hasil usaha ${month}, kendala dan solusinya, program kerja ${nextMonthLabel(cycle)}, serta evaluasi program bulan lalu.`;
  } else if (week >= 3) {
    title = `${agenda.title} · saatnya menyusun laporan ${month}`;
    text = `Rapat bagian, draf ke Pembimbing Guru Senior, revisi disetujui Pembimbing Bagian, lalu softfile di portal paling lambat ${deadlineText(cycle)}.`;
  } else {
    title = `${agenda.title} · ${month} ${cycle.hijri_year} H`;
    text = `Laksanakan dan pantau program kerja ${month}. Laporan bulan ini dikumpulkan sampai ${deadlineText(cycle)}.`;
  }
  if (!sent && !open) text += cycle.input_closed_at ? ' Input bulan ini hanya bisa dilakukan admin.' : ` Input softfile dibuka ${inputOpenText(cycle)}.`;
  if (!sent && owed) text += ` Laporan ${cycleMonthName(owed)} ${owed.hijri_year} H harus terkirim dulu.`;

  return (
    <section
      className={cx(
        'overflow-hidden rounded-[16px] border text-white shadow-sm',
        sent ? 'border-emerald-700/30 bg-gradient-to-br from-[#064E3B] to-[#0F5132]' : urgent ? 'border-red-800/40 bg-gradient-to-br from-[#7F1D1D] to-[#1E3A8A]' : 'border-navy bg-gradient-to-br from-[#0F172A] to-[#1E3A8A]'
      )}
      aria-labelledby="bagian-headline"
    >
      <div className="flex flex-col gap-4 px-5 py-5 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-[62ch]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-100/85">
            Rundown · {collecting ? `Masa pengumpulan (Minggu Pertama ${nextMonthLabel(cycle).replace(/ \d+ H$/, '')})` : `${agenda.title} ${month}`}
          </p>
          <h3 id="bagian-headline" className="mt-1 font-serif text-[22px] font-semibold leading-snug text-balance sm:text-[26px]">
            {title}
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-blue-50/90">{text}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 lg:items-end">
          {!sent && (
            <span className={cx('inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1 text-[12.5px] font-bold tabular-nums lg:self-end', urgent ? 'bg-white text-red-800' : 'bg-white/15 text-white ring-1 ring-white/30')}>
              Tenggat {left > 0 ? `${left} hari lagi` : left === 0 ? 'hari ini' : `lewat ${-left} hari`}
            </span>
          )}
          {canSubmit && (open || owed) && (
            <Button variant="secondary" icon={FileEdit} onClick={() => go('input')} className="self-start lg:self-end">
              {owed && !sent ? `Isi laporan ${cycleMonthName(owed)} dulu` : sent ? 'Perbarui laporan' : 'Isi laporan'}
            </Button>
          )}
          {!sent && !open && (
            <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-white/15 px-3 py-1 text-[12.5px] font-semibold text-white ring-1 ring-white/30 lg:self-end">
              {cycle.input_closed_at ? 'Input hanya oleh admin' : `Input dibuka ${inputOpenText(cycle).replace(/ \(.*\)$/, '')}`}
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 border-t border-white/15 bg-black/10 px-5 py-4 sm:px-6 md:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-100/80">Agenda {agenda.title.toLowerCase()}</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-[13px] leading-snug text-blue-50/95">
            {agenda.items.map((it) => (
              <li key={it} className="flex gap-2">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-blue-200" aria-hidden />
                {it}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-100/80">Tahapan laporan {month}</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
            {STAGES.map((st) => {
              const at = report?.[st.key];
              return (
                <li key={st.key} className="flex items-start gap-2">
                  {at ? <CheckCircle2 className="mt-px size-4 shrink-0 text-emerald-300" aria-hidden /> : <Circle className="mt-px size-4 shrink-0 text-blue-200/60" aria-hidden />}
                  <span className={at ? 'text-white' : 'text-blue-100/75'}>
                    {st.label}
                    {at ? <span className="text-blue-100/70"> · {formatTimestamp(at)}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ catatan admin
function FeedbackEditor({ report }) {
  const { actions } = useStore();
  const [text, setText] = useState(report.catatan_admin || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => setText(report.catatan_admin || ''), [report.catatan_admin]);
  const save = async () => {
    setBusy(true);
    try {
      await actions.setReportFeedback(report, text);
    } catch {
      /* toast tampil */
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <Field label="Catatan Sektor Guru KMI untuk bagian">
        <Textarea id={`catatan-${report.id}`} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tanggapan, apresiasi, atau arahan untuk laporan ini. Tampil di dasbor bagian." />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" icon={MessageSquare} busy={busy} disabled={text.trim() === (report.catatan_admin || '').trim()} onClick={save}>
          Simpan catatan
        </Button>
        {report.catatan_admin_at && <span className="text-[12px] text-muted">Terakhir disimpan {formatTimestamp(report.catatan_admin_at)}</span>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ satu bulan di riwayat
function HistoryItem({ r, open, department, isAdmin, today, onDownload, busy, onRevise }) {
  const st = reportState(r, r.cycle, today);
  const score = evalScore(r.evaluasi_program);
  const sent = Boolean(r.submitted_at);
  return (
    <details open={open} className="group border-b border-line last:border-b-0">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-mist focus-visible:outline-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <p className="font-serif text-[16.5px] font-semibold text-ink">{cycleLabel(r.cycle)}</p>
          <p className="text-[12px] text-muted tabular-nums">
            {sent ? `Masuk ${formatTimestamp(r.submitted_at)}` : r.cycle.status === 'aktif' ? 'Belum dikirim' : 'Tidak ada softfile'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {score != null && <Badge tone="brand" icon={ListChecks}>Evaluasi {score}%</Badge>}
          {r.catatan_admin && <Badge tone="navy" icon={MessageSquare}>Catatan admin</Badge>}
          {r.direvisi_admin_at && <Badge tone="muted" icon={Pencil}>Direvisi admin</Badge>}
          <Badge tone={STATE_META[st].tone}>{STATE_META[st].label}</Badge>
          <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
        </div>
      </summary>

      <div className="flex flex-col gap-5 px-5 pb-5">
        {r.catatan_admin && !isAdmin && (
          <Callout tone="info" title="Catatan dari Sektor Guru KMI">
            <p className="whitespace-pre-line">{r.catatan_admin}</p>
            {r.catatan_admin_at && <p className="mt-1 text-[12px] opacity-75">{formatTimestamp(r.catatan_admin_at)}</p>}
          </Callout>
        )}

        {!sent ? (
          <p className="text-[13.5px] text-muted">Laporan bulan ini belum dikirim lewat portal.</p>
        ) : (
          <div className="grid grid-cols-1 gap-x-8 gap-y-5 lg:grid-cols-2">
            {r.evaluasi_program?.length > 0 && (
              <section className="lg:col-span-2">
                <h4 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-brand">Evaluasi program {cycleMonthName(r.cycle)}</h4>
                <ul className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                  {r.evaluasi_program.map((e, i) => {
                    const s = evalStatus(e.status);
                    return (
                      <li key={`${e.judul}-${i}`} className="flex flex-col gap-1 rounded-lg border border-line px-3 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[13.5px] font-semibold leading-snug text-ink">
                            <span aria-hidden>{programCategory(e.kategori)?.emoji}</span> {e.judul}
                          </span>
                          {s && <Badge tone={s.tone}>{s.label}</Badge>}
                        </div>
                        {(e.target || e.catatan) && (
                          <span className="text-[12.5px] text-muted">
                            {e.target ? `Target ${e.target}` : ''}
                            {e.target && e.catatan ? ' · ' : ''}
                            {e.catatan || ''}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            <section>
              <h4 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-brand">I · Hasil usaha</h4>
              <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-[13.5px] leading-relaxed text-ink">
                {(r.hasil_usaha || []).map((h, i) => <li key={i}>{h}</li>)}
              </ol>
            </section>
            <section>
              <h4 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-brand">IV · Program kerja {nextMonthLabel(r.cycle)}</h4>
              <ul className="mt-2 flex flex-col gap-1.5 text-[13.5px] leading-relaxed text-ink">
                {(r.programs || []).map((p) => (
                  <li key={p.id || p.judul} className="flex gap-2">
                    <span aria-hidden>{programCategory(p.kategori)?.emoji}</span>
                    <span>
                      {p.judul}
                      {p.target ? <span className="text-muted"> · target {p.target}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h4 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-brand">II · Kendala</h4>
              {(r.kendala || []).length ? (
                <ul className="mt-2 flex flex-col gap-1.5 text-[13.5px] leading-relaxed text-ink">
                  {r.kendala.map((k, i) => (
                    <li key={i}>
                      <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-px text-[11.5px] font-semibold text-slate-700">{kendalaCategory(k.kategori)?.label || 'Lainnya'}</span>
                      {k.teks}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[13px] text-muted">Tidak ada kendala dilaporkan.</p>
              )}
            </section>
            <section>
              <h4 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-brand">III · Solusi</h4>
              {(r.solusi || []).length ? (
                <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[13.5px] leading-relaxed text-ink">
                  {r.solusi.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              ) : (
                <p className="mt-2 text-[13px] text-muted">—</p>
              )}
            </section>
          </div>
        )}

        {isAdmin && <FeedbackEditor report={r} />}

        {sent && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={Download} busy={busy} onClick={() => onDownload(r)}>
              Unduh berkas Word resmi
            </Button>
            {isAdmin && onRevise && (
              <Button size="sm" variant="primary" icon={FileEdit} onClick={() => onRevise(r)}>
                Revisi / rapikan laporan
              </Button>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

// ------------------------------------------------------------------ ganti sandi
function PasswordPanel() {
  const { actions } = useStore();
  const [f, setF] = useState({ now: '', next: '', again: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (f.next.trim().length < 6) return actions.notify('Kode baru minimal 6 karakter.', 'error');
    if (f.next.trim().toUpperCase() !== f.again.trim().toUpperCase()) return actions.notify('Kedua kode baru tidak sama.', 'error');
    setBusy(true);
    try {
      await actions.bagianChangePassword(f.now, f.next);
      setF({ now: '', next: '', again: '' });
    } catch {
      /* toast tampil */
    } finally {
      setBusy(false);
    }
    return undefined;
  };
  return (
    <Panel eyebrow="Keamanan akun bagian" title="Ganti kode akses">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-[13px] leading-relaxed text-muted">
          Kode ini dipakai untuk masuk dan untuk formulir tanpa masuk. Kode tercatat di data admin Sektor Guru KMI agar bisa dibantu bila lupa, jadi jangan memakai kata sandi pribadi. Perangkat lain yang memakai akun ini akan keluar. Huruf besar dan kecil tidak dibedakan.
        </p>
        <div className="grid grid-cols-1 gap-3">
          <Field label="Kode sekarang">
            <Input id="bpw-now" type="password" autoComplete="current-password" required value={f.now} onChange={(e) => setF((x) => ({ ...x, now: e.target.value }))} />
          </Field>
          <Field label="Kode baru (min. 6)">
            <Input id="bpw-new" type="password" autoComplete="new-password" required value={f.next} onChange={(e) => setF((x) => ({ ...x, next: e.target.value }))} />
          </Field>
          <Field label="Ulangi kode baru">
            <Input id="bpw-again" type="password" autoComplete="new-password" required value={f.again} onChange={(e) => setF((x) => ({ ...x, again: e.target.value }))} />
          </Field>
        </div>
        <div>
          <Button type="submit" icon={KeyRound} busy={busy}>Simpan kode baru</Button>
        </div>
      </form>
    </Panel>
  );
}

// ------------------------------------------------------------------ kontak bagian
function ContactPanel({ dept, canEdit, isAdmin }) {
  const [edit, setEdit] = useState(false);
  const rows = [
    ['Ketua', dept.ketua_nama, dept.ketua_wa],
    ['Sekretaris', dept.sekretaris_nama, dept.sekretaris_wa],
    ['Pembimbing', dept.pembimbing_nama, null],
  ];
  return (
    <Panel
      eyebrow={dept.profil_at ? `Diperbarui ${formatTimestamp(dept.profil_at)}` : 'Belum dilengkapi bagian'}
      title="Kontak bagian"
      actions={canEdit ? <Button size="sm" icon={Pencil} onClick={() => setEdit(true)}>Ubah kontak</Button> : null}
    >
      <ul className="flex flex-col divide-y divide-line">
        {rows.map(([role, nama, wa]) => (
          <li key={role} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 first:pt-0 last:pb-0">
            <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{role}</span>
            <span className="min-w-0 text-right text-[14px] text-ink">
              <span className="font-semibold">{nama || '—'}</span>
              {role !== 'Pembimbing' && <span className="block text-[12.5px] text-muted tabular-nums">{wa ? formatWa(wa) : 'WA belum diisi'}</span>}
            </span>
          </li>
        ))}
      </ul>
      {isAdmin && dept.kode_pribadi_at && <p className="mt-3 text-[12.5px] text-muted">Bagian membuat kode sendiri {formatTimestamp(dept.kode_pribadi_at)}.</p>}
      {edit && <BagianSetup open mode="edit" onClose={() => setEdit(false)} />}
    </Panel>
  );
}

// ------------------------------------------------------------------ halaman
export default function BagianDashboard({ go }) {
  const { bagian, isAdmin, activeDepartments, cycles, periods, activeCycle, today, actions, departmentData, dashboardDeptId } = useStore();
  const ownId = bagian?.department.id || null;
  const deptId = isAdmin ? dashboardDeptId || ownId || activeDepartments[0]?.id : ownId;
  const data = deptId ? departmentData[deptId] : null;
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  // Muat ulang bila data bagian belum ada (pertama kali, setelah login pertama, atau setelah disegarkan).
  useEffect(() => {
    if (!deptId || data) return;
    setErr('');
    actions.loadDepartmentData(deptId).catch((e) => setErr(e.message || String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptId, data, bagian?.perlu_setup]);

  const cycById = useMemo(() => new Map(cycles.map((c) => [c.id, c])), [cycles]);
  const reports = useMemo(
    () =>
      (data?.reports || [])
        .map((r) => ({ ...r, cycle: cycById.get(r.cycle_id) }))
        .filter((r) => r.cycle)
        .sort((a, b) => b.cycle.start_date.localeCompare(a.cycle.start_date)),
    [data, cycById]
  );

  const stats = useMemo(() => {
    const submitted = reports.filter((r) => r.submitted_at);
    const due = reports.filter((r) => r.submitted_at || today > r.cycle.deadline_date);
    const onTime = submitted.filter((r) => isoOfTimestamp(r.submitted_at) <= r.cycle.deadline_date);
    const evals = submitted.flatMap((r) => r.evaluasi_program || []);
    const programs = submitted.flatMap((r) => r.programs || []);
    const recurring = new Map();
    for (const r of submitted) {
      for (const k of r.kendala || []) {
        const key = k.kategori || 'lainnya';
        const e = recurring.get(key) || { key, months: new Set(), latest: null };
        e.months.add(r.cycle_id);
        if (!e.latest) e.latest = { teks: k.teks, cycle: r.cycle };
        recurring.set(key, e);
      }
    }
    return {
      submitted,
      due,
      onTime,
      evalPct: evalScore(evals),
      evalCount: evals.length,
      programs,
      highlight: programs.filter((p) => p.kategori === 'unggulan' || p.kategori === 'inovasi').length,
      recurring: [...recurring.values()].filter((e) => e.months.size >= 2).sort((a, b) => b.months.size - a.months.size),
      latest: submitted[0] || null,
    };
  }, [reports, today]);

  const chart = useMemo(
    () =>
      [...reports]
        .reverse()
        .slice(-6)
        .map((r) => {
          const row = { name: shortMonth(r.cycle) };
          for (const c of PROGRAM_CATEGORIES) row[c.key] = (r.programs || []).filter((p) => p.kategori === c.key).length;
          return row;
        }),
    [reports]
  );

  if (!deptId) {
    return (
      <Empty icon={Building2} title="Masuk sebagai bagian untuk melihat dasbor">
        Pilih nama bagian dan ketik sandinya (sandi awal = kode akses dari admin).
      </Empty>
    );
  }

  const dept = data?.department || activeDepartments.find((d) => d.id === deptId) || {};
  const current = activeCycle ? reports.find((r) => r.cycle_id === activeCycle.id) : null;
  // Bulan sebelumnya yang sudah dibuka tetapi belum terkirim (urut dari yang terlama).
  const owed = activeCycle
    ? reports
        .filter((r) => !r.submitted_at && isInputOpen(r.cycle, today) && cycleKey(r.cycle) < cycleKey(activeCycle))
        .map((r) => r.cycle)
        .sort((a, b) => cycleKey(a) - cycleKey(b))
    : [];
  const viewingOwn = Boolean(ownId) && ownId === deptId;

  const download = async (r) => {
    setBusy(r.id);
    try {
      const period = periods.find((p) => p.id === r.cycle.period_id);
      const department = { ...dept, nama: dept.nama, no: dept.no };
      const res = await saveFile(reportDocxFilename({ department, cycle: r.cycle }), await reportDocxBlob({ report: r, department, cycle: r.cycle, period }));
      if (res === 'saved') actions.notify('Berkas Word resmi siap diunduh.');
    } catch (e) {
      actions.notify(e.message || 'Gagal membuat berkas.', 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
            Dasbor bagian{dept.no ? ` · nomor ${dept.no} dari ${activeDepartments.length}` : ''}
          </p>
          <h2 className="font-serif text-[26px] font-semibold leading-tight text-ink text-balance sm:text-[30px]">{dept.nama || 'Memuat…'}</h2>
          <p className="mt-1 text-[13px] text-muted">
            Ketua: {dept.ketua_nama || '—'} · Sekretaris: {dept.sekretaris_nama || '—'} · Pembimbing: {dept.pembimbing_nama || '—'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <label className="flex min-w-0 items-center gap-2">
              <span className="sr-only">Pilih bagian</span>
              <Select id="dash-dept" className="h-9 w-auto min-w-0 max-w-[280px] text-[13.5px]" value={deptId} onChange={(e) => actions.setDashboardDeptId(e.target.value)}>
                {activeDepartments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.no}. {d.nama}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </div>
      </div>

      {err && <Callout tone="error">{err}</Callout>}

      {owed.length > 0 && (
        <Callout tone="warn" title={`Laporan ${owed.map((c) => cycleLabel(c)).join(', ')} belum terkirim`}>
          Laporan diisi berurutan: laporan {cycleMonthName(activeCycle)} baru bisa dikirim setelah laporan {owed.map((c) => cycleMonthName(c)).join(' dan ')} masuk.
          Buka Input Laporan; formulir otomatis membuka bulan yang tertunggak (tercatat terlambat bila lewat tenggat).
          {(viewingOwn || isAdmin) && (
            <div className="mt-2">
              <Button size="sm" variant="primary" icon={FileEdit} onClick={() => go('input')}>Isi laporan {cycleMonthName(owed[0])}</Button>
            </div>
          )}
        </Callout>
      )}

      {activeCycle && <Headline cycle={activeCycle} report={current} today={today} go={go} canSubmit={viewingOwn || isAdmin} owed={owed[0] || null} />}

      {!data && !err ? (
        <p className="animate-pulse text-[14px] text-muted">Memuat data bagian…</p>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Laporan terkirim" value={<>{stats.submitted.length}<span className="text-[18px] text-muted">/{stats.due.length || reports.length}</span></>}>
              <Progress value={stats.submitted.length} max={stats.due.length || reports.length || 1} className="mt-1" />
            </Stat>
            <Stat
              label="Tepat waktu"
              value={stats.submitted.length ? `${Math.round((stats.onTime.length / stats.submitted.length) * 100)}%` : '—'}
              sub={stats.submitted.length ? `${stats.onTime.length} dari ${stats.submitted.length} laporan sebelum tenggat` : 'belum ada laporan'}
            />
            <Stat
              label="Keterlaksanaan program"
              value={stats.evalPct == null ? '—' : `${stats.evalPct}%`}
              sub={stats.evalCount ? `dari ${stats.evalCount} program yang dievaluasi` : 'diisi saat laporan bulan berikutnya'}
            />
            <Stat label="Unggulan & inovasi" value={stats.highlight} sub={`dari ${stats.programs.length} program kerja`} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.15fr_1fr]">
            <Panel
              eyebrow={stats.latest ? `Dari laporan ${cycleLabel(stats.latest.cycle)}` : 'Program kerja'}
              title={stats.latest ? `Program kerja ${nextMonthLabel(stats.latest.cycle)}` : 'Belum ada program kerja'}
            >
              {stats.latest ? (
                <>
                  <ul className="flex flex-col divide-y divide-line">
                    {(stats.latest.programs || []).map((p) => {
                      const c = programCategory(p.kategori);
                      return (
                        <li key={p.id || p.judul} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                          <span className="min-w-0 text-[14px] leading-snug text-ink">
                            <span aria-hidden>{c?.emoji}</span> <span className="font-semibold">{p.judul}</span>
                            {p.target ? <span className="text-muted"> · target {p.target}</span> : null}
                          </span>
                          <Badge tone={p.kategori === 'unggulan' ? 'navy' : 'brand'}>{c?.short}</Badge>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-muted">
                    <Target className="size-3.5" aria-hidden /> Dievaluasi saat mengisi laporan {nextMonthLabel(stats.latest.cycle)}.
                  </p>
                </>
              ) : (
                <p className="text-[13.5px] text-muted">Program kerja tampil di sini setelah bagian mengirim laporan pertama.</p>
              )}
            </Panel>

            <Panel eyebrow="Kendala berulang" title="Masalah yang muncul lebih dari sebulan">
              {stats.recurring.length ? (
                <ul className="flex flex-col gap-3">
                  {stats.recurring.map((e) => (
                    <li key={e.key} className="flex gap-3">
                      <Repeat className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-ink">
                          {kendalaCategory(e.key)?.label || 'Lainnya'} <span className="font-normal text-muted">· {e.months.size} bulan</span>
                        </p>
                        <p className="text-[13px] leading-snug text-muted">
                          Terakhir ({cycleMonthName(e.latest.cycle)}): {e.latest.teks}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-start gap-2 text-[13.5px] text-muted">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                  Belum ada kategori kendala yang muncul di dua bulan atau lebih.
                </p>
              )}
              {stats.evalCount > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Program belum terlaksana</p>
                  {(() => {
                    const pending = stats.submitted.flatMap((r) => (r.evaluasi_program || []).filter((x) => x.status !== 'terlaksana').map((x) => ({ ...x, cycle: r.cycle })));
                    return pending.length ? (
                      <ul className="mt-2 flex flex-col gap-1.5 text-[13px] text-ink">
                        {pending.slice(0, 5).map((x, i) => (
                          <li key={`${x.judul}-${i}`} className="flex items-start gap-2">
                            <AlertTriangle className={cx('mt-0.5 size-3.5 shrink-0', x.status === 'belum' ? 'text-red-600' : 'text-amber-600')} aria-hidden />
                            <span>
                              {x.judul} <span className="text-muted">· {evalStatus(x.status)?.label.toLowerCase()} di {cycleMonthName(x.cycle)}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-[13px] text-muted">Semua program yang dievaluasi sudah terlaksana.</p>
                    );
                  })()}
                </div>
              )}
            </Panel>
          </div>

          {chart.some((row) => PROGRAM_CATEGORIES.some((c) => row[c.key])) && (
            <Panel eyebrow="6 bulan terakhir" title="Program kerja per bulan menurut klasifikasi">
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="name" tick={{ fill: INK, fontSize: 12 }} axisLine={{ stroke: '#CBD5E1' }} tickLine={false} interval={0} />
                    <YAxis allowDecimals={false} tick={{ fill: '#5B6478', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: '#F1F5F9' }} />
                    <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                    {PROGRAM_CATEGORIES.map((c, i) => (
                      <Bar key={c.key} dataKey={c.key} name={c.short} stackId="p" fill={CAT_COLOR[c.key]} maxBarSize={48} radius={i === PROGRAM_CATEGORIES.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          )}

          <Panel eyebrow={`${reports.length} bulan tercatat`} title="Riwayat laporan" bodyClass="p-0">
            {reports.length ? (
              reports.map((r, i) => (
                <HistoryItem
                  key={r.id}
                  r={r}
                  open={i === 0}
                  department={dept}
                  isAdmin={isAdmin}
                  today={today}
                  onDownload={download}
                  busy={busy === r.id}
                  onRevise={(rep) => {
                    actions.startRevision(rep.cycle_id, rep.department_id);
                    go('input');
                  }}
                />
              ))
            ) : (
              <Empty title="Belum ada laporan">Riwayat tampil setelah periode laporan dibuka.</Empty>
            )}
          </Panel>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ContactPanel dept={dept} canEdit={viewingOwn && !isAdmin} isAdmin={isAdmin} />
            {viewingOwn && !isAdmin && <PasswordPanel />}
          </div>
        </>
      ) : null}
    </div>
  );
}
