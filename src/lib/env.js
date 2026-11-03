// Variabel lingkungan Vite. Di build artefak, import.meta.env diganti objek kosong
// sehingga aplikasi otomatis berjalan dalam Mode Demo.
const env = import.meta.env || {};

export const SUPABASE_URL = env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || '';
export const IS_DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;
export const IS_ARTIFACT = typeof window !== 'undefined' && Boolean(window.__KMI_ARTIFACT__);

export const PORTAL_URL =
  env.VITE_PORTAL_URL ||
  (typeof location !== 'undefined' && !IS_ARTIFACT && location.protocol.startsWith('http') ? location.origin : '');
