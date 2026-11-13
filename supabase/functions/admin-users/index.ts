// =====================================================================
//  Edge Function: admin-users
//  Kelola akun admin portal dari aplikasi tanpa membuka dashboard Supabase.
//  Hanya admin yang sedang login yang boleh memanggil.
//
//  POST { action: 'create', email, catatan? }
//    → email masuk daftar admin; bila belum punya akun, akun dibuat dengan
//      kata sandi sementara (dikembalikan sekali, untuk diserahkan langsung).
//  POST { action: 'reset', email }
//    → kata sandi sementara baru untuk admin yang lupa kata sandi.
//
//  Deploy: supabase functions deploy admin-users --no-verify-jwt
//  (fungsi memeriksa sendiri JWT & status admin pemanggil)
// =====================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Sandi sementara 12 karakter tanpa huruf/angka yang mirip.
function tempPassword(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

async function findUserByEmail(db: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Gunakan POST' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!/^Bearer\s+\S+/i.test(authHeader)) return json({ error: 'Silakan masuk sebagai admin' }, 401);
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: isAdmin, error: aErr } = await asUser.rpc('is_admin');
  if (aErr || isAdmin !== true) return json({ error: 'Hanya admin yang dapat mengelola akun admin' }, 403);

  let body: { action?: string; email?: string; catatan?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body JSON tidak valid' }, 400);
  }
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Alamat email tidak valid' }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    if (body.action === 'create') {
      let user = await findUserByEmail(db, email);
      let password: string | null = null;
      if (!user) {
        password = tempPassword();
        const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
        if (error) throw error;
        user = data.user;
      }
      // Trigger on_admin_email_added memberi hak admin ke akun dengan email ini.
      const { error: insErr } = await db
        .from('app_admin_emails')
        .upsert({ email, catatan: (body.catatan ?? '').trim() || null }, { onConflict: 'email' });
      if (insErr) throw insErr;
      return json({ email, created: Boolean(password), password });
    }

    if (body.action === 'reset') {
      const { data: listed } = await db.from('app_admin_emails').select('email').eq('email', email).maybeSingle();
      if (!listed) return json({ error: 'Email ini tidak terdaftar sebagai admin' }, 404);
      const user = await findUserByEmail(db, email);
      if (!user) return json({ error: 'Akun untuk email ini belum ada' }, 404);
      const password = tempPassword();
      const { error } = await db.auth.admin.updateUserById(user.id, { password });
      if (error) throw error;
      return json({ email, password });
    }

    return json({ error: 'Aksi tidak dikenal' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message ?? String(e) }, 500);
  }
});
