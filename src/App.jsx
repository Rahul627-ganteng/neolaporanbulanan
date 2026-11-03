import React, { useEffect, useState } from 'react';
import {
  BarChart3, BellRing, CalendarRange, Code2, FileEdit, Inbox, LayoutDashboard, Lock, LogOut, RefreshCw, Users,
} from 'lucide-react';
import { useStore } from './lib/store.jsx';
import { cycleLabel, cycleMonthName, deadlineText, daysBetween, RUNDOWN } from './lib/constants.js';
import { formatHijri, formatMasehi } from './lib/hijri.js';
import { IS_ARTIFACT } from './lib/env.js';
import { Badge, Button, cx, Empty, Select, Toast } from './components/ui.jsx';
import Dashboard from './components/Dashboard.jsx';
import ReportForm from './components/ReportForm.jsx';
import Rundown from './components/Rundown.jsx';
import Reports from './components/Reports.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import Departments from './components/Departments.jsx';
import Periods, { OpenCycleModal } from './components/Periods.jsx';
import Blueprint from './components/Blueprint.jsx';
import LoginModal from './components/LoginModal.jsx';
import Emblem from './components/Emblem.jsx';

const TABS = [
  { id: 'dasbor', label: 'Dasbor', icon: LayoutDashboard, admin: false },
  { id: 'input', label: 'Input Laporan', icon: FileEdit, admin: false },
  { id: 'rundown', label: 'Rundown & Pengingat', icon: BellRing, admin: true },
  { id: 'laporan', label: 'Laporan Masuk', icon: Inbox, admin: true },
  { id: 'admin', label: 'Panel Admin', icon: BarChart3, admin: true },
  { id: 'bagian', label: 'Data Bagian', icon: Users, admin: true },
  { id: 'periode', label: 'Periode', icon: CalendarRange, admin: true },
  { id: 'blueprint', label: 'Blueprint Produksi', icon: Code2, admin: true, artifactOnly: true },
];

