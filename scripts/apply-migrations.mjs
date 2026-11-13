// =====================================================================
//  Terapkan migrasi supabase/migrations/*.sql lewat Supabase Management API.
//  Tidak butuh kata sandi database — cukup SUPABASE_ACCESS_TOKEN dan
//  SUPABASE_PROJECT_REF (dipakai GitHub Actions).
//
//  Riwayat dicatat di supabase_migrations.schema_migrations (tabel yang sama
//  dengan Supabase CLI & konektor), jadi migrasi yang sudah diterapkan dengan
//  cara lain tidak dijalankan ulang.
//
//  Pakai:  node scripts/apply-migrations.mjs [--dry-run]
// =====================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'supabase/migrations');
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
const dryRun = process.argv.includes('--dry-run');

if (!token || !ref) {
  console.error('SUPABASE_ACCESS_TOKEN dan SUPABASE_PROJECT_REF wajib diisi.');
  process.exit(1);
}

async function query(sql) {
  const res = await fetch(`${process.env.SUPABASE_API_URL || 'https://api.supabase.com'}/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : [];
}

const literal = (s) => {
  let tag = 'mig';
  while (s.includes(`$${tag}$`)) tag += 'x';
  return `$${tag}$${s}$${tag}$`;
};

await query(`
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version text primary key, statements text[], name text
  );
`);
const applied = new Set((await query('select version from supabase_migrations.schema_migrations')).map((r) => r.version));

const files = fs.readdirSync(dir).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
let count = 0;
for (const file of files) {
  const version = file.slice(0, 14);
  const name = file.slice(15, -4);
  if (applied.has(version)) {
    console.log(`  sudah  ${file}`);
    continue;
  }
  const sql = fs.readFileSync(path.join(dir, file), 'utf8');
  if (dryRun) {
    console.log(`  AKAN   ${file}`);
    continue;
  }
  // Satu permintaan = satu transaksi implisit: migrasi & catatan riwayatnya
  // berhasil bersama atau gagal bersama.
  await query(
    `${sql}\n;\ninsert into supabase_migrations.schema_migrations (version, name, statements)
     values (${literal(version)}, ${literal(name)}, array[${literal(sql)}]);`
  );
  console.log(`  ✓      ${file}`);
  count += 1;
}

// Secret Vault untuk pg_cron (idempoten; fungsi dibuat di migrasi 4).
const [{ ok } = {}] = await query(
  "select exists (select 1 from pg_proc where proname = 'ensure_cron_setup') as ok"
);
if (ok && !dryRun) {
  await query(`select public.ensure_cron_setup('https://${ref}.supabase.co')`);
  console.log('  ✓      secret Vault pg_cron');
}

console.log(dryRun ? 'Dry run selesai.' : `${count} migrasi baru diterapkan.`);
