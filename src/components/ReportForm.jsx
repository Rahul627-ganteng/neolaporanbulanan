import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Key, ListChecks, Lock, Plus, RotateCcw, Send, ShieldCheck, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { cycleLabel, cycleMonthName, deadlineText, KENDALA_CATEGORIES, nextMonthLabel, PROGRAM_CATEGORIES, programCategory } from '../lib/constants.js';
import { EVAL_STATUS } from '../lib/evaluasi.js';
import { cycleKey, formatTimestamp, inputOpenText, isInputOpen } from '../lib/hijri.js';
import { tidyReport } from '../lib/tidy.js';
import { routineHits, toPayload, validateReport } from '../lib/validation.js';
import { Button, Callout, cx, Field, Input, Panel, Select, Textarea } from './ui.jsx';
import { ReminderCardModal } from './ReminderCard.jsx';
import NameCombobox from './NameCombobox.jsx';
import PembimbingField from './PembimbingField.jsx';

const emptyForm = (cycleId = '') => ({
  cycle_id: cycleId,
  department_id: '',
  access_code: '',
  sekretaris_nama: '',
  ketua_nama: '',
  pembimbing_nama: '',
  hasil_usaha: [''],
  kendala: [{ teks: '', kategori: 'sdm' }],
  solusi: [''],
  programs: [{ judul: '', kategori: 'unggulan', target: '' }],
  pernyataan_inovatif: false,
  evaluasi: [],
});

const SAMPLE = {
  hasil_usaha: [
    'Merintis kelas tahsin pagi untuk 32 santri kelas 1 dengan ujian kenaikan level; 21 santri naik ke level berikutnya.',
    'Membuat lembar monitoring program kerja bersama Pembimbing sehingga evaluasi pekanan tercatat rapi.',
  ],
  kendala: [{ teks: 'Jadwal pembina bentrok dengan kegiatan kepanitiaan pekan ujian.', kategori: 'waktu' }],
  solusi: ['Memindahkan sesi ke ba\'da Subuh dan menunjuk pembina cadangan.'],
  programs: [
    { judul: 'Wisuda tahsin level dasar', kategori: 'unggulan', target: '25 santri' },
    { judul: 'Rekap monitoring digital', kategori: 'inovasi', target: '4 rekap' },
    { judul: 'Jadwal pembina cadangan', kategori: 'tindak_lanjut', target: '' },
  ],
};

function SectionTitle({ n, title, children }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-3">
        <span className="font-serif text-[15px] font-semibold text-brand tabular-nums">{n}</span>
        <h3 className="font-serif text-[18px] font-semibold text-ink">{title}</h3>
      </div>
      {children && <p className="pl-7 text-[13px] leading-relaxed text-muted">{children}</p>}
    </div>
  );
}

function StringList({ idPrefix, items, onChange, placeholder, renderExtra, addLabel }) {
  const set = (i, v) => onChange(items.map((x, j) => (j === i ? v : x)));
  return (
    <div className="flex flex-col gap-2.5 pl-0 sm:pl-7">
      {items.map((v, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="flex items-start gap-2">
            <span className="mt-2.5 w-5 shrink-0 text-right text-[13px] font-semibold text-muted tabular-nums">{i + 1}.</span>
            <Textarea id={`${idPrefix}-${i}`} rows={2} value={v} placeholder={placeholder} onChange={(e) => set(i, e.target.value)} />
            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              className="mt-1"
              aria-label={`Hapus butir ${i + 1}`}
              disabled={items.length === 1}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            />
          </div>
          {renderExtra?.(v, i)}
        </div>
      ))}
      <div className="pl-7">
        <Button size="sm" variant="ghost" icon={Plus} onClick={() => onChange([...items, ''])}>
          {addLabel}
        </Button>
      </div>
    </div>
  );
}

