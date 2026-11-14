import React, { useEffect, useState } from 'react';
import { KeyRound, LogOut, Save, ShieldAlert } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { normalizeWa } from '../lib/constants.js';
import { Button, Callout, Field, Input, Modal } from './ui.jsx';
import NameCombobox from './NameCombobox.jsx';

const waOk = (v) => !v || /^62\d{8,13}$/.test(normalizeWa(v));
const toLocal = (wa) => (wa ? `0${String(wa).replace(/^62/, '')}` : '');

/**
 * Login pertama akun bagian (wajib, tidak bisa ditutup) atau ubah kontak dari dasbor.
 * Mengisi nama & nomor WA Ketua/Sekretaris yang bisa dihubungi, Pembimbing, dan
 * (saat masuk dengan kode awal bersama) kode akses milik bagian sendiri.
 */
export default function BagianSetup({ open, mode = 'first', onClose }) {
  const { bagian, teachers, actions } = useStore();
  const first = mode === 'first';
  const mustCode = first && Boolean(bagian?.kode_bersama);
  const [f, setF] = useState({ ketua_nama: '', ketua_wa: '', sekretaris_nama: '', sekretaris_wa: '', pembimbing_nama: '', kode: '', ulang: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: typeof v === 'string' ? v : v.target.value }));

  useEffect(() => {
    if (!open || !bagian) return;
    setErr('');
    actions
      .loadFormContext({ departmentId: bagian.department.id, secret: bagian.token })
      .then((ctx) => {
        const d = ctx?.department || {};
        setF((x) => ({
          ...x,
          ketua_nama: x.ketua_nama || d.ketua_nama || '',
          sekretaris_nama: x.sekretaris_nama || d.sekretaris_nama || '',
          pembimbing_nama: x.pembimbing_nama || d.pembimbing_nama || '',
          ketua_wa: x.ketua_wa || toLocal(d.ketua_wa),
          sekretaris_wa: x.sekretaris_wa || toLocal(d.sekretaris_wa),
        }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bagian?.token]);

  if (!bagian) return null;

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!f.ketua_nama.trim() && !f.sekretaris_nama.trim()) return setErr('Isi nama Ketua atau Sekretaris Bagian.');
    if (!waOk(f.ketua_wa) || !waOk(f.sekretaris_wa)) return setErr('Nomor WA tidak valid. Gunakan format 08xx atau 628xx.');
    if (!f.ketua_wa.trim() && !f.sekretaris_wa.trim()) return setErr('Isi minimal satu nomor WA yang bisa dihubungi.');
    const kode = f.kode.trim();
    if (mustCode && !kode) return setErr('Buat kode akses baru untuk bagian Anda.');
    if (kode && kode.length < 6) return setErr('Kode akses minimal 6 karakter.');
    if (kode && kode.toUpperCase() !== f.ulang.trim().toUpperCase()) return setErr('Kode baru dan ulangannya tidak sama.');
    setBusy(true);
    try {
      const out = await actions.bagianSetup(
        {
          ketua_nama: f.ketua_nama.trim(),
          ketua_wa: f.ketua_wa.trim(),
          sekretaris_nama: f.sekretaris_nama.trim(),
          sekretaris_wa: f.sekretaris_wa.trim(),
          pembimbing_nama: f.pembimbing_nama.trim(),
        },
        first ? kode : ''
      );
      actions.notify(out?.kode_diganti ? 'Data bagian tersimpan dan kode baru aktif. Gunakan kode ini untuk masuk berikutnya.' : 'Data kontak bagian tersimpan.');
      setF((x) => ({ ...x, kode: '', ulang: '' }));
      onClose?.();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!first}
      size="lg"
      eyebrow={bagian.department.nama}
      title={first ? 'Selamat datang — lengkapi data bagian' : 'Ubah kontak bagian'}
    >
      <form id="bagian-setup-form" onSubmit={submit} noValidate className="flex flex-col gap-5">
        {first && (
          <p className="text-[13.5px] leading-relaxed text-ink">
            Sekali ini saja, sebelum memakai portal: siapa Ketua dan Sekretaris bagian ini dan nomor WhatsApp yang bisa dihubungi admin Sektor Guru KMI
            (untuk pengingat laporan){mustCode ? ', lalu buat kode akses milik bagian sendiri' : ''}.
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nama Ketua Bagian">
            <NameCombobox id="setup-ketua" value={f.ketua_nama} onChange={set('ketua_nama')} options={teachers || []} placeholder="Nama Ketua Bagian" />
          </Field>
          <Field label="WA Ketua" hint="Contoh 0812xxxxxxx">
            <Input id="setup-ketua-wa" inputMode="tel" autoComplete="tel" value={f.ketua_wa} onChange={set('ketua_wa')} />
          </Field>
          <Field label="Nama Sekretaris Bagian">
            <NameCombobox id="setup-sek" value={f.sekretaris_nama} onChange={set('sekretaris_nama')} options={teachers || []} placeholder="Nama Sekretaris Bagian" />
          </Field>
          <Field label="WA Sekretaris" hint="Minimal satu nomor WA wajib diisi">
            <Input id="setup-sek-wa" inputMode="tel" autoComplete="tel" value={f.sekretaris_wa} onChange={set('sekretaris_wa')} />
          </Field>
          <Field label="Nama Pembimbing Bagian" className="sm:col-span-2">
            <Input id="setup-pemb" value={f.pembimbing_nama} onChange={set('pembimbing_nama')} placeholder="Nama Pembimbing Bagian" />
          </Field>
        </div>

        {first && (
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-mist px-4 py-4">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
              <KeyRound className="size-4 text-brand" aria-hidden />
              {mustCode ? 'Buat kode akses bagian Anda' : 'Ganti kode akses (opsional)'}
            </p>
            <p className="text-[13px] leading-relaxed text-muted">
              {mustCode
                ? 'Anda masuk dengan kode awal bersama. Buat kode sendiri (minimal 6 karakter, bebas) agar bagian lain tidak bisa masuk ke akun ini. Setelah ini kode bersama tidak berlaku lagi untuk bagian Anda.'
                : 'Kosongkan bila tetap memakai kode dari admin.'}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Kode baru">
                <Input id="setup-kode" type="password" autoComplete="new-password" autoCapitalize="characters" value={f.kode} onChange={set('kode')} />
              </Field>
              <Field label="Ulangi kode baru">
                <Input id="setup-kode2" type="password" autoComplete="new-password" autoCapitalize="characters" value={f.ulang} onChange={set('ulang')} />
              </Field>
            </div>
            <p className="flex items-start gap-2 text-[12.5px] leading-snug text-amber-900">
              <ShieldAlert className="mt-px size-4 shrink-0" aria-hidden />
              Kode ini tercatat di data admin Sektor Guru KMI agar bisa dibantu bila lupa. Jangan memakai kata sandi pribadi (email, bank, media sosial). Huruf besar/kecil tidak dibedakan.
            </p>
          </div>
        )}

        {err && <Callout tone="error">{err}</Callout>}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {first ? (
            <Button variant="ghost" icon={LogOut} onClick={actions.bagianLogout}>
              Keluar
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              Batal
            </Button>
          )}
          <Button type="submit" variant="primary" icon={Save} busy={busy}>
            {first ? 'Simpan & lanjutkan' : 'Simpan kontak'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
