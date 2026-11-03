import { IS_DEMO } from '../env.js';

/** Pilih adapter: Supabase bila VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY terisi, selain itu Mode Demo. */
export async function createAdapter() {
  if (IS_DEMO) {
    const { createDemoAdapter } = await import('./demo-adapter.js');
    return createDemoAdapter();
  }
  const { createSupabaseAdapter } = await import('./supabase-adapter.js');
  return createSupabaseAdapter();
}