export default function ReportForm({ go }) {
  const { cycles, activeCycle, viewCycle, activeDepartments, departments, reportsByCycle, isAdmin, mode, today, actions, loadReports, bagian, departmentData, teachers, pembimbingOptions, revisionTarget } = useStore();
  // Masuk sebagai bagian: bagian terkunci, kode akses diganti token sesi.
  const asBagian = Boolean(bagian) && !isAdmin;
  const ownId = asBagian ? bagian.department.id : null;
  const ownData = ownId ? departmentData[ownId] : null;

  const defaultCycle = (activeCycle || viewCycle)?.id || '';

  const [form, setForm] = useState(() => emptyForm(defaultCycle));
  // Bulan yang sudah dibuka tetapi belum dilaporkan bagian terpilih (urut dari yang terlama).
  const [outstanding, setOutstanding] = useState({ deptId: '', list: [] });
  const [switched, setSwitched] = useState(null);
  const outList = useMemo(
    () => (outstanding.deptId && outstanding.deptId === form.department_id ? outstanding.list : []),
    [outstanding, form.department_id]
  );

  // Sama dengan aturan submit_report: bagian mengirim untuk bulan aktif, satu bulan sebelumnya,
  // dan bulan lain yang masih tertunggak (susulan, tercatat terlambat). Admin: semua.
  const openCycles = useMemo(() => {
    if (isAdmin) return cycles;
    const archived = cycles.filter((c) => c.status === 'arsip').sort((a, b) => b.start_date.localeCompare(a.start_date));
    const owed = new Set(outList.map((o) => o.cycle_id));
    return cycles.filter((c) => c.status === 'aktif' || c.id === archived[0]?.id || owed.has(c.id));
  }, [cycles, isAdmin, outList]);
  const [problems, setProblems] = useState(null);
  const [confirmWarn, setConfirmWarn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    if (!form.cycle_id && defaultCycle) setForm((f) => ({ ...f, cycle_id: defaultCycle }));
  }, [defaultCycle, form.cycle_id]);

  const cycle = cycles.find((c) => c.id === form.cycle_id) || activeCycle;
  // Laporan berurutan: bulan tertunggak yang lebih awal menahan bulan yang dipilih.
  const blocker = cycle && form.department_id ? outList.find((o) => cycleKey(o) < cycleKey(cycle)) : null;
  const blockerCycle = blocker ? cycles.find((c) => c.id === blocker.cycle_id) || null : null;
  const notOpen = Boolean(cycle) && !isInputOpen(cycle, today);
  const locked = !isAdmin && notOpen;
  const dept = departments.find((d) => d.id === form.department_id);
  const existing = cycle && form.department_id ? (reportsByCycle[cycle.id] || []).find((r) => r.department_id === form.department_id) : null;
  const requireCode = mode === 'supabase' && !isAdmin && !asBagian;
  const fullReport = (deptId, cycleId) =>
    departmentData[deptId]?.reports?.find((r) => r.cycle_id === cycleId) ||
    (reportsByCycle[cycleId] || []).find((r) => r.department_id === deptId) ||
    null;

  useEffect(() => {
    if (cycle) loadReports(cycle.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle?.id]);

  // Muat ulang daftar tertunggak setiap kali bagian berganti atau status laporan berubah.
  useEffect(() => {
    const id = form.department_id;
    if (!id) return undefined;
    let off = false;
    actions
      .loadOutstanding(id)
      .then((list) => !off && setOutstanding({ deptId: id, list: list || [] }))
      .catch(() => !off && setOutstanding({ deptId: id, list: [] }));
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.department_id, reportsByCycle]);

  // Bagian (bukan admin) yang masih punya laporan tertunggak dipindahkan ke bulan itu dulu.
  useEffect(() => {
    if (isAdmin || !blockerCycle || !cycle) return;
    setSwitched({ from: cycle, to: blockerCycle });
    setForm((f) => ({ ...f, cycle_id: blockerCycle.id, evaluasi: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockerCycle?.id, cycle?.id, isAdmin]);

  const patch = (p) => {
    setForm((f) => ({ ...f, ...p }));
    setProblems(null);
    setConfirmWarn(false);
  };

  const pickDepartment = (id) => {
    if (id !== form.department_id) setSwitched(null);
    const d = { ...departments.find((x) => x.id === id), ...(departmentData[id]?.department || {}) };
    const rep = cycle ? fullReport(id, cycle.id) : null;
    if (rep?.submitted_at && rep.hasil_usaha?.length) {
      patch({
        department_id: id,
        sekretaris_nama: rep.sekretaris_nama || '',
        ketua_nama: rep.ketua_nama || '',
        pembimbing_nama: rep.pembimbing_nama || '',
        hasil_usaha: rep.hasil_usaha.length ? [...rep.hasil_usaha] : [''],
        kendala: rep.kendala?.length ? rep.kendala.map((k) => ({ ...k })) : [{ teks: '', kategori: 'sdm' }],
        solusi: rep.solusi?.length ? [...rep.solusi] : [''],
        programs: rep.programs?.length ? rep.programs.map((p) => ({ judul: p.judul, kategori: p.kategori, target: p.target || '' })) : [{ judul: '', kategori: 'unggulan', target: '' }],
        pernyataan_inovatif: false,
        evaluasi: [],
      });
    } else {
      patch({
        department_id: id,
        sekretaris_nama: d?.sekretaris_nama || '',
        ketua_nama: d?.ketua_nama || '',
        pembimbing_nama: d?.pembimbing_nama || '',
        evaluasi: [],
      });
    }
  };

  // Revisi dari Laporan Masuk: buka bulan & bagian itu dengan isi laporannya.
  const [revising, setRevising] = useState(null);
  useEffect(() => {
    if (!revisionTarget || !isAdmin) return;
    const { cycleId, departmentId } = revisionTarget;
    if (form.cycle_id !== cycleId) {
      setSwitched(null);
      setForm(emptyForm(cycleId));
      return;
    }
    if (!reportsByCycle[cycleId]) return;
    pickDepartment(departmentId);
    setRevising({ cycleId, departmentId });
    setTidyUndo(null);
    actions.clearRevision();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisionTarget, form.cycle_id, reportsByCycle, isAdmin]);

  // Rapikan teks (dengan pembatalan).
  const [tidyUndo, setTidyUndo] = useState(null);
  const runTidy = () => {
    const { form: next, changes } = tidyReport(form);
    if (!changes) {
      actions.notify('Isi laporan sudah rapi; tidak ada yang diubah.');
      return;
    }
    setTidyUndo(form);
    setForm(next);
    actions.notify(`${changes} isian dirapikan: spasi, penomoran ketikan, huruf besar, tanda baca, butir kosong & ganda. Periksa lagi sebelum mengirim.`);
  };

  useEffect(() => {
    if (ownId && !ownData) actions.loadDepartmentData(ownId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownId, ownData, bagian?.perlu_setup]);

  // Bagian yang masuk: formulir otomatis memakai bagiannya (dan isi laporannya bila sudah ada).
  const autoPick = useRef('');
  useEffect(() => {
    if (!ownId || !cycle) return;
    const key = `${cycle.id}:${ownData ? 1 : 0}`;
    const pristine = form.hasil_usaha.every((h) => !h.trim()) && form.programs.every((p) => !p.judul.trim());
    if (form.department_id === ownId && (autoPick.current === key || !pristine)) return;
    autoPick.current = key;
    pickDepartment(ownId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownId, cycle?.id, ownData, form.department_id]);

  // Program kerja bulan lalu untuk dievaluasi (admin, sesi bagian, atau kode akses yang benar).
  const [evalHint, setEvalHint] = useState('');
  const secret = isAdmin ? null : asBagian ? bagian.token : form.access_code.trim();
  useEffect(() => {
    setEvalHint('');
    if (!cycle || !form.department_id) return undefined;
    if (!isAdmin && !asBagian && mode === 'supabase' && (secret || '').length < 6) {
      setEvalHint('Masukkan kode akses untuk menampilkan program bulan lalu yang perlu dievaluasi.');
      return undefined;
    }
    let off = false;
    const saved = fullReport(form.department_id, cycle.id)?.evaluasi_program || [];
    const t = setTimeout(async () => {
      try {
        const progs = await actions.previousPrograms({ cycleId: cycle.id, departmentId: form.department_id, secret });
        if (off) return;
        setForm((f) => ({
          ...f,
          evaluasi: (progs || []).map((p) => {
            const old = f.evaluasi.find((e) => e.judul === p.judul) || saved.find((e) => e.judul === p.judul);
            return { judul: p.judul, kategori: p.kategori, target: p.target || '', status: old?.status || '', catatan: old?.catatan || '' };
          }),
        }));
      } catch {
        if (off) return;
        setForm((f) => (f.evaluasi.length ? { ...f, evaluasi: [] } : f));
        if (!isAdmin && !asBagian) setEvalHint('Kode akses belum sesuai, jadi program bulan lalu belum bisa ditampilkan.');
      }
    }, isAdmin || asBagian ? 0 : 450);
    return () => {
      off = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle?.id, form.department_id, secret, isAdmin, asBagian, ownData]);

  // Pejabat bagian yang tersimpan + daftar guru (setelah kode/sesi/admin terverifikasi).
  useEffect(() => {
    if (!form.department_id) return undefined;
    if (!isAdmin && !asBagian && mode === 'supabase' && (secret || '').length < 6) return undefined;
    let off = false;
    const deptId = form.department_id;
    const t = setTimeout(async () => {
      try {
        const ctx = await actions.loadFormContext({ departmentId: deptId, secret });
        if (off || !ctx?.department) return;
        setForm((f) =>
          f.department_id !== deptId
            ? f
            : {
                ...f,
                ketua_nama: f.ketua_nama || ctx.department.ketua_nama || '',
                sekretaris_nama: f.sekretaris_nama || ctx.department.sekretaris_nama || '',
                pembimbing_nama: f.pembimbing_nama || ctx.department.pembimbing_nama || '',
              }
        );
      } catch {
        /* kode belum benar: daftar guru belum dibuka */
      }
    }, isAdmin || asBagian ? 0 : 450);
    return () => {
      off = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.department_id, secret, isAdmin, asBagian]);

  const setEval = (i, p) => {
    setForm((f) => ({ ...f, evaluasi: f.evaluasi.map((e, j) => (j === i ? { ...e, ...p } : e)) }));
    setProblems(null);
    setConfirmWarn(false);
  };

  const submit = async (force = false) => {
    const v = validateReport(form, { requireCode });
    if (v.errors.length || (v.warnings.length && !force)) {
      setProblems(v);
      setConfirmWarn(!v.errors.length && v.warnings.length > 0);
      document.getElementById('form-problems')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setBusy(true);
    try {
      const payload = toPayload(form);
      const saved = await actions.submitReport({
        cycleId: cycle.id,
        departmentId: form.department_id,
        accessCode: asBagian ? bagian.token : form.access_code.trim().toUpperCase(),
        payload,
      });
      const report = { ...saved, ...payload, submitted_at: existing?.submitted_at || saved.submitted_at || new Date().toISOString() };
      setDone({ report, department: dept, cycle, revised: Boolean(existing?.submitted_at), showCard: true });
      // Setelah susulan terkirim, formulir kembali ke bulan aktif.
      setForm(emptyForm(cycle.status === 'aktif' ? form.cycle_id : activeCycle?.id || form.cycle_id));
      setSwitched(null);
      setProblems(null);
      setConfirmWarn(false);
      setTidyUndo(null);
      setRevising(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      /* toast sudah tampil */
    } finally {
      setBusy(false);
    }
  };

  if (!cycle) return null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-6">
        {done && (
          <Callout tone="ok" title={done.revised ? 'Laporan diperbarui' : 'Laporan terkirim'}>
            Softfile {done.department.nama} untuk {cycleLabel(done.cycle)} sudah tersimpan. Kartu pengingat program dan berkas Word resmi sudah siap.
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" onClick={() => setDone((d) => ({ ...d, showCard: true }))}>Lihat kartu pengingat</Button>
              <Button size="sm" variant="ghost" onClick={() => setDone(null)}>Tutup</Button>
            </div>
          </Callout>
        )}

        <Panel eyebrow="Softfile laporan yang telah disetujui Pembimbing Bagian" title="Formulir Laporan Bulanan">
          <div className="flex flex-col gap-7">
            <Callout tone={today > cycle.deadline_date ? 'warn' : 'info'} title={`Laporan bulan ${cycleLabel(cycle)}`}>
              Berisi hasil usaha selama {cycleMonthName(cycle)} dan program kerja {nextMonthLabel(cycle)}. Dikumpulkan di akhir{' '}
              {cycleMonthName(cycle)} sampai {deadlineText(cycle)}
              {today > cycle.deadline_date ? '; laporan yang masuk sekarang tercatat terlambat.' : '.'}
              {notOpen && (cycle.input_closed_at ? <> Input bulan ini hanya bisa dilakukan admin.</> : <> Input softfile dibuka {inputOpenText(cycle)}.</>)}
            </Callout>
            {switched && !isAdmin && switched.to.id === cycle.id && (
              <Callout tone="warn" title={`Selesaikan dulu laporan ${cycleLabel(switched.to)}`}>
                Laporan {cycleLabel(switched.from)} baru bisa diisi setelah laporan {cycleMonthName(switched.to)} terkirim. Formulir ini sekarang untuk
                laporan {cycleMonthName(switched.to)}
                {today > switched.to.deadline_date ? ' dan tercatat terlambat.' : '.'}
              </Callout>
            )}
            {isAdmin && blockerCycle && (
              <Callout tone="warn" title={`Laporan ${cycleLabel(blockerCycle)} bagian ini belum terkirim`}>
                Bagian tidak bisa mengirim laporan {cycleMonthName(cycle)} sebelum laporan {cycleMonthName(blockerCycle)} masuk. Sebagai admin Anda tetap bisa mengirim.
              </Callout>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Laporan bulan">
                <Select
                  id="f-cycle"
                  value={form.cycle_id}
                  onChange={(e) => {
                    setSwitched(null);
                    patch(asBagian ? { cycle_id: e.target.value, evaluasi: [] } : { cycle_id: e.target.value, department_id: '', evaluasi: [] });
                  }}
                >
                  {openCycles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {cycleLabel(c)}
                      {c.input_closed_at ? ' · hanya admin' : c.status === 'arsip' ? (today > c.deadline_date ? ' · terlambat' : ' · bulan lalu') : !isInputOpen(c, today) ? ' · belum dibuka' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Bagian">
                <Select id="f-dept" value={form.department_id} disabled={asBagian} onChange={(e) => pickDepartment(e.target.value)}>
                  <option value="">— Pilih bagian (1–{activeDepartments.length}) —</option>
                  {activeDepartments.map((d) => {
                    const r = (reportsByCycle[cycle.id] || []).find((x) => x.department_id === d.id);
                    return (
                      <option key={d.id} value={d.id}>
                        {d.no}. {d.nama}
                        {r?.submitted_at ? ' ✓' : ''}
                      </option>
                    );
                  })}
                </Select>
              </Field>
              {asBagian ? (
                <div className="flex items-end sm:col-span-2">
                  <p className="flex items-start gap-2 rounded-lg border border-emerald-300/60 bg-emerald-50 px-3 py-2.5 text-[13px] leading-snug text-emerald-900">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>Masuk sebagai <strong>{bagian.department.nama}</strong>. Kode akses tidak perlu diisi.</span>
                  </p>
                </div>
              ) : requireCode ? (
                <Field className="sm:col-span-2" label="Kode akses bagian" hint="Dari admin. Setelah kode benar, nama pejabat yang tersimpan terisi sendiri dan nama guru bisa dicari.">
                  <Input
                    id="f-code"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={32}
                    className="font-mono uppercase tracking-[0.2em] sm:max-w-[260px]"
                    placeholder="6 karakter"
                    value={form.access_code}
                    onChange={(e) => patch({ access_code: e.target.value.toUpperCase() })}
                  />
                </Field>
              ) : mode === 'demo' ? (
                <div className="sm:col-span-2">
                  {(
                    <Button
                      variant="ghost"
                      icon={Sparkles}
                      onClick={() =>
                        patch({
                          hasil_usaha: [...SAMPLE.hasil_usaha],
                          kendala: SAMPLE.kendala.map((k) => ({ ...k })),
                          solusi: [...SAMPLE.solusi],
                          programs: SAMPLE.programs.map((p) => ({ ...p })),
                        })
                      }
                    >
                      Isi dengan contoh
                    </Button>
                  )}
                </div>
              ) : null}
              <Field label="Ketua Bagian">
                <NameCombobox
                  id="f-ketua"
                  value={form.ketua_nama}
                  onChange={(v) => patch({ ketua_nama: v })}
                  options={teachers || []}
                  placeholder="Nama Ketua Bagian"
                  disabledHint={requireCode && form.department_id ? 'Isi kode akses dulu untuk mencari dari daftar guru.' : ''}
                />
              </Field>
              <Field label="Sekretaris Bagian">
                <NameCombobox
                  id="f-sek"
                  value={form.sekretaris_nama}
                  onChange={(v) => patch({ sekretaris_nama: v })}
                  options={teachers || []}
                  placeholder="Nama Sekretaris Bagian"
                  disabledHint={requireCode && form.department_id ? 'Isi kode akses dulu untuk mencari dari daftar guru.' : ''}
                />
              </Field>
              <Field label="Pembimbing Bagian" className="sm:col-span-2" hint="Nama pejabat diingat dari laporan terakhir dan bisa diubah bila berganti.">
                <PembimbingField id="f-pemb" value={form.pembimbing_nama} onChange={(v) => patch({ pembimbing_nama: v })} options={pembimbingOptions || []} />
              </Field>
            </div>

            {locked ? (
              <div className="flex items-start gap-3 rounded-xl border border-line bg-mist px-4 py-4 text-[13.5px] leading-relaxed text-ink">
                <Lock className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
                <div className="flex flex-col gap-1.5">
                  <p className="font-semibold">Input laporan {cycleLabel(cycle)} {cycle.input_closed_at ? 'hanya bisa diinput admin' : 'belum dibuka'}</p>
                  {cycle.input_closed_at ? (
                    <p className="text-muted">Hubungi admin Sektor Guru KMI bila laporan bulan ini masih perlu dikirim.</p>
                  ) : (
                  <p className="text-muted">
                    Softfile laporan {cycleMonthName(cycle)} bisa dikirim mulai <strong className="text-ink">{inputOpenText(cycle)}</strong> sampai{' '}
                    {deadlineText(cycle)}. Sementara itu laksanakan program kerja, rapat bagian, dan serahkan draf hardfile ke Pembimbing.
                  </p>
                  )}
                  {!form.department_id && (
                    <p className="text-muted">Bagian yang laporan bulan sebelumnya belum terkirim: pilih nama bagian, formulir akan beralih ke laporan yang tertunggak.</p>
                  )}
                </div>
              </div>
            ) : (
            <>
            {existing?.submitted_at && (isAdmin ? (
              <Callout tone="info" title={revising && revising.departmentId === form.department_id ? 'Mode revisi admin' : 'Bagian ini sudah melapor'}>
                {existing.softfile_manual
                  ? 'Bagian ini baru menyerahkan hardfile (softfile dicentang admin). Isi laporannya di sini; waktu terima tetap dipakai.'
                  : `Softfile masuk ${formatTimestamp(existing.submitted_at)}. Perbaiki atau rapikan isinya lalu tekan Simpan revisi; waktu kirim asli tetap dipakai untuk ketepatan waktu, dan laporan ditandai "direvisi admin".`}
                {existing.direvisi_admin_at && <> Terakhir direvisi admin {formatTimestamp(existing.direvisi_admin_at)}.</>}
              </Callout>
            ) : (
              <Callout tone="info" title="Bagian ini sudah melapor">
                Softfile masuk {formatTimestamp(existing.submitted_at)}. Mengirim ulang akan memperbarui isi laporan; waktu kirim pertama tetap dicatat untuk penilaian ketepatan waktu.
              </Callout>
            ))}

            {(form.evaluasi.length > 0 || evalHint) && (
              <section className="flex flex-col gap-3">
                <SectionTitle n={<ListChecks className="inline size-4" aria-hidden />} title={`Evaluasi Program Kerja · ${cycleMonthName(cycle)} ${cycle.hijri_year} H`}>
                  Program yang direncanakan untuk {cycleMonthName(cycle)} pada laporan bulan lalu. Tandai keterlaksanaannya. Evaluasi tampil di dasbor bagian dan tidak mengubah berkas Word resmi.
                </SectionTitle>
                {form.evaluasi.length === 0 ? (
                  <p className="text-[13px] text-muted sm:pl-7">{evalHint}</p>
                ) : (
                  <div className="flex flex-col gap-2.5 sm:pl-7">
                    {form.evaluasi.map((e, i) => (
                      <div key={`${e.judul}-${i}`} className="flex flex-col gap-2.5 rounded-xl border border-line p-3.5">
                        <p className="text-[14px] font-semibold leading-snug text-ink">
                          <span aria-hidden>{programCategory(e.kategori)?.emoji}</span> {e.judul}
                          {e.target ? <span className="font-normal text-muted"> · target {e.target}</span> : null}
                        </p>
                        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Keterlaksanaan ${e.judul}`}>
                          {EVAL_STATUS.map((st) => (
                            <button
                              key={st.key}
                              type="button"
                              role="radio"
                              aria-checked={e.status === st.key}
                              onClick={() => setEval(i, { status: st.key })}
                              className={cx(
                                'inline-flex h-8 items-center rounded-full border px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand',
                                e.status === st.key ? st.on : 'border-line bg-white text-muted hover:text-ink'
                              )}
                            >
                              {st.label}
                            </button>
                          ))}
                        </div>
                        <Input
                          id={`eval-catatan-${i}`}
                          value={e.catatan}
                          placeholder="Catatan singkat (opsional), mis. alasan tertunda"
                          onChange={(ev) => setEval(i, { catatan: ev.target.value })}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            <section className="flex flex-col gap-3">
              <SectionTitle n="I" title={`Hasil Usaha · ${cycleMonthName(cycle)} ${cycle.hijri_year} H`}>
                Program kerja yang sudah terlaksana selama bulan {cycleMonthName(cycle)}. Tuliskan program baru dan hasilnya yang terukur.
              </SectionTitle>
              <div className="sm:pl-7">
                <Callout tone="warn">
                  <strong>Bukan rutinitas bagian.</strong> Piket, jaga, kebersihan harian, atau tugas yang memang selalu berjalan tidak ditulis sebagai hasil usaha.
                </Callout>
              </div>
              <StringList
                idPrefix="hasil"
                items={form.hasil_usaha}
                onChange={(v) => patch({ hasil_usaha: v })}
                placeholder="Contoh: Merintis kelas tahsin pagi untuk 32 santri; 21 santri naik level."
                addLabel="Tambah hasil usaha"
                renderExtra={(v) => {
                  const hits = routineHits(v);
                  return hits.length ? (
                    <p className="flex items-center gap-1.5 pl-7 text-[12.5px] font-medium text-amber-800">
                      <AlertTriangle className="size-3.5" /> Terbaca rutinitas ({hits.join(', ')}). Tulis inovasi dan hasilnya.
                    </p>
                  ) : null;
                }}
              />
            </section>

            <section className="flex flex-col gap-3">
              <SectionTitle n="II" title="Kendala-kendala">Hal-hal yang menghambat terlaksananya program kerja {cycleMonthName(cycle)} secara sempurna.</SectionTitle>
              <div className="flex flex-col gap-2.5 sm:pl-7">
                {form.kendala.map((k, i) => (
                  <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <span className="mt-2.5 hidden w-5 shrink-0 text-right text-[13px] font-semibold text-muted tabular-nums sm:block">{i + 1}.</span>
                    <Textarea
                      id={`kendala-${i}`}
                      rows={2}
                      value={k.teks}
                      placeholder="Contoh: Pasokan bahan baku terlambat dari distributor."
                      onChange={(e) => patch({ kendala: form.kendala.map((x, j) => (j === i ? { ...x, teks: e.target.value } : x)) })}
                    />
                    <div className="flex items-start gap-2">
                      <Select
                        id={`kendala-kat-${i}`}
                        className="sm:w-48"
                        aria-label={`Kategori kendala ${i + 1}`}
                        value={k.kategori}
                        onChange={(e) => patch({ kendala: form.kendala.map((x, j) => (j === i ? { ...x, kategori: e.target.value } : x)) })}
                      >
                        {KENDALA_CATEGORIES.map((c) => (
                          <option key={c.key} value={c.key}>{c.label}</option>
                        ))}
                      </Select>
                      <Button size="sm" variant="ghost" icon={Trash2} className="mt-1" aria-label={`Hapus kendala ${i + 1}`} onClick={() => patch({ kendala: form.kendala.length > 1 ? form.kendala.filter((_, j) => j !== i) : [{ teks: '', kategori: 'sdm' }] })} />
                    </div>
                  </div>
                ))}
                <div className="sm:pl-7">
                  <Button size="sm" variant="ghost" icon={Plus} onClick={() => patch({ kendala: [...form.kendala, { teks: '', kategori: 'sdm' }] })}>
                    Tambah kendala
                  </Button>
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <SectionTitle n="III" title="Solusi dari Kendala">Langkah pemecahan masalah atas kendala yang dihadapi.</SectionTitle>
              <StringList idPrefix="solusi" items={form.solusi} onChange={(v) => patch({ solusi: v })} placeholder="Contoh: Menambah distributor cadangan." addLabel="Tambah solusi" />
            </section>

            <section className="flex flex-col gap-3">
              <SectionTitle n="IV" title={`Program Kerja Satu Bulan ke Depan · ${nextMonthLabel(cycle)}`}>
                Bentuk praktis dari pelaksanaan solusi. Tandai tingkat kepentingan setiap program.
              </SectionTitle>
              <div className="flex flex-col gap-3 sm:pl-7">
                {form.programs.map((p, i) => (
                  <div key={i} className="flex flex-col gap-2.5 rounded-xl border border-line p-3.5">
                    <div className="flex items-start gap-2">
                      <span className="mt-2.5 w-5 shrink-0 text-right text-[13px] font-semibold text-muted tabular-nums">{i + 1}.</span>
                      <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[1fr_190px]">
                        <Input id={`prog-${i}`} value={p.judul} placeholder="Nama program kerja" onChange={(e) => patch({ programs: form.programs.map((x, j) => (j === i ? { ...x, judul: e.target.value } : x)) })} />
                        <Input id={`prog-target-${i}`} value={p.target} placeholder="Target terukur (opsional)" onChange={(e) => patch({ programs: form.programs.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)) })} />
                      </div>
                      <Button size="sm" variant="ghost" icon={Trash2} className="mt-1" aria-label={`Hapus program ${i + 1}`} disabled={form.programs.length === 1} onClick={() => patch({ programs: form.programs.filter((_, j) => j !== i) })} />
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-7" role="radiogroup" aria-label={`Klasifikasi program ${i + 1}`}>
                      {PROGRAM_CATEGORIES.map((c) => {
                        const on = p.kategori === c.key;
                        return (
                          <button
                            key={c.key}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => patch({ programs: form.programs.map((x, j) => (j === i ? { ...x, kategori: c.key } : x)) })}
                            className={cx(
                              'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand',
                              on ? (c.key === 'unggulan' ? 'border-navy bg-navy text-white' : 'border-brand bg-sky-wash text-navy') : 'border-line bg-white text-muted hover:text-ink'
                            )}
                          >
                            <span aria-hidden>{c.emoji}</span> {c.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div>
                  <Button size="sm" variant="ghost" icon={Plus} onClick={() => patch({ programs: [...form.programs, { judul: '', kategori: 'reguler', target: '' }] })}>
                    Tambah program
                  </Button>
                </div>
              </div>
            </section>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-mist px-4 py-3.5">
              <input
                id="f-pernyataan"
                type="checkbox"
                className="mt-0.5 size-4 accent-[#1D4ED8]"
                checked={form.pernyataan_inovatif}
                onChange={(e) => patch({ pernyataan_inovatif: e.target.checked })}
              />
              <span className="text-[13.5px] leading-relaxed text-ink">
                Laporan ini sudah direvisi dan <strong>disetujui Pembimbing Bagian</strong> (hardfile), dan isi Hasil Usaha bersifat <strong>inovatif, bukan rutinitas</strong>.
              </span>
            </label>

            {problems && (
              <div id="form-problems" className="flex flex-col gap-2">
                {problems.errors.length > 0 && (
                  <Callout tone="error" title="Lengkapi dulu bagian berikut">
                    <ul className="list-disc pl-4">{problems.errors.map((e) => <li key={e}>{e}</li>)}</ul>
                  </Callout>
                )}
                {problems.warnings.length > 0 && (
                  <Callout tone="warn" title="Periksa kembali">
                    <ul className="list-disc pl-4">{problems.warnings.map((e) => <li key={e}>{e}</li>)}</ul>
                    {confirmWarn && <p className="mt-1">Jika sudah sesuai, tekan <strong>Kirim tetap</strong>.</p>}
                  </Callout>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => { setForm(emptyForm(form.cycle_id)); setProblems(null); setTidyUndo(null); setRevising(null); }}>Kosongkan formulir</Button>
              {tidyUndo && (
                <Button variant="ghost" icon={RotateCcw} onClick={() => { setForm(tidyUndo); setTidyUndo(null); }}>Batalkan rapikan</Button>
              )}
              <Button icon={Wand2} onClick={runTidy} disabled={!form.department_id}>Rapikan teks</Button>
              {confirmWarn ? (
                <Button variant="primary" size="lg" icon={Send} busy={busy} onClick={() => submit(true)}>Kirim tetap</Button>
              ) : (
                <Button variant="primary" size="lg" icon={requireCode ? Key : Send} busy={busy} onClick={() => submit(false)}>
                  {existing?.submitted_at ? (isAdmin && !existing.softfile_manual ? 'Simpan revisi' : 'Perbarui laporan') : 'Kirim laporan'}
                </Button>
              )}
            </div>
            </>
            )}
          </div>
        </Panel>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-[132px] lg:self-start">
        <Panel title="Struktur resmi" eyebrow="Template PMDG Kampus 3" bodyClass="text-[13px] leading-relaxed text-muted">
          <ol className="flex flex-col gap-2">
            {['Hasil Usaha', 'Kendala-kendala', 'Solusi dari Kendala', 'Program Kerja Satu Bulan ke Depan'].map((t, i) => (
              <li key={t} className="flex gap-2">
                <span className="font-serif font-semibold text-brand">{['I', 'II', 'III', 'IV'][i]}</span>
                <span className="text-ink">{t}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 border-t border-line pt-3">
            <p className="font-semibold text-ink">NB</p>
            <p>Laporan bulanan dikumpulkan pada tanggal 5 Hijriah pada bulan selanjutnya.</p>
            <p className="mt-1">Input softfile dibuka tanggal 20 Hijriah. Laporan diisi berurutan: bulan yang tertunggak diselesaikan dulu.</p>
            <p className="mt-1">Penulisan laporan bulanan bersifat inovatif, bukan rutinitas.</p>
          </div>
        </Panel>
        <Panel title="Klasifikasi program" bodyClass="text-[13px]">
          <ul className="flex flex-col gap-2">
            {PROGRAM_CATEGORIES.map((c) => (
              <li key={c.key} className="flex gap-2">
                <span aria-hidden>{c.emoji}</span>
                <span className="text-ink">{c.label}</span>
              </li>
            ))}
          </ul>
        </Panel>
        {dept && (
          <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-3 text-[13px]">
            <CheckCircle2 className={cx('size-4', existing?.submitted_at ? 'text-emerald-600' : 'text-slate-300')} />
            <span className="text-ink">Bagian {dept.no} dari {activeDepartments.length}</span>
          </div>
        )}
      </aside>

      {done?.showCard && (
        <ReminderCardModal open onClose={() => setDone((d) => ({ ...d, showCard: false }))} report={done.report} department={done.department} cycle={done.cycle} />
      )}
    </div>
  );
}
