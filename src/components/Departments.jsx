import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Eye, EyeOff, FileSpreadsheet, GraduationCap, Key, Megaphone, Pencil, Plus, Search, Shuffle, UserCheck, Users } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { formatWa, normalizeWa } from '../lib/constants.js';
import { Badge, Button, Callout, Empty, Field, Input, Modal, Panel, Textarea } from './ui.jsx';
import { AccessCodesModal, ImportDepartmentsModal, ImportTeachersModal } from './DepartmentTools.jsx';
import NameCombobox from './NameCombobox.jsx';
import PembimbingField from './PembimbingField.jsx';
import { copyText } from '../lib/files.js';
import { PORTAL_URL } from '../lib/env.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHABET[b % ALPHABET.length]).join('');

function PembimbingCard() {
  const { actions, pembimbingOptions } = useStore();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = pembimbingOptions || [];
  const save = async () => {
    setBusy(true);
    try {
      await actions.setPembimbingOptions(text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
      setEditing(false);
    } catch {
      /* toast tampil */
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-line bg-white px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <UserCheck className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-ink">
              Daftar Pembimbing Bagian: {pembimbingOptions === null ? 'memuat…' : `${list.length} nama`}
            </p>
            <p className="text-[12.5px] text-muted">Muncul sebagai pilihan saat login pertama, di formulir laporan, dan di Data Bagian. Selalu ada opsi "Lainnya".</p>
          </div>
        </div>
        <Button size="sm" icon={Pencil} onClick={() => { setText(list.join('\n')); setEditing((v) => !v); }}>
          Ubah daftar
        </Button>
      </div>
      {editing && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <Field label="Satu nama per baris">
            <Textarea id="pembimbing-list" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Al-Ustadz …\nAl-Ustadz …'} />
          </Field>
          <div className="flex gap-2">
            <Button variant="primary" busy={busy} onClick={save}>Simpan daftar</Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>Batal</Button>
          </div>
        </div>
      )}
      {!editing && list.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {list.map((n) => <li key={n}><Badge tone="brand">{n}</Badge></li>)}
        </ul>
      )}
    </div>
  );
}

function SharedCodeCard({ access, onSaved }) {
  const { actions } = useStore();
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const current = access?.kode_awal || '';
  const save = async () => {
    setBusy(true);
    try {
      await actions.setSharedCode(code.trim().toUpperCase());
      setEditing(false);
      onSaved();
    } catch {
      /* toast tampil */
    } finally {
      setBusy(false);
    }
  };
  const announce = async () => {
    const text = [
      "Assalamu'alaikum warahmatullahi wabarakatuh.",
      'Yth. Ketua & Sekretaris Bagian Sektor Guru KMI.',
      '',
      `*Portal Laporan Bulanan:* ${PORTAL_URL || 'https://neolaporanbulanan.netlify.app'}`,
      `Masuk → tab *Bagian* → pilih nama bagian → kode awal: *${current}*`,
      '',
      'Saat masuk pertama kali, lengkapi nama & nomor WA Ketua/Sekretaris dan buat kode akses bagian sendiri. Setelah itu kode awal tidak berlaku lagi untuk bagian antum.',
      '',
      'Jazakumullah khairan.',
      '— Admin Laporan Bulanan Sektor Guru KMI',
    ].join('\n');
    actions.notify((await copyText(text)) ? 'Pengumuman tersalin. Tempel di grup WhatsApp.' : 'Salin ditolak peramban.');
  };
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-line bg-white px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Key className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-ink">
              Kode awal bersama:{' '}
              {current ? (
                <span className="font-mono tracking-[0.18em]">{show ? current : '••••••'}</span>
              ) : (
                <span className="text-muted">belum diatur</span>
              )}
            </p>
            <p className="text-[12.5px] text-muted">
              Satu kode untuk semua bagian yang belum membuat kode sendiri. Saat masuk pertama, bagian wajib melengkapi kontak dan membuat kode sendiri.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {current && <Button size="sm" variant="ghost" icon={show ? EyeOff : Eye} onClick={() => setShow((v) => !v)}>{show ? 'Sembunyikan' : 'Lihat'}</Button>}
          {current && <Button size="sm" icon={Megaphone} onClick={announce}>Salin pengumuman WA</Button>}
          <Button size="sm" icon={Pencil} onClick={() => { setCode(current || randomCode()); setEditing((v) => !v); }}>{current ? 'Ganti' : 'Atur'}</Button>
        </div>
      </div>
      {editing && (
        <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <Field label="Kode awal baru (min. 6)">
            <Input id="shared-code" className="w-48 font-mono uppercase tracking-[0.18em]" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </Field>
          <Button icon={Shuffle} variant="ghost" onClick={() => setCode(randomCode())}>Acak</Button>
          <Button variant="primary" busy={busy} disabled={code.trim() ? code.trim().length < 6 : !current} onClick={save}>{code.trim() ? 'Simpan' : 'Simpan (nonaktifkan)'}</Button>
          {current && <Button variant="ghost" onClick={() => { setCode(''); }}>Kosongkan</Button>}
          <p className="w-full text-[12px] text-muted">Mengganti kode awal tidak memengaruhi bagian yang sudah membuat kode sendiri. Kosongkan lalu simpan untuk menonaktifkan.</p>
        </div>
      )}
    </div>
  );
}

