import React, { useMemo, useState } from 'react';
import { Key, Pencil, Plus, Search, Users } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { formatWa, normalizeWa } from '../lib/constants.js';
import { Badge, Button, Callout, Empty, Field, Input, Modal, Panel } from './ui.jsx';

function EditModal({ dept, onClose }) {
  const { actions, mode } = useStore();
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
        <Field label="Nama Ketua Bagian"><Input id="d-ketua" value={d.ketua_nama || ''} onChange={set('ketua_nama')} placeholder="Ust. …" /></Field>
        <Field label="WA Ketua" hint={waBad(d.ketua_wa) ? 'Format tidak valid' : d.ketua_wa ? `Disimpan sebagai ${normalizeWa(d.ketua_wa)}` : 'Contoh 0812xxxxxxx'}>
          <Input id="d-ketua-wa" inputMode="tel" value={d.ketua_wa || ''} onChange={set('ketua_wa')} />
        </Field>
        <Field label="Nama Sekretaris Bagian"><Input id="d-sek" value={d.sekretaris_nama || ''} onChange={set('sekretaris_nama')} placeholder="Ust. …" /></Field>
        <Field label="WA Sekretaris" hint={waBad(d.sekretaris_wa) ? 'Format tidak valid' : d.sekretaris_wa ? `Disimpan sebagai ${normalizeWa(d.sekretaris_wa)}` : 'Contoh 0812xxxxxxx'}>
          <Input id="d-sek-wa" inputMode="tel" value={d.sekretaris_wa || ''} onChange={set('sekretaris_wa')} />
        </Field>
        <Field label="Nama Pembimbing Bagian" className="sm:col-span-2"><Input id="d-pemb" value={d.pembimbing_nama || ''} onChange={set('pembimbing_nama')} placeholder="Ust. …" /></Field>
        {dept.id && (
          <Field
            label={dept.has_access_code ? 'Ganti kode akses input laporan' : 'Atur kode akses input laporan'}
            hint={mode === 'demo' ? 'Di Mode Demo kode tidak diperiksa.' : 'Minimal 6 karakter. Disimpan sebagai hash; berikan kepada Sekretaris Bagian.'}
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

export default function Departments() {
  const { departments, mode } = useStore();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return departments.filter((d) => !n || [d.nama, d.ketua_nama, d.sekretaris_nama, d.pembimbing_nama].join(' ').toLowerCase().includes(n));
  }, [departments, q]);
  const filled = departments.filter((d) => d.ketua_wa && d.sekretaris_wa).length;

  return (
    <div className="flex flex-col gap-4">
      {mode === 'demo' && (
        <Callout tone="info" title="Nama di bawah adalah data contoh">
          Nomor WA sengaja dikosongkan. Isi dengan data asli di versi produksi; tombol pengingat akan memakai nomor tersebut.
        </Callout>
      )}
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
                  <th className="px-3 py-2.5 font-semibold">Kode akses</th>
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
                    <td className="px-3 py-2.5">{d.has_access_code ? <Badge tone="ok" icon={Key}>diatur</Badge> : <Badge>belum</Badge>}</td>
                    <td className="py-2.5 pl-3 pr-5 text-right">
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEdit(d)}>Ubah</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {edit && <EditModal dept={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
