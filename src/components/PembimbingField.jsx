import React, { useEffect, useState } from 'react';
import { Input, Select } from './ui.jsx';

const LAIN = '__lain__';
const same = (a, b) => String(a || '').replace(/\s+/g, ' ').trim().toLowerCase() === String(b || '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Pilihan Pembimbing Bagian dari daftar admin, dengan opsi "Lainnya" untuk diketik manual. */
export default function PembimbingField({ id, value, onChange, options = [] }) {
  const match = options.find((o) => same(o, value));
  // "Lainnya" dipilih eksplisit, atau nama tersimpan tidak ada di daftar.
  const [forceManual, setForceManual] = useState(false);
  const manual = forceManual ? !match : Boolean(value) && !match;

  // Samakan penulisan dengan daftar (huruf besar/kecil, spasi).
  useEffect(() => {
    if (match && match !== value) onChange(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match]);

  if (!options.length) {
    return <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Nama Pembimbing Bagian" />;
  }
  return (
    <div className="flex flex-col gap-2">
      <Select
        id={id}
        value={manual ? LAIN : match || ''}
        onChange={(e) => {
          const v = e.target.value;
          if (v === LAIN) {
            setForceManual(true);
            if (match) onChange('');
          } else {
            setForceManual(false);
            onChange(v);
          }
        }}
      >
        <option value="">— Pilih Pembimbing Bagian —</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={LAIN}>Lainnya (ketik manual)…</option>
      </Select>
      {manual && <Input id={`${id}-lain`} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Ketik nama Pembimbing Bagian" />}
    </div>
  );
}
