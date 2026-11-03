import React, { useMemo, useState } from 'react';
import { BellRing, Check, Copy, ListChecks, MessageCircle, Phone, Search, SkipForward, Zap } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import {
  buildReminderMessage, formatWa, planReminderQueue, REMINDER_POLICY, ROLE_LABEL, RUNDOWN, STAGES, waLink,
} from '../lib/constants.js';
import { reportState, STATE_META } from '../lib/status.js';
import { copyText } from '../lib/files.js';
import { PORTAL_URL } from '../lib/env.js';
import { Badge, Button, Callout, cx, Empty, Input, Modal, Panel, Segmented, Select, Textarea } from './ui.jsx';
import WeekStepper from './WeekStepper.jsx';

/** Modal konfirmasi sebelum kirim (human-in-the-loop). */
export function SendReminderModal({ item, onClose }) {
  const { departments, actions } = useStore();
  const [msg, setMsg] = useState(item?.message || '');
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  React.useEffect(() => {
    setMsg(item?.message || '');
    setOpened(false);
  }, [item]);
  if (!item) return null;
  const d = departments.find((x) => x.id === item.department_id);
  const name = item.target_role === 'ketua' ? d?.ketua_nama : d?.sekretaris_nama;
  const phone = item.phone || (item.target_role === 'ketua' ? d?.ketua_wa : d?.sekretaris_wa);

  const markSent = async () => {
    setBusy(true);
    try {
      await actions.markSent({ ...item, phone: phone || null, message: msg });
      onClose();
    } catch {
      /* toast sudah tampil */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow={`Minggu ${item.week} · ${ROLE_LABEL[item.target_role]} Bagian`}
      title={`Kirim pengingat ke ${d?.nama}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button icon={Copy} onClick={async () => actions.notify((await copyText(msg)) ? 'Pesan tersalin.' : 'Salin otomatis ditolak peramban.')}>Salin pesan</Button>
          <a
            href={waLink(phone, msg)}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpened(true)}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[#128C4A] px-3.5 text-sm font-semibold text-white hover:bg-[#0E7A40]"
          >
            <MessageCircle className="size-4" /> Buka WhatsApp
          </a>
          <Button variant={opened ? 'primary' : 'secondary'} icon={Check} busy={busy} onClick={markSent}>
            Tandai terkirim
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-line px-3.5 py-2.5">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">Penerima</p>
            <p className="text-[14px] font-semibold">{name || `${ROLE_LABEL[item.target_role]} (nama belum diisi)`}</p>
          </div>
          <div className="rounded-lg border border-line px-3.5 py-2.5">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">Nomor WhatsApp / telepon</p>
            {phone ? (
              <div className="flex items-center justify-between gap-2">
                <span className="select-all text-[14px] font-semibold tabular-nums">{formatWa(phone)}</span>
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" icon={Copy} aria-label="Salin nomor" onClick={async () => actions.notify((await copyText(formatWa(phone))) ? 'Nomor tersalin.' : 'Salin ditolak.')} />
                  <a href={`tel:+${phone}`} className="inline-flex h-8 items-center rounded-md px-2 text-navy hover:bg-sky-wash" aria-label="Telepon">
                    <Phone className="size-4" />
                  </a>
                </span>
              </div>
            ) : (
              <p className="text-[13px] text-amber-800">Belum diisi. WhatsApp akan meminta Anda memilih kontak.</p>
            )}
          </div>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Isi pesan (boleh disunting)</span>
          <Textarea id="reminder-message" rows={14} value={msg} onChange={(e) => setMsg(e.target.value)} className="font-sans text-[13px]" />
        </label>
        <Callout tone="info">
          Pesan tidak terkirim otomatis. Tinjau, buka WhatsApp, kirim dari ponsel/WhatsApp Web, lalu tekan <strong>Tandai terkirim</strong>.
        </Callout>
      </div>
    </Modal>
  );
}

export default function Rundown() {
  const {
    viewCycle, prevCycle, week, activeDepartments, reportByDept, prevReportByDept, targetsByDept, queue, today, actions, mode,
  } = useStore();
  const [sel, setSel] = useState(week);
  const [role, setRole] = useState('ketua');
  const [scope, setScope] = useState('kebijakan');
  const [q, setQ] = useState('');
  const [sending, setSending] = useState(null);
  const [busy, setBusy] = useState('');
  const policy = REMINDER_POLICY[sel];
  const billed = sel === 1 ? prevCycle : viewCycle;
  const billedMap = sel === 1 ? prevReportByDept : reportByDept;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return activeDepartments.filter((d) => {
      if (needle && !d.nama.toLowerCase().includes(needle)) return false;
      const sub = Boolean(billedMap.get(d.id)?.submitted_at);
      if (scope === 'belum') return !sub;
      if (scope === 'kebijakan') return policy.scope === 'semua' || !sub;
      return true;
    });
  }, [activeDepartments, billedMap, scope, policy, q]);

  const messageFor = (d, r) =>
    buildReminderMessage({
      week: sel, role: r, department: d, cycle: viewCycle, reportCycle: billed || viewCycle,
      reportSubmitted: Boolean(billedMap.get(d.id)?.submitted_at), programs: targetsByDept.get(d.id) || [], portalUrl: PORTAL_URL,
    });

  const prepareQueue = async () => {
    setBusy('queue');
    try {
      const items = planReminderQueue({
        week: sel, cycle: viewCycle, prevCycle, departments: activeDepartments, reportByDept, prevReportByDept, targetsByDept, today, portalUrl: PORTAL_URL,
      });
      if (!items.length) {
        actions.notify(sel === 1 && !prevCycle ? 'Belum ada laporan bulan lalu yang ditagih pada Minggu 1.' : 'Tidak ada bagian yang perlu diingatkan untuk minggu ini.');
        return;
      }
      const n = await actions.enqueue(items);
      actions.notify(n ? `${n} pengingat Minggu ${sel} masuk antrean.` : 'Antrean minggu ini sudah lengkap.');
    } finally {
      setBusy('');
    }
  };

  const pending = queue.filter((x) => x.status === 'pending').sort((a, b) => a.week - b.week);
  const sentCount = queue.filter((x) => x.status === 'sent').length;
  const deptName = (id) => activeDepartments.find((d) => d.id === id)?.nama || '—';

  return (
    <div className="flex flex-col gap-6">
      <Panel
        eyebrow="Pelacak tahapan"
        title="Rundown Pelaporan Bulanan Sektor Guru KMI"
        actions={
          viewCycle.status === 'aktif' && (
            <label className="flex items-center gap-2 whitespace-nowrap text-[13px] text-muted">
              Minggu aktif
              <Select
                id="active-week"
                className="h-8 w-auto py-0 text-[13px]"
                value={viewCycle.active_week || ''}
                onChange={(e) => actions.setCycleWeek(viewCycle.id, e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Otomatis dari tanggal</option>
                {RUNDOWN.map((r) => (
                  <option key={r.week} value={r.week}>Manual: {r.title}</option>
                ))}
              </Select>
            </label>
          )
        }
      >
        <p className="mb-3 text-[13px] text-muted">Pilih kartu minggu untuk menyiapkan pengingat sesuai agendanya.</p>
        <WeekStepper week={viewCycle.status === 'aktif' ? week : 5} selected={sel} onSelect={setSel} />
      </Panel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel
          eyebrow={`Pengingat ${RUNDOWN[sel - 1].title}`}
          title="Bagian & tahapan pelaporan"
          bodyClass="p-0"
          actions={
            <>
              <Segmented label="Penerima" value={role} onChange={setRole} options={[{ value: 'ketua', label: 'Ketua' }, { value: 'sekretaris', label: 'Sekretaris' }]} />
              <Select id="scope" className="h-8 w-auto py-0 text-[13px]" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Saring bagian">
                <option value="kebijakan">Perlu diingatkan</option>
                <option value="belum">Belum lapor</option>
                <option value="semua">Semua bagian</option>
              </Select>
            </>
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input id="rundown-search" className="h-9 pl-9" placeholder="Cari bagian" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <p className="text-[12.5px] text-muted">
              {sel === 1 ? (prevCycle ? 'Minggu 1 menagih laporan bulan lalu.' : 'Belum ada siklus bulan lalu.') : sel === 4 ? 'Minggu 4 menagih softfile bulan ini.' : 'Minggu ini fokus pelaksanaan & evaluasi program.'}
            </p>
          </div>
          {rows.length === 0 ? (
            <Empty icon={ListChecks} title="Tidak ada bagian pada saringan ini" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-[13px]">
                <thead className="bg-mist text-[11px] uppercase tracking-[0.08em] text-muted">
                  <tr>
                    <th className="px-5 py-2.5 font-semibold">Bagian</th>
                    <th className="px-2 py-2.5 font-semibold">Status</th>
                    {STAGES.map((s) => (
                      <th key={s.key} className="px-1.5 py-2.5 text-center font-semibold" title={s.label}>
                        <span className="block leading-tight">{s.short}</span>
                        <span className="font-normal normal-case tracking-normal">M{s.week}</span>
                      </th>
                    ))}
                    <th className="px-5 py-2.5 text-right font-semibold">Pengingat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((d) => {
                    const rep = reportByDept.get(d.id);
                    const st = reportState(rep, viewCycle, today);
                    const qd = queue.find((x) => x.department_id === d.id && x.week === sel && x.target_role === role);
                    return (
                      <tr key={d.id} className="align-middle">
                        <td className="px-5 py-2.5">
                          <p className="font-semibold text-ink">
                            <span className="mr-1.5 text-muted tabular-nums">{d.no}.</span>
                            {d.nama}
                          </p>
                          <p className="text-[12px] text-muted">
                            {ROLE_LABEL[role]}: {(role === 'ketua' ? d.ketua_nama : d.sekretaris_nama) || '—'}
                          </p>
                        </td>
                        <td className="px-2 py-2.5">
                          <Badge tone={STATE_META[st].tone}>{STATE_META[st].label}</Badge>
                        </td>
                        {STAGES.map((s) => {
                          const on = Boolean(rep?.[s.key]);
                          const locked = s.key === 'submitted_at' || !rep;
                          return (
                            <td key={s.key} className="px-1.5 py-2.5 text-center">
                              <input
                                type="checkbox"
                                className="size-4 accent-[#1D4ED8] disabled:opacity-60"
                                checked={on}
                                disabled={locked}
                                aria-label={`${s.label} — ${d.nama}`}
                                onChange={(e) => actions.setStage(rep, s.key, e.target.checked)}
                              />
                            </td>
                          );
                        })}
                        <td className="px-5 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {qd?.status === 'sent' && <Badge tone="ok" icon={Check}>terkirim</Badge>}
                            <Button
                              size="sm"
                              variant="wa"
                              icon={MessageCircle}
                              onClick={() => setSending(qd && qd.status !== 'sent' ? qd : { department_id: d.id, week: sel, target_role: role, phone: role === 'ketua' ? d.ketua_wa : d.sekretaris_wa, message: messageFor(d, role) })}
                            >
                              WA
                            </Button>
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

        <Panel
          eyebrow={`${pending.length} menunggu · ${sentCount} terkirim`}
          title="Antrean pengingat"
          bodyClass="p-0"
          actions={
            <Button size="sm" variant="primary" icon={BellRing} busy={busy === 'queue'} onClick={prepareQueue}>
              Siapkan Minggu {sel}
            </Button>
          }
        >
          <div className="flex flex-col gap-2 border-b border-line px-5 py-3 text-[12.5px] text-muted">
            <p>
              Kebijakan Minggu {sel}: {policy.roles.map((r) => ROLE_LABEL[r]).join(' & ')} ·{' '}
              {policy.scope === 'semua' ? 'seluruh bagian' : 'bagian yang belum lapor'}.
            </p>
            <p>
              {mode === 'supabase'
                ? 'pg_cron mengisi antrean ini otomatis setiap pergantian minggu pukul 06.05 WIB.'
                : 'Di produksi, pg_cron mengisi antrean ini otomatis setiap pergantian minggu pukul 06.05 WIB.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {actions.runCron && (
                <Button size="sm" icon={Zap} busy={busy === 'cron'} onClick={async () => {
                  setBusy('cron');
                  try {
                    const out = await actions.runCron(sel);
                    actions.notify(out?.queued != null ? `Edge Function menambahkan ${out.queued} pengingat.` : out?.skipped || 'Edge Function selesai.');
                  } finally { setBusy(''); }
                }}>
                  Jalankan Edge Function
                </Button>
              )}
              {pending.length > 0 && (
                <Button size="sm" variant="ghost" onClick={actions.clearQueue}>Kosongkan yang belum terkirim</Button>
              )}
            </div>
          </div>
          {pending.length === 0 ? (
            <Empty icon={BellRing} title="Antrean kosong">Tekan <strong>Siapkan Minggu {sel}</strong> untuk menyusun pesan sesuai agenda minggu tersebut.</Empty>
          ) : (
            <ul className="max-h-[560px] divide-y divide-line overflow-y-auto">
              {pending.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold text-ink">{deptName(it.department_id)}</p>
                    <p className="text-[12px] text-muted">
                      M{it.week} · {ROLE_LABEL[it.target_role]} · {it.phone ? formatWa(it.phone) : 'nomor kosong'}
                      {it.source === 'cron' && ' · otomatis'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" icon={SkipForward} aria-label="Lewati" title="Lewati" onClick={() => actions.setQueueStatus(it.id, 'skipped')} />
                    <Button size="sm" variant="wa" icon={MessageCircle} onClick={() => setSending(it)}>Tinjau</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {sending && <SendReminderModal item={sending} onClose={() => setSending(null)} />}
    </div>
  );
}