function EditModal({ dept, onClose }) {
  const { actions, mode, teachers, pembimbingOptions } = useStore();
  const [d, setD] = useState(dept);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e.target.value }));
  const waBad = (v) => v && !/^62\d{8,13}$/.test(normalizeWa(v));

  const save = async () => {
    if (waBad(d.ketua_wa) || waBad(d.sekretaris_wa)) {
      actions.notify('Nomor WA tidak valid. Gunakan format 08xx atau 628xx.', 'error');
      return;
    }
    setBusy(true);
    try {
      await actions.saveDepartment(d);
      if (code) await actions.setAccessCode(d.id, code);
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
      eyebrow={dept.id ? `Bagian ${dept.no}` : 'Bagian baru'}
      title={dept.id ? dept.nama : 'Tambah bagian'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button variant="primary" busy={busy} onClick={save}>Simpan</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nomor urut"><Input id="d-no" type="number" min={1} value={d.no} onChange={(e) => setD((x) => ({ ...x, no: Number(e.target.value) }))} /></Field>
        <Field label="Nama bagian"><Input id="d-nama" value={d.nama} onChange={set('nama')} /></Field>
        <Field label="Nama Ketua Bagian">
          <NameCombobox id="d-ketua" value={d.ketua_nama || ''} onChange={(v) => setD((x) => ({ ...x, ketua_nama: v }))} options={teachers || []} placeholder="Nama Ketua Bagian" />
        </Field>
        <Field label="WA Ketua" hint={waBad(d.ketua_wa) ? 'Format tidak valid' : d.ketua_wa ? `Disimpan sebagai ${normalizeWa(d.ketua_wa)}` : 'Contoh 0812xxxxxxx'}>
          <Input id="d-ketua-wa" inputMode="tel" value={d.ketua_wa || ''} onChange={set('ketua_wa')} />
        </Field>
        <Field label="Nama Sekretaris Bagian">
          <NameCombobox id="d-sek" value={d.sekretaris_nama || ''} onChange={(v) => setD((x) => ({ ...x, sekretaris_nama: v }))} options={teachers || []} placeholder="Nama Sekretaris Bagian" />
        </Field>
        <Field label="WA Sekretaris" hint={waBad(d.sekretaris_wa) ? 'Format tidak valid' : d.sekretaris_wa ? `Disimpan sebagai ${normalizeWa(d.sekretaris_wa)}` : 'Contoh 0812xxxxxxx'}>
          <Input id="d-sek-wa" inputMode="tel" value={d.sekretaris_wa || ''} onChange={set('sekretaris_wa')} />
        </Field>
        <Field label="Nama Pembimbing Bagian" className="sm:col-span-2">
          <PembimbingField id="d-pemb" value={d.pembimbing_nama || ''} onChange={(v) => setD((x) => ({ ...x, pembimbing_nama: v }))} options={pembimbingOptions || []} />
        </Field>
        {dept.id && (
          <Field
            label={dept.has_access_code ? 'Atur ulang kode akses / sandi akun bagian' : 'Atur kode akses / sandi akun bagian'}
            hint={mode === 'demo' ? 'Di Mode Demo kode tidak diperiksa.' : 'Minimal 6 karakter. Kode ini juga sandi akun bagian; mengubahnya mengeluarkan bagian dari semua perangkat. Berikan kepada Sekretaris Bagian.'}
            className="sm:col-span-2"
          >
            <Input id="d-code" type="text" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Kosongkan bila tidak diubah" />
          </Field>
        )}
        <label className="flex items-center gap-2 text-[13.5px] sm:col-span-2">
          <input id="d-active" type="checkbox" className="size-4 accent-[#1D4ED8]" checked={d.is_active !== false} onChange={(e) => setD((x) => ({ ...x, is_active: e.target.checked }))} />
          Bagian aktif (ikut dihitung dalam pelaporan bulanan)
        </label>
      </div>
    </Modal>
  );
}

export default function Departments({ go }) {
  const { departments, mode, actions, teachers, pembimbingOptions } = useStore();
  const [teachersOpen, setTeachersOpen] = useState(false);
  const [access, setAccess] = useState(null);
  const [reveal, setReveal] = useState(false);
  const loadAccess = () => actions.loadAccessOverview().then(setAccess).catch(() => setAccess({ codes: [], kode_awal: '' }));
  useEffect(() => {
    loadAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departments]);
  const codeOf = useMemo(() => new Map((access?.codes || []).map((c) => [c.department_id, c])), [access]);
  useEffect(() => {
    if (teachers === null || pembimbingOptions === null) actions.loadFormContext({}).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [codesOpen, setCodesOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return departments.filter((d) => !n || [d.nama, d.ketua_nama, d.sekretaris_nama, d.pembimbing_nama].join(' ').toLowerCase().includes(n));
  }, [departments, q]);
  const filled = departments.filter((d) => d.ketua_wa && d.sekretaris_wa).length;
  const noCode = departments.filter((d) => d.is_active !== false && !d.has_access_code).length;

  return (
    <div className="flex flex-col gap-4">
      {mode === 'demo' && (
        <Callout tone="info" title="Nama di bawah adalah data contoh">
          Nomor WA sengaja dikosongkan. Isi dengan data asli di versi produksi; tombol pengingat akan memakai nomor tersebut.
        </Callout>
      )}
      {(noCode > 0 || filled < departments.length) && (
        <Callout tone="warn" title="Lengkapi agar laporan & pengingat berjalan">
          <ul className="list-disc pl-4">
            {noCode > 0 && (
              <li>
                {access?.kode_awal
                  ? `${noCode} bagian belum punya kode sendiri; mereka bisa masuk dengan kode awal bersama, tetapi formulir tanpa masuk butuh kode bagian.`
                  : `${noCode} bagian belum punya kode akses, jadi sekretarisnya belum bisa mengirim laporan.`}{' '}
                <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setCodesOpen(true)}>Buat kode sekarang</button>
              </li>
            )}
            {filled < departments.length && (
              <li>
                {departments.length - filled} bagian belum lengkap nomor WA Ketua/Sekretaris.{' '}
                <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setImportOpen(true)}>Impor dari spreadsheet</button>
              </li>
            )}
          </ul>
        </Callout>
      )}
      <SharedCodeCard access={access} onSaved={loadAccess} />
      <PembimbingCard />
      <div className="flex flex-col gap-3 rounded-[14px] border border-line bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <GraduationCap className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-ink">
              Daftar guru untuk pencarian nama Ketua & Sekretaris: {teachers === null ? 'memuat…' : `${teachers.length} guru aktif`}
            </p>
            <p className="text-[12.5px] text-muted">Tanpa Guru Senior. Perbarui dari Excel absen guru setiap awal tahun ajaran.</p>
          </div>
        </div>
        <Button size="sm" icon={FileSpreadsheet} onClick={() => setTeachersOpen(true)}>
          Perbarui dari Excel
        </Button>
      </div>
      <Panel
        eyebrow={`${departments.length} bagian · ${filled} lengkap dengan nomor WA`}
        title="Data master bagian Sektor Guru KMI"
        bodyClass="p-0"
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input id="dept-search" className="h-9 w-56 pl-9" placeholder="Cari bagian/nama" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Button size="sm" variant="ghost" icon={reveal ? EyeOff : Eye} onClick={() => setReveal((v) => !v)}>{reveal ? 'Sembunyikan kode' : 'Tampilkan kode'}</Button>
            <Button size="sm" icon={FileSpreadsheet} onClick={() => setImportOpen(true)}>Impor dari spreadsheet</Button>
            <Button size="sm" icon={Key} onClick={() => setCodesOpen(true)}>Kode akses massal</Button>
            <Button size="sm" icon={Plus} onClick={() => setEdit({ no: departments.length + 1, nama: '', is_active: true })}>Tambah bagian</Button>
          </>
        }
      >
        {rows.length === 0 ? (
          <Empty icon={Users} title="Tidak ada bagian yang cocok" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-[13px]">
              <thead className="bg-mist text-[11px] uppercase tracking-[0.08em] text-muted">
                <tr>
                  <th className="py-2.5 pl-5 pr-2 font-semibold">No</th>
                  <th className="px-3 py-2.5 font-semibold">Bagian</th>
                  <th className="px-3 py-2.5 font-semibold">Ketua</th>
                  <th className="px-3 py-2.5 font-semibold">Sekretaris</th>
                  <th className="px-3 py-2.5 font-semibold">Pembimbing</th>
                  <th className="px-3 py-2.5 font-semibold">Kode / sandi</th>
                  <th className="py-2.5 pl-3 pr-5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((d) => (
                  <tr key={d.id} className={d.is_active === false ? 'opacity-55' : ''}>
                    <td className="py-2.5 pl-5 pr-2 font-semibold text-muted tabular-nums">{d.no}</td>
                    <td className="px-3 py-2.5 font-semibold text-ink">{d.nama}</td>
                    <td className="px-3 py-2.5">
                      <p className="text-ink">{d.ketua_nama || '—'}</p>
                      <p className="text-[12px] text-muted tabular-nums">{d.ketua_wa ? formatWa(d.ketua_wa) : 'WA kosong'}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-ink">{d.sekretaris_nama || '—'}</p>
                      <p className="text-[12px] text-muted tabular-nums">{d.sekretaris_wa ? formatWa(d.sekretaris_wa) : 'WA kosong'}</p>
                    </td>
                    <td className="px-3 py-2.5 text-ink">{d.pembimbing_nama || '—'}</td>
                    <td className="px-3 py-2.5">
                      {(() => {
                        const c = codeOf.get(d.id);
                        return (
                          <div className="flex flex-col items-start gap-1">
                            {c ? (
                              <span className="font-mono text-[13px] font-semibold tracking-[0.14em] text-ink">{reveal ? c.kode : '••••••'}</span>
                            ) : d.has_access_code ? (
                              <Badge tone="ok" icon={Key}>diatur</Badge>
                            ) : (
                              <Badge>{access?.kode_awal ? 'kode awal' : 'belum'}</Badge>
                            )}
                            <span className="flex flex-wrap gap-1">
                              {d.kode_pribadi_at ? <Badge tone="ok">dibuat bagian</Badge> : c ? <Badge>dari admin</Badge> : null}
                              {d.profil_at ? <Badge tone="brand">kontak ✓</Badge> : null}
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-2.5 pl-3 pr-5 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Building2}
                          onClick={() => {
                            actions.setDashboardDeptId(d.id);
                            go?.('saya');
                          }}
                        >
                          Dasbor
                        </Button>
                        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEdit(d)}>Ubah</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {edit && <EditModal dept={edit} onClose={() => setEdit(null)} />}
      <AccessCodesModal open={codesOpen} onClose={() => setCodesOpen(false)} />
      <ImportDepartmentsModal open={importOpen} onClose={() => setImportOpen(false)} />
      <ImportTeachersModal open={teachersOpen} onClose={() => setTeachersOpen(false)} />
    </div>
  );
}
