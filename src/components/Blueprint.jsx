import React, { useMemo, useState } from 'react';
import { Archive, Copy, Database, FileCode2, GitBranch, Globe } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { buildZip } from '../lib/exports.js';
import { copyText, saveFile } from '../lib/files.js';
import { Button, cx, Empty, Panel } from './ui.jsx';

const STEPS = [
  { icon: GitBranch, title: 'Push ke GitHub', body: 'Unggah repositori ini ke GitHub dan isi Secrets: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, CRON_SECRET, NETLIFY_AUTH_TOKEN, NETLIFY_SITE_ID.' },
  { icon: Database, title: 'Migrasi Supabase otomatis', body: 'GitHub Actions menjalankan supabase db push (skema, seed 48 bagian, pg_cron), men-deploy Edge Function weekly-reminder, dan menyetel secret CRON_SECRET.' },
  { icon: Globe, title: 'Live di Netlify', body: 'Build Vite diuji di CI lalu dirilis ke Netlify memakai netlify.toml (SPA redirect, header keamanan, cache aset).' },
];

export default function Blueprint() {
  const { actions } = useStore();
  const files = useMemo(() => (typeof window !== 'undefined' && window.__KMI_BLUEPRINT__) || [], []);
  const [active, setActive] = useState(files[0]?.path);
  const [busy, setBusy] = useState(false);
  const file = files.find((f) => f.path === active);

  if (!files.length) return <Empty icon={FileCode2} title="Blueprint hanya disertakan di prototipe" />;

  const downloadZip = async () => {
    setBusy(true);
    try {
      const zip = await buildZip(files.map((f) => ({ name: `kmi-laporan-bulanan/${f.path}`, data: f.content })));
      const res = await saveFile('kmi-laporan-bulanan-repo.zip', zip);
      if (res === 'saved') actions.notify('Repositori lengkap siap diunduh.');
    } catch (e) {
      actions.notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Panel
        eyebrow="Supabase + GitHub Actions + Netlify"
        title="Automated Production Blueprint"
        actions={<Button variant="primary" icon={Archive} busy={busy} onClick={downloadZip}>Unduh repositori (.zip)</Button>}
      >
        <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-1.5 rounded-xl border border-line p-4">
              <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-brand">
                <s.icon className="size-4" /> Langkah {i + 1}
              </span>
              <p className="font-serif text-[16px] font-semibold text-ink">{s.title}</p>
              <p className="text-[13px] leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <nav className="flex flex-col gap-1 rounded-[14px] border border-line bg-white p-2" aria-label="Berkas blueprint">
          {files.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => setActive(f.path)}
              className={cx(
                'flex flex-col items-start rounded-lg px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-brand',
                f.path === active ? 'bg-navy text-white' : 'hover:bg-sky-wash'
              )}
            >
              <span className="break-all font-mono text-[12.5px] font-medium">{f.path}</span>
              {f.note && <span className={cx('text-[11.5px]', f.path === active ? 'text-blue-200' : 'text-muted')}>{f.note}</span>}
            </button>
          ))}
        </nav>
        {file && (
          <section className="flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-line bg-white">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <span className="break-all font-mono text-[13px] font-semibold text-ink">{file.path}</span>
              <Button size="sm" icon={Copy} onClick={async () => actions.notify((await copyText(file.content)) ? `${file.path} tersalin.` : 'Salin otomatis ditolak; blok kode lalu salin manual.')}>
                Salin
              </Button>
            </header>
            <pre className="max-h-[70vh] overflow-auto bg-[#0B1220] p-4 font-mono text-[12.5px] leading-relaxed text-[#DCE6F5]">
              <code>{file.content}</code>
            </pre>
          </section>
        )}
      </div>
    </div>
  );
}
