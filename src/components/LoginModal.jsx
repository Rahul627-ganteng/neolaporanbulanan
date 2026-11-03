import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { Button, Callout, Field, Input, Modal } from './ui.jsx';

export default function LoginModal({ open, onClose }) {
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
      onClose();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Masuk sebagai admin" eyebrow="Panel Admin" size="sm">
      <form id="login-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Email">
          <Input id="login-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Kata sandi">
          <Input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {err && <Callout tone="error">{err}</Callout>}
        <p className="text-[12.5px] text-muted">
          Akun admin dibuat oleh pengelola di dashboard Supabase. Sekretaris bagian tidak perlu akun: cukup kode akses bagian di menu Input Laporan.
        </p>
        <Button type="submit" variant="primary" icon={Lock} busy={busy}>
          Masuk
        </Button>
      </form>
    </Modal>
  );
}
