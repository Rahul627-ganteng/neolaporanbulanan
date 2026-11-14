// Sesi akun bagian di peramban. Yang disimpan hanya token acak (bukan sandi);
// database menyimpan hash-nya dan mencabutnya saat sandi bagian diganti.
// "Ingat perangkat ini" → localStorage; selain itu sessionStorage (hilang saat tab ditutup).

const KEY = 'kmi-bagian-sesi-v1';

function stores() {
  const out = [];
  try {
    if (typeof localStorage !== 'undefined') out.push(localStorage);
  } catch {
    /* penyimpanan diblokir */
  }
  try {
    if (typeof sessionStorage !== 'undefined') out.push(sessionStorage);
  } catch {
    /* penyimpanan diblokir */
  }
  return out;
}

export function loadBagianSession() {
  for (const s of stores()) {
    try {
      const raw = s.getItem(KEY);
      if (!raw) continue;
      const v = JSON.parse(raw);
      if (v?.token && v?.department?.id && (!v.expires_at || Date.parse(v.expires_at) > Date.now())) return v;
      s.removeItem(KEY);
    } catch {
      /* abaikan */
    }
  }
  return null;
}

export function saveBagianSession(session, remember = true) {
  clearBagianSession();
  const [local, temp] = [
    (() => {
      try {
        return localStorage;
      } catch {
        return null;
      }
    })(),
    (() => {
      try {
        return sessionStorage;
      } catch {
        return null;
      }
    })(),
  ];
  const target = remember ? local || temp : temp || local;
  try {
    target?.setItem(KEY, JSON.stringify(session));
  } catch {
    /* sesi tetap berlaku sampai halaman dimuat ulang */
  }
}

export function clearBagianSession() {
  for (const s of stores()) {
    try {
      s.removeItem(KEY);
    } catch {
      /* abaikan */
    }
  }
}

export const isExpiredSessionError = (e) => /Sesi bagian berakhir/i.test(e?.message || String(e || ''));
