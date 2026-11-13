-- Fungsi event trigger bawaan Supabase (ensure_rls) tidak perlu dapat dipanggil
-- lewat /rest/v1/rpc oleh anon/authenticated (saran Supabase Advisor 0028/0029).
-- Event trigger tetap berjalan: pemanggilannya tidak memeriksa hak EXECUTE.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable' and p.pronargs = 0
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
