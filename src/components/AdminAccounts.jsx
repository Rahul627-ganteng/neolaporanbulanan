import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Key, Lock, Trash2, UserPlus } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { formatTimestamp } from '../lib/hijri.js';
import { copyText } from '../lib/files.js';
import { PORTAL_URL } from '../lib/env.js';
import { Badge, Button, Callout, Field, Input, Panel } from './ui.jsx';

function TempPassword({ info, onDone }) {
  const { actions } = useStore();
  const text = `Akun admin Portal Laporan Bulanan KMI\nAlamat: ${PORTAL_URL || 'https://neolaporanbulanan.netlify.app'}\nEmail: ${info.email}\nKata sandi sementara: ${info.password}\nSetelah masuk, ganti kata sandi di menu Periode & Admin.`;
  return (
    <Callout tone="warn" title={`Kata sandi sementara untuk ${info.email}`}>
      <p>
        Serahkan langsung kepada pemilik akun; kata sandi ini tidak ditampilkan lagi.{' '}
        <span className="select-all rounded bg-white/70 px-1.5 py-0.5 font-mono text-[14px] font-bold tracking-wider text-ink">{info.password}</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" icon={Copy} onClick={async () => actions.notify((await copyText(text)) ? 'Info akun tersalin.' : 'Salin ditolak peramban.')}>
          Salin info akun
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Selesai</Button>
      </div>
    </Callout>
  );
}

export default function AdminAccounts() {
  const { actions, session, mode } = useStore();
  const [list, setList] = useState(null);
  const [email, setEmail] = useState('');
  const [catatan, setCatatan] = useState('');
  const [busy, setBusy] = useState('');
  const [temp, setTemp] = useState(null);
  const [confirm, setConfirm] = useState('');
  const [pw, setPw] = useState({ a: '', b: '' });
  const me = (session?.email || '').toLowerCase();

  const load = useCallback(async () => {
    try {
      setList(await actions.listAdmins());
    } catch (e) {
      setList([]);
      actions.notify(e.message, 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const add = async (e) => {
    e.preventDefault();
    setBusy('add');
    try {
      const out = await actions.addAdmin(email.trim().toLowerCase(), catatan.trim());
      if (out?.password) setTemp(out);
      else actions.notify(`${out?.email || email} sekarang admin. Akun ini sudah ada, jadi kata sandinya tetap.`);
      setEmail('');
      setCatatan('');
      await load();
    } catch {
      /* toast tampil */
    } finally {
      setBusy('');
    }
  };

  const reset = async (target) => {
    setBusy(`reset:${target}`);
    try {
      setTemp(await actions.resetAdminPassword(target));
    } catch {
      /* toast tampil */
    } finally {
      setBusy('');
    }
  };

  const remove = async (target) => {
    setBusy(`rm:${target}`);
    try {
      await actions.removeAdmin(target);
      setConfirm('');
      await load();
    } catch {
      /* toast tampil */
    } finally {
      setBusy('');
    }
  };

  const changePw = async (e) => {
    e.preventDefault();
    if (pw.a.length < 8) return actions.notify('Kata sandi minimal 8 karakter.', 'error');
    if (pw.a !== pw.b) return actions.notify('Kedua kata sandi tidak sama.', 'error');
    setBusy('pw');
    try {
      await actions.changePassword(pw.a);
      setPw({ a: '', b: '' });
    } catch {
      /* toast tampil */
    } finally {
      setBusy('');
    }
    return undefined;
  };

  return (
    <Panel eyebrow="Pengelola portal" title="Akun admin" bodyClass="flex flex-col gap-5">
      {temp && <TempPassword info={temp} onDone={() => setTemp(null)} />}

      {list === null ? (
        <p className="text-[13px] text-muted">Memuat daftar admin…</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((a) => {
            const self = a.email === me;
            return (
              <li key={a.email} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="break-all text-[14px] font-semibold text-ink">
                    {a.email} {self && <Badge tone="brand">Anda</Badge>}
                  </p>
                  <p className="text-[12px] text-muted">
                    {a.catatan || 'Admin'} · {a.punya_akun ? (a.terakhir_masuk ? `masuk terakhir ${formatTimestamp(a.terakhir_masuk)}` : 'belum pernah masuk') : 'akun belum dibuat'}
                  </p>
                </div>
                {!self && (
                  <div className="flex gap-1">
                    {a.punya_akun && (
                      <Button size="sm" variant="ghost" icon={Key} busy={busy === `reset:${a.email}`} onClick={() => reset(a.email)}>
                        Sandi baru
                      </Button>
                    )}
                    {confirm === a.email ? (
                      <Button size="sm" variant="danger" icon={Trash2} busy={busy === `rm:${a.email}`} onClick={() => remove(a.email)}>
                        Ya, cabut
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirm(a.email)} aria-label={`Cabut hak admin ${a.email}`} />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={add} className="flex flex-col gap-3 border-t border-line pt-4">
        <p className="text-[13px] font-semibold text-ink">Tambah admin</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Email">
            <Input id="adm-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@gontor.ac.id" />
          </Field>
          <Field label="Keterangan">
            <Input id="adm-note" value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="mis. Staf Sekretaris Wakil Pengasuh" />
          </Field>
        </div>
        <p className="text-[12.5px] text-muted">
          Bila email belum punya akun, akun dibuat dengan kata sandi sementara yang ditampilkan sekali di sini.
        </p>
        <div>
          <Button type="submit" variant="primary" icon={UserPlus} busy={busy === 'add'}>Tambah admin</Button>
        </div>
      </form>

      {mode === 'supabase' && (
        <form onSubmit={changePw} className="flex flex-col gap-3 border-t border-line pt-4">
          <p className="text-[13px] font-semibold text-ink">Ganti kata sandi saya</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Kata sandi baru">
              <Input id="pw-new" type="password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw((x) => ({ ...x, a: e.target.value }))} />
            </Field>
            <Field label="Ulangi">
              <Input id="pw-new2" type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw((x) => ({ ...x, b: e.target.value }))} />
            </Field>
          </div>
          <div>
            <Button type="submit" icon={Lock} busy={busy === 'pw'}>Simpan kata sandi</Button>
          </div>
        </form>
      )}
    </Panel>
  );
}
