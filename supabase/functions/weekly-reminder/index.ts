// =====================================================================
//  Edge Function: weekly-reminder
//  Dipanggil pg_cron setiap pagi (lihat migrasi 3) atau oleh admin dari
//  Panel Admin. Dua tugas:
//   1. Membuka periode bulan baru otomatis sehari setelah tenggat tanggal 5
//      (laporan bulan M dikumpulkan sampai 5 bulan M+1; lihat planCycleRollover).
//      Input softfile bulan baru itu sendiri baru dibuka tanggal 20 Hijriah.
//   2. Pada hari pergantian minggu (tgl 1, 8, 15, 22 Hijriah) menyiapkan
//      antrean pengingat WA sesuai agenda rundown.
//  Pesan tidak dikirim di sini — admin mengirimnya manual (human-in-the-loop).
//
//  Deploy:  supabase functions deploy weekly-reminder --no-verify-jwt
//  Otorisasi pg_cron: token dicocokkan ke secret Vault `cron_secret`
//  (lihat migrasi 4). CRON_SECRET di env fungsi bersifat opsional.
//  Opsional: supabase secrets set PORTAL_URL=https://<situs-anda>.netlify.app
// =====================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  computeWeek,
  daysBetween,
  planReminderQueue,
  prevHijriMonth,
} from '../_shared/rundown.js';
import { planCycleRollover } from '../_shared/hijri.js';

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

type Dept = {
  id: string; no: number; nama: string; is_active: boolean;
  ketua_nama: string | null; ketua_wa: string | null;
  sekretaris_nama: string | null; sekretaris_wa: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Gunakan POST' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
  const PORTAL_URL = Deno.env.get('PORTAL_URL') ?? 'https://neolaporanbulanan.netlify.app';

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // --- Otorisasi: secret pg_cron (env atau Vault) ATAU admin yang sedang login ---
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  let source: 'cron' | 'admin' = 'cron';
  let isCron = Boolean(CRON_SECRET) && token === CRON_SECRET;
  if (!isCron && token) {
    const { data: ok } = await db.rpc('check_cron_secret', { p_token: token });
    isCron = ok === true;
  }
  if (!isCron) {
    const asUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: isAdmin, error } = await asUser.rpc('is_admin');
    if (error || isAdmin !== true) return json({ error: 'Tidak berwenang' }, 401);
    source = 'admin';
  }

  let body: { force?: boolean; week?: number } = {};
  try { body = await req.json(); } catch { /* body opsional */ }

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

  // --- 1. Buka periode bulan baru bila tenggat siklus aktif sudah lewat ---
  const { data: active0, error: aErr } = await db
    .from('monthly_cycles').select('*').eq('status', 'aktif').maybeSingle();
  if (aErr) return json({ error: aErr.message }, 500);
  let opened: string | null = null;
  const { data: latest } = await db
    .from('monthly_cycles').select('*')
    .order('hijri_year', { ascending: false }).order('hijri_month', { ascending: false })
    .limit(1).maybeSingle();
  const { data: latestActivated } = await db
    .from('monthly_cycles').select('*').not('activated_at', 'is', null)
    .order('hijri_year', { ascending: false }).order('hijri_month', { ascending: false })
    .limit(1).maybeSingle();
  const plan = planCycleRollover({ active: active0, latest, latestActivated, today });
  if (plan) {
    const { error: oErr } = await db.rpc('open_cycle_auto', {
      p_hijri_month: plan.hijri_month,
      p_hijri_year: plan.hijri_year,
      p_masehi_label: plan.masehi_label,
      p_start_date: plan.start_date,
      p_end_date: plan.end_date,
      p_deadline: plan.deadline_date,
      p_ta_masehi: plan.ta_masehi,
      p_ta_hijri: plan.ta_hijri,
      p_input_open: plan.input_open_date,
    });
    if (oErr) return json({ error: `Gagal membuka periode otomatis: ${oErr.message}` }, 500);
    opened = `${plan.hijri_month}/${plan.hijri_year} (${plan.start_date} s.d. ${plan.end_date}, input dibuka ${plan.input_open_date}, tenggat ${plan.deadline_date})`;
  }

  // --- 2. Siklus aktif & minggu rundown ---
  const { data: cycle, error: cErr } = await db
    .from('monthly_cycles').select('*').eq('status', 'aktif').maybeSingle();
  if (cErr) return json({ error: cErr.message }, 500);
  // open_cycle_auto tidak mengambil alih bulan yang pernah aktif: bila siklus aktif
  // tidak berubah, tidak ada bulan yang dibuka.
  if (opened && cycle && active0 && cycle.id === active0.id) opened = null;
  if (!cycle) return json({ skipped: 'Belum ada periode bulan aktif', opened });

  const week = body.week && body.week >= 1 && body.week <= 4 ? body.week : computeWeek(cycle, today);
  const dayIndex = daysBetween(cycle.start_date, today);
  const isWeekChange = [0, 7, 14, 21].includes(dayIndex);

  const { count: existing } = await db
    .from('notification_queue')
    .select('id', { count: 'exact', head: true })
    .eq('cycle_id', cycle.id)
    .eq('week', week);

  if (!body.force && !isWeekChange && (existing ?? 0) > 0) {
    return json({ skipped: 'Antrean minggu ini sudah tersedia', week, existing, opened });
  }

  // --- Data pendukung ---
  const prev = prevHijriMonth(cycle.hijri_month, cycle.hijri_year);
  const [deptRes, repRes, prevCycleRes] = await Promise.all([
    db.from('departments')
      .select('id,no,nama,is_active,ketua_nama,ketua_wa,sekretaris_nama,sekretaris_wa')
      .eq('is_active', true).order('no'),
    db.from('monthly_reports').select('department_id,submitted_at').eq('cycle_id', cycle.id),
    db.from('monthly_cycles').select('*').eq('hijri_month', prev.month).eq('hijri_year', prev.year).maybeSingle(),
  ]);
  if (deptRes.error) return json({ error: deptRes.error.message }, 500);

  const departments = (deptRes.data ?? []) as Dept[];
  const reportByDept = new Map((repRes.data ?? []).map((r) => [r.department_id, r]));
  const prevCycle = prevCycleRes.data ?? null;

  const prevReportByDept = new Map();
  const targetsByDept = new Map();
  if (prevCycle) {
    const { data: prevReports } = await db
      .from('monthly_reports')
      .select('department_id,submitted_at,priority_programs(judul,kategori,target,urutan)')
      .eq('cycle_id', prevCycle.id);
    for (const r of prevReports ?? []) {
      prevReportByDept.set(r.department_id, r);
      const progs = [...(r.priority_programs ?? [])].sort((a, b) => a.urutan - b.urutan);
      targetsByDept.set(r.department_id, progs);
    }
  }

  const items = planReminderQueue({
    week, cycle, prevCycle, departments, reportByDept, prevReportByDept, targetsByDept, today,
    portalUrl: PORTAL_URL,
  }).map((it) => ({ ...it, cycle_id: cycle.id, source }));

  if (!items.length) return json({ week, queued: 0, opened, note: 'Tidak ada bagian yang perlu diingatkan' });

  // Antrean yang sudah ada tidak ditimpa (status terkirim tetap terjaga)
  const { error: qErr, count } = await db
    .from('notification_queue')
    .upsert(items, { onConflict: 'cycle_id,department_id,week,target_role', ignoreDuplicates: true, count: 'exact' });
  if (qErr) return json({ error: qErr.message }, 500);

  return json({ week, today, source, opened, queued: count ?? items.length, considered: items.length });
});
