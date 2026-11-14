-- =====================================================================
--  Migrasi 12 — Bagian Sekretaris Wakil Pengasuh & daftar Pembimbing
--   1. Bagian baru "Sekretaris Wakil Pengasuh" di nomor 4; bagian lama
--      nomor 4 dst. bergeser satu (data laporan & kode terikat ke id, bukan
--      nomor). Siklus aktif langsung mendapat baris laporannya.
--   2. Daftar Pembimbing Bagian (portal_settings.pembimbing) untuk pilihan
--      di login pertama, formulir, dan Data Bagian. DATA TIDAK DI REPO:
--      diisi admin di Data Bagian → Daftar Pembimbing.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Sekretaris Wakil Pengasuh = bagian nomor 4 (idempoten)
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.departments where nama = 'Sekretaris Wakil Pengasuh') then
    -- Dua langkah agar tidak bentrok dengan unique (no).
    update public.departments set no = no + 1000 where no >= 4;
    update public.departments set no = no - 999 where no >= 1004;
    insert into public.departments (no, nama) values (4, 'Sekretaris Wakil Pengasuh') returning id into v_id;
    insert into public.monthly_reports (cycle_id, department_id)
    select c.id, v_id from public.monthly_cycles c where c.status = 'aktif'
    on conflict (cycle_id, department_id) do nothing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Daftar Pembimbing Bagian
-- ---------------------------------------------------------------------
alter table public.portal_settings
  add column if not exists pembimbing jsonb not null default '[]'::jsonb;
alter table public.portal_settings drop constraint if exists portal_settings_pembimbing_array;
alter table public.portal_settings
  add constraint portal_settings_pembimbing_array check (jsonb_typeof(pembimbing) = 'array');

create or replace function public.set_pembimbing_options(p_list jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_list jsonb;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat mengatur daftar Pembimbing' using errcode = '42501';
  end if;
  if jsonb_typeof(p_list) is distinct from 'array' then
    raise exception 'Daftar Pembimbing harus berupa larik';
  end if;
  select coalesce(jsonb_agg(n order by ord), '[]'::jsonb) into v_list
    from (
      select distinct on (lower(n)) n, ord
        from (
          select btrim(regexp_replace(e #>> '{}', '\s+', ' ', 'g')) as n, ord
            from jsonb_array_elements(p_list) with ordinality as x(e, ord)
           where jsonb_typeof(e) = 'string'
        ) s
       where n <> ''
       order by lower(n), ord
    ) u;
  update public.portal_settings set pembimbing = v_list, updated_at = now() where id;
  return v_list;
end;
$$;
revoke all on function public.set_pembimbing_options(jsonb) from public, anon;
grant execute on function public.set_pembimbing_options(jsonb) to authenticated;

-- form_context kini juga mengembalikan daftar Pembimbing.
create or replace function public.form_context(p_department_id uuid default null, p_secret text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin boolean := public.is_admin();
  v_token boolean := false;
  v_ok    boolean;
  v_hash  text;
begin
  v_ok := v_admin;
  if not v_ok and p_department_id is not null then
    if public.department_session(p_secret, true) = p_department_id then
      v_ok := true;
      v_token := true;
    else
      select access_code_hash into v_hash from public.departments where id = p_department_id and is_active;
      v_ok := v_hash is not null and extensions.crypt(upper(btrim(coalesce(p_secret, ''))), v_hash) = v_hash;
    end if;
  end if;
  if not v_ok then
    raise exception 'Kode akses bagian tidak sesuai' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'department', (
      select jsonb_build_object('id', d.id, 'ketua_nama', d.ketua_nama, 'sekretaris_nama', d.sekretaris_nama, 'pembimbing_nama', d.pembimbing_nama)
             || case when v_admin or v_token
                     then jsonb_build_object('ketua_wa', d.ketua_wa, 'sekretaris_wa', d.sekretaris_wa, 'profil_at', d.profil_at, 'kode_pribadi_at', d.kode_pribadi_at)
                     else '{}'::jsonb end
      from public.departments d where d.id = p_department_id
    ),
    'teachers', coalesce((
      select jsonb_agg(jsonb_build_object('nama', t.nama, 'tahun', t.tahun, 'kelompok', t.kelompok) order by t.urutan, t.nama)
      from public.teachers t where t.is_active
    ), '[]'::jsonb),
    'pembimbing', coalesce((select pembimbing from public.portal_settings where id), '[]'::jsonb)
  );
end;
$$;
