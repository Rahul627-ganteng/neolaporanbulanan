import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Key, Plus, Send, Sparkles, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { cycleLabel, KENDALA_CATEGORIES, nextMonthLabel, PROGRAM_CATEGORIES } from '../lib/constants.js';
import { formatTimestamp } from '../lib/hijri.js';
import { routineHits, toPayload, validateReport } from '../lib/validation.js';
import { Button, Callout, cx, Field, Input, Panel, Select, Textarea } from './ui.jsx';
import { ReminderCardModal } from './ReminderCard.jsx';

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
  const { cycles, activeCycle, prevCycle, viewCycle, activeDepartments, departments, reportsByCycle, isAdmin, mode, today, week, actions, loadReports } = useStore();

  const openCycles = useMemo(
    () => cycles.filter((c) => isAdmin || c.status === 'aktif' || today <= c.deadline_date),
    [cycles, isAdmin, today]
  );
  const defaultCycle = useMemo(() => {
    const prevOpen = activeCycle && week === 1 && prevCycle && today <= prevCycle.deadline_date ? prevCycle : null;
    return (prevOpen || activeCycle || viewCycle)?.id || '';
  }, [activeCycle, prevCycle, viewCycle, week, today]);

  const [form, setForm] = useState(() => emptyForm(defaultCycle));
  const [problems, setProblems] = useState(null);
  const [confirmWarn, setConfirmWarn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    if (!form.cycle_id && defaultCycle) setForm((f) => ({ ...f, cycle_id: defaultCycle }));
  }, [defaultCycle, form.cycle_id]);

  const cycle = cycles.find((c) => c.id === form.cycle_id) || activeCycle;
  const dept = departments.find((d) => d.id === form.department_id);
  const existing = cycle && form.department_id ? (reportsByCycle[cycle.id] || []).find((r) => r.department_id === form.department_id) : null;
  const requireCode = mode === 'supabase' && !isAdmin;

  useEffect(() => {
    if (cycle) loadReports(cycle.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle?.id]);

  const patch = (p) => {
    setForm((f) => ({ ...f, ...p }));
    setProblems(null);
    setConfirmWarn(false);
  };

  const pickDepartment = (id) => {
    const d = departments.find((x) => x.id === id);
    const rep = cycle ? (reportsByCycle[cycle.id] || []).find((r) => r.department_id === id) : null;
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
      });
    } else {
      patch({
        department_id: id,
        sekretaris_nama: d?.sekretaris_nama || '',
        ketua_nama: d?.ketua_nama || '',
        pembimbing_nama: d?.pembimbing_nama || '',
      });
    }
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
      const saved = await actions.submitReport({ cycleId: cycle.id, departmentId: form.department_id, accessCode: form.access_code, payload });
      const report = { ...saved, ...payload, submitted_at: existing?.submitted_at || saved.submitted_at || new Date().toISOString() };
      setDone({ report, department: dept, cycle, revised: Boolean(existing?.submitted_at), showCard: true });
      setForm(emptyForm(form.cycle_id));
      setProblems(null);
      setConfirmWarn(false);
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Laporan bulan">
                <Select id="f-cycle" value={form.cycle_id} onChange={(e) => patch({ cycle_id: e.target.value, department_id: '' })}>
                  {openCycles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {cycleLabel(c)}
                      {c.status === 'arsip' ? ' · bulan lalu' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Bagian">
                <Select id="f-dept" value={form.department_id} onChange={(e) => pickDepartment(e.target.value)}>
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
              <Field label="Sekretaris Bagian">
                <Input id="f-sek" value={form.sekretaris_nama} onChange={(e) => patch({ sekretaris_nama: e.target.value })} placeholder="Ust. …" />
              </Field>
              <Field label="Ketua Bagian">
                <Input id="f-ketua" value={form.ketua_nama} onChange={(e) => patch({ ketua_nama: e.target.value })} placeholder="Ust. …" />
              </Field>
              <Field label="Pembimbing Bagian">
                <Input id="f-pemb" value={form.pembimbing_nama} onChange={(e) => patch({ pembimbing_nama: e.target.value })} placeholder="Ust. …" />
              </Field>
              {requireCode ? (
                <Field label="Kode akses bagian" hint="Diberikan admin kepada Sekretaris Bagian.">
                  <Input id="f-code" type="password" autoComplete="off" value={form.access_code} onChange={(e) => patch({ access_code: e.target.value })} />
                </Field>
              ) : (
                <div className="flex items-end">
                  {mode === 'demo' && (
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
              )}
            </div>

            {existing?.submitted_at && (
              <Callout tone="info" title="Bagian ini sudah melapor">
                Softfile masuk {formatTimestamp(existing.submitted_at)}. Mengirim ulang akan memperbarui isi laporan; waktu kirim pertama tetap dicatat untuk penilaian ketepatan waktu.
              </Callout>
            )}

            <section className="flex flex-col gap-3">
              <SectionTitle n="I" title="Hasil Usaha">
                Ditulis dari program kerja yang telah terlaksana pada bulan sebelumnya. Tuliskan program baru dan hasilnya yang terukur.
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
              <SectionTitle n="II" title="Kendala-kendala">Hal-hal yang menghambat terlaksananya program kerja secara sempurna.</SectionTitle>
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
              <Button variant="ghost" onClick={() => { setForm(emptyForm(form.cycle_id)); setProblems(null); }}>Kosongkan formulir</Button>
              {confirmWarn ? (
                <Button variant="primary" size="lg" icon={Send} busy={busy} onClick={() => submit(true)}>Kirim tetap</Button>
              ) : (
                <Button variant="primary" size="lg" icon={requireCode ? Key : Send} busy={busy} onClick={() => submit(false)}>
                  {existing?.submitted_at ? 'Perbarui laporan' : 'Kirim laporan'}
                </Button>
              )}
            </div>
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
