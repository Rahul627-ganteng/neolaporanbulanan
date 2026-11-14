import React, { useEffect, useState } from 'react';
import { Building2, Lock, LogIn } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { Button, Callout, Field, Input, Modal, Segmented, Select } from './ui.jsx';

function BagianLogin({ onDone }) {
  const { actions, activeDepartments, mode } = useStore();
  const [dept, setDept] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!dept) return setErr('Pilih bagian terlebih dahulu.');
    setBusy(true);
    setErr('');
    try {
      const s = await actions.bagianLogin(dept, password, remember);
      setPassword('');
      actions.notify(`Ahlan wa sahlan, ${s.department.nama}.`);
      onDone(s);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <form id="login-bagian-form" onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Bagian">
        <Select id="login-dept" required value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">— Pilih bagian —</option>
          {activeDepartments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.no}. {d.nama}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Kode akses bagian" hint="Masuk pertama kali: pakai kode awal bersama dari admin (sama untuk semua bagian) atau kode bagian yang dikirim admin. Setelah itu pakai kode buatan bagian sendiri.">
        <Input
          id="login-bagian-password"
          type="password"
          autoComplete="current-password"
          autoCapitalize="characters"
          spellCheck={false}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] text-ink">
        <input type="checkbox" className="size-4 accent-[#1D4ED8]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Ingat perangkat ini selama 30 hari
      </label>
      {err && <Callout tone="error">{err}</Callout>}
      {mode === 'demo' && <Callout tone="info">Mode demo: pilih bagian mana saja, kode awal bersama <strong>DEMO123</strong>.</Callout>}
      <Button type="submit" variant="primary" icon={LogIn} busy={busy}>
        Masuk sebagai bagian
      </Button>
    </form>
  );
}

function AdminLogin({ onDone }) {
  const { actions } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await actions.signIn(email.trim(), password);
      setPassword('');
      onDone();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form id="login-form" onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Email">
        <Input id="login-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Kata sandi">
        <Input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {err && <Callout tone="error">{err}</Callout>}
      <p className="text-[12.5px] text-muted">Untuk pengelola Sektor Guru KMI. Admin berikutnya ditambahkan dari menu Periode & Admin.</p>
      <Button type="submit" variant="primary" icon={Lock} busy={busy}>
        Masuk sebagai admin
      </Button>
    </form>
  );
}

export default function LoginModal({ open, onClose, initial = 'bagian', onBagian }) {
  const { mode } = useStore();
  const [kind, setKind] = useState(initial);
  useEffect(() => {
    if (open) setKind(mode === 'demo' ? 'bagian' : initial);
  }, [open, initial, mode]);

  return (
    <Modal open={open} onClose={onClose} title={kind === 'bagian' ? 'Masuk akun bagian' : 'Masuk sebagai admin'} eyebrow="Portal Laporan Bulanan" size="sm">
      <div className="flex flex-col gap-4">
        {mode === 'supabase' && (
          <Segmented
            label="Jenis akun"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'bagian', label: 'Bagian' },
              { value: 'admin', label: 'Admin' },
            ]}
          />
        )}
        {kind === 'bagian' ? (
          <>
            <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted">
              <Building2 className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              Akun bagian membuka dasbor laporan bagian Anda: riwayat, program kerja, evaluasi, catatan admin, dan pengingat rundown. Formulir laporan juga tidak meminta kode lagi.
            </p>
            <BagianLogin
              onDone={(s) => {
                onClose();
                onBagian?.(s);
              }}
            />
          </>
        ) : (
          <AdminLogin onDone={onClose} />
        )}
      </div>
    </Modal>
  );
}