function useHashTab(allowed) {
  const read = () => {
    const h = (typeof location !== 'undefined' ? location.hash : '').replace('#', '');
    return allowed.includes(h) ? h : 'dasbor';
  };
  const [tab, setTab] = useState(read);
  useEffect(() => {
    const on = () => setTab(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed.join()]);
  const go = (id) => {
    setTab(id);
    try {
      if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
    } catch {
      /* sebagian penampil menolak replaceState */
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return [allowed.includes(tab) ? tab : 'dasbor', go];
}

function Header({ hero, go }) {
  const { today, viewCycle, isAdmin } = useStore();
  return (
    <header className={cx('kmi-header relative overflow-hidden text-white', hero && 'kmi-header--hero')}>
      <div className={cx('kmi-gutter relative mx-auto flex max-w-[1240px] flex-col justify-between gap-6', hero ? 'py-8 sm:py-12' : 'py-5 sm:py-6')}>
        <div className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 items-center gap-4">
            <Emblem className="size-12 shrink-0 sm:size-14" />
            <div className="min-w-0">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-blue-100/90">
                Sektor Guru KMI · Kulliyatu-l-Mu'allimin Al-Islamiyyah
              </p>
              <h1 className="font-serif text-[24px] font-semibold leading-tight sm:text-[30px]">Portal Laporan Bulanan</h1>
              <p className="mt-0.5 text-[13px] text-blue-50/85">
                Pondok Modern Darussalam Gontor Kampus 3 · Darul Ma'rifat, Sumbercangkring, Gurah, Kediri
              </p>
            </div>
          </div>
          <div className="hidden shrink-0 text-right md:block">
            <p className="font-arabic text-[28px] leading-none text-white" lang="ar" dir="rtl">دار المعرفة</p>
            <p className="mt-2 text-[13.5px] font-semibold tabular-nums">{formatHijri(today)}</p>
            <p className="text-[12px] text-blue-100/90 tabular-nums">{formatMasehi(today, true)} M</p>
          </div>
        </div>
        {hero && (
          <div className="flex max-w-[620px] flex-col gap-4 pt-6 sm:pt-14">
            <p className="font-serif text-[26px] font-semibold leading-snug text-balance sm:text-[34px]">
              Ahlan wa sahlan. Laporan {viewCycle ? cycleMonthName(viewCycle) : 'bulan ini'} menunggu softfile dari setiap bagian.
            </p>
            <p className="text-[14px] leading-relaxed text-blue-50/90 md:hidden">
              {formatHijri(today)} · {formatMasehi(today, true)} M
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="lg" icon={FileEdit} onClick={() => go('input')}>
                Input laporan
              </Button>
              {isAdmin && (
                <Button size="lg" variant="ghost" icon={BellRing} className="bg-white/12 text-white ring-1 ring-white/30 hover:bg-white/20 hover:text-white" onClick={() => go('rundown')}>
                  Rundown & pengingat
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

function WeekPips({ week }) {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {[1, 2, 3, 4].map((w) => (
        <span key={w} className={cx('h-1.5 w-4 rounded-full', w < week ? 'bg-brand/40' : w === week ? 'bg-brand' : 'bg-slate-200')} />
      ))}
    </span>
  );
}

function PeriodBar({ tab, go, tabs, onLogin, onOpenCycle }) {
  const { cycles, viewCycle, period, week, today, actions, isAdmin, mode, session } = useStore();
  const left = viewCycle ? daysBetween(today, viewCycle.deadline_date) : 0;
  return (
    <div className="kmi-sticky sticky z-40 border-b border-line">
      <div className="kmi-gutter mx-auto flex max-w-[1240px] flex-col gap-2 py-2.5 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5">
          {period && (
            <span className="text-[12.5px] font-semibold text-navy">
              Tahun Ajaran {period.label_masehi} / {period.label_hijri}
            </span>
          )}
          {viewCycle && (
            <label className="flex items-center gap-2">
              <span className="sr-only">Pilih bulan laporan</span>
              <Select
                id="cycle-picker"
                className="h-8 w-auto min-w-0 max-w-full py-0 text-[13px] font-semibold"
                value={viewCycle.id}
                onChange={(e) => actions.setViewCycleId(e.target.value)}
              >
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {cycleLabel(c)} {c.status === 'aktif' ? '· aktif' : '· arsip'}
                  </option>
                ))}
              </Select>
            </label>
          )}
          {viewCycle && viewCycle.status === 'aktif' && (
            <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-ink">
              <WeekPips week={week} /> {RUNDOWN[week - 1].title}
              {viewCycle.active_week ? <span className="font-normal text-muted">(manual)</span> : null}
            </span>
          )}
          {viewCycle && (
            <span className={cx('text-[12.5px] tabular-nums', left < 0 ? 'font-semibold text-red-700' : left <= 3 ? 'font-semibold text-amber-800' : 'text-muted')}>
              Tenggat {deadlineText(viewCycle).replace(/ \(.*/, '')} ·{' '}
              {left > 0 ? `${left} hari lagi` : left === 0 ? 'hari ini' : `lewat ${-left} hari`}
            </span>
          )}
          {viewCycle?.status === 'arsip' && <Badge tone="warn">Arsip</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode === 'demo' && <Badge tone="brand">Mode Demo · data contoh</Badge>}
          {isAdmin && (
            <Button size="sm" variant="primary" icon={RefreshCw} onClick={onOpenCycle}>
              Buka Periode Baru
            </Button>
          )}
          {mode === 'supabase' &&
            (session ? (
              <Button size="sm" variant="ghost" icon={LogOut} onClick={actions.signOut} title={session.email}>
                Keluar
              </Button>
            ) : (
              <Button size="sm" variant="navy" icon={Lock} onClick={onLogin}>
                Masuk Admin
              </Button>
            ))}
        </div>
      </div>
      <nav className="kmi-gutter mx-auto max-w-[1240px]" aria-label="Menu utama">
        <div className="-mb-px flex gap-1 overflow-x-auto" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => go(t.id)}
              className={cx(
                'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[13.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand',
                tab === t.id ? 'border-brand text-navy' : 'border-transparent text-muted hover:text-ink'
              )}
            >
              <t.icon className="size-4" aria-hidden />
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  const store = useStore();
  const { phase, loadError, isAdmin, toast, viewCycle, mode } = store;
  const tabs = TABS.filter((t) => (!t.admin || isAdmin) && (!t.artifactOnly || IS_ARTIFACT));
  const [tab, go] = useHashTab(tabs.map((t) => t.id));
  const [loginOpen, setLoginOpen] = useState(false);
  const [cycleOpen, setCycleOpen] = useState(false);

  if (phase === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted">
        <span className="animate-pulse font-serif text-lg">Memuat portal laporan…</span>
      </div>
    );
  }
  if (phase === 'error') {
    return (
      <div className="kmi-gutter mx-auto max-w-xl py-16">
        <Empty title="Portal belum dapat dimuat">
          {loadError}. Periksa VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY, lalu muat ulang halaman.
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <Header hero={tab === 'dasbor'} go={go} />
      <PeriodBar tab={tab} go={go} tabs={tabs} onLogin={() => setLoginOpen(true)} onOpenCycle={() => setCycleOpen(true)} />
      <main className="kmi-gutter mx-auto w-full max-w-[1240px] flex-1 py-6">
        {!viewCycle && !['bagian', 'periode', 'blueprint'].includes(tab) ? (
          <Empty icon={CalendarRange} title="Belum ada periode bulan yang dibuka">
            {isAdmin ? (
              <>
                Lengkapi Data Bagian (nama, nomor WA, kode akses), lalu buka periode bulan Hijriah pertama agar 48 bagian bisa mulai melapor.
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button variant="primary" icon={RefreshCw} onClick={() => setCycleOpen(true)}>
                    Buka Periode Bulan
                  </Button>
                  <Button icon={Users} onClick={() => go('bagian')}>
                    Isi Data Bagian
                  </Button>
                </div>
              </>
            ) : (
              'Admin belum membuka periode laporan. Silakan hubungi admin Sektor Guru KMI.'
            )}
          </Empty>
        ) : (
          <>
            {tab === 'dasbor' && <Dashboard go={go} />}
            <div hidden={tab !== 'input'}>
              <ReportForm go={go} />
            </div>
            {tab === 'rundown' && <Rundown />}
            {tab === 'laporan' && <Reports />}
            {tab === 'admin' && <AdminPanel />}
            {tab === 'bagian' && <Departments />}
            {tab === 'periode' && <Periods onOpenCycle={() => setCycleOpen(true)} />}
            {tab === 'blueprint' && <Blueprint />}
          </>
        )}
      </main>
      <footer className="border-t border-line bg-white">
        <div className="kmi-gutter mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-2 py-4 text-[12px] text-muted">
          <span>Portal Laporan Bulanan Sektor Guru KMI · PMDG Kampus 3 Darul Ma'rifat</span>
          <span>{mode === 'demo' ? 'Mode Demo — data tersimpan di peramban ini saja' : 'Tersambung ke Supabase'}</span>
        </div>
      </footer>
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      <OpenCycleModal open={cycleOpen} onClose={() => setCycleOpen(false)} />
      <Toast toast={toast} />
    </div>
  );
}
