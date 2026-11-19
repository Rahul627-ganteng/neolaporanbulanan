import React, { useRef, useState } from 'react';
import { Copy, FileDown, FileText, Image as ImageIcon, MessageCircle } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import {
  buildFullReportText, buildProgramCardText, cycleLabel, HIJRI_MONTHS, INSTITUTION, kendalaCategory, nextHijriMonth, nextMonthLabel, programCategory, waLink, formatWa,
} from '../lib/constants.js';
import { evalScore, evalStatus } from '../lib/evaluasi.js';
import { formatTimestamp } from '../lib/hijri.js';
import { nodeToPng, pngToPdf } from '../lib/exports.js';
import { reportDocxBlob, reportDocxFilename } from '../lib/docx-report.js';
import { copyText, saveFile, slug } from '../lib/files.js';
import { Button, Modal, Segmented } from './ui.jsx';
import Logo from './Logo.jsx';

const ORDER = ['unggulan', 'inovasi', 'tindak_lanjut', 'reguler'];

/** Kartu visual yang juga diekspor menjadi gambar/PDF (warna & font eksplisit agar hasil ekspor stabil). */
const EVAL_COLOR = { terlaksana: '#047857', sebagian: '#B45309', belum: '#B91C1C' };

function Section({ no, title, children }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-baseline gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-[#1D4ED8]">
        {no && <span className="font-serif text-[15px] normal-case tracking-normal text-[#1E3A8A]">{no}</span>}
        {title}
      </p>
      {children}
    </div>
  );
}

function Numbered({ items }) {
  return (
    <ol className="flex flex-col gap-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5 text-[13.5px] leading-snug">
          <span className="w-4 shrink-0 text-right font-semibold text-[#5B6478] tabular-nums">{i + 1}.</span>
          <span className="min-w-0 flex-1">{t}</span>
        </li>
      ))}
    </ol>
  );
}

/** Versi lengkap: evaluasi, hasil usaha, kendala, solusi, dan program kerja. */
function FullBody({ report, cycle, programs }) {
  const ev = (report.evaluasi_program || []).filter((e) => e.judul);
  const score = evalScore(ev);
  const hasil = (report.hasil_usaha || []).filter(Boolean);
  const kendala = (report.kendala || []).filter((k) => k.teks);
  const solusi = (report.solusi || []).filter(Boolean);
  return (
    <div className="flex flex-col gap-5 px-7 py-5">
      {ev.length > 0 && (
        <Section title={`Evaluasi program bulan lalu${score != null ? ` · ${score}% terlaksana` : ''}`}>
          <ul className="flex flex-col gap-1.5">
            {ev.map((e, i) => {
              const st = evalStatus(e.status);
              return (
                <li key={i} className="flex items-start justify-between gap-3 text-[13.5px] leading-snug">
                  <span className="min-w-0 flex-1">
                    {e.judul}
                    {e.catatan && <span className="block text-[12px] text-[#5B6478]">{e.catatan}</span>}
                  </span>
                  <span className="shrink-0 text-[12px] font-bold" style={{ color: EVAL_COLOR[e.status] || '#5B6478' }}>{st ? st.label : '—'}</span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
      <Section no="I" title="Hasil usaha">
        {hasil.length ? <Numbered items={hasil} /> : <p className="text-[13px] text-[#5B6478]">—</p>}
      </Section>
      <Section no="II" title="Kendala">
        {kendala.length ? (
          <Numbered items={kendala.map((k) => (
            <>
              {k.teks} <span className="text-[11.5px] font-semibold text-[#5B6478]">· {kendalaCategory(k.kategori).label}</span>
            </>
          ))} />
        ) : <p className="text-[13px] text-[#5B6478]">—</p>}
      </Section>
      <Section no="III" title="Solusi">
        {solusi.length ? <Numbered items={solusi} /> : <p className="text-[13px] text-[#5B6478]">—</p>}
      </Section>
      <Section no="IV" title={`Program kerja ${nextMonthLabel(cycle)}`}>
        <ol className="flex flex-col gap-1.5">
          {programs.map((p, i) => {
            const c = programCategory(p.kategori);
            const top = p.kategori === 'unggulan';
            return (
              <li key={p.id || i} className={`flex items-start gap-2.5 rounded-lg px-3 py-2 text-[13.5px] leading-snug ${top ? 'bg-[#1E3A8A] text-white' : 'bg-[#F1F5FB]'}`}>
                <span className="leading-none">{c.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{p.judul}</span>
                  <span className={`block text-[11.5px] ${top ? 'text-[#BFD3FB]' : 'text-[#5B6478]'}`}>
                    {c.label}
                    {p.target ? ` · target: ${p.target}` : ''}
                  </span>
                </span>
              </li>
            );
          })}
          {programs.length === 0 && <p className="text-[13px] text-[#5B6478]">Belum ada program kerja.</p>}
        </ol>
      </Section>
    </div>
  );
}

export const ReminderCard = React.forwardRef(function ReminderCard({ report, department, cycle, variant = 'proker' }, ref) {
  const full = variant === 'lengkap';
  const programs = [...(report.programs || [])].sort((a, b) => ORDER.indexOf(a.kategori) - ORDER.indexOf(b.kategori));
  const top = programs.filter((p) => p.kategori === 'unggulan');
  const rest = programs.filter((p) => p.kategori !== 'unggulan');
  const programMonth = nextHijriMonth(cycle.hijri_month, cycle.hijri_year);
  const after = nextHijriMonth(programMonth.month, programMonth.year);
  return (
    <div ref={ref} className="kmi-card w-[640px] overflow-hidden rounded-2xl border border-[#D6E0F0] bg-white text-[#0F172A]">
      <div className="kmi-card-head relative px-7 pb-6 pt-6 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-[#BFD3FB]">{full ? 'Kartu Laporan Bulanan · Lengkap' : 'Kartu Pengingat Target Program'}</p>
            <p className="mt-0.5 text-[12px] text-[#DCE6FB]">{INSTITUTION.sektor} · {INSTITUTION.singkat}</p>
          </div>
          <Logo className="size-14 shrink-0" />
        </div>
        <h3 className="mt-4 font-serif text-[28px] font-semibold leading-tight">{department.nama}</h3>
        <p className="mt-1 text-[14px] text-[#DCE6FB]">
          {full ? (
            <>Laporan bulan <strong className="font-semibold text-white">{cycleLabel(cycle)}</strong> · program kerja {nextMonthLabel(cycle)}</>
          ) : (
            <>Program kerja <strong className="font-semibold text-white">{nextMonthLabel(cycle)}</strong> · dari laporan {cycleLabel(cycle)}</>
          )}
        </p>
      </div>

      {full ? <FullBody report={report} cycle={cycle} programs={programs} /> : (
      <div className="flex flex-col gap-2.5 px-7 py-5">
        {top.length > 0 && (
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#1D4ED8]">🌟 Program unggulan / prioritas utama</p>
        )}
        {top.map((p, i) => (
          <div key={p.id || `u${i}`} className="flex items-start gap-3 rounded-xl bg-[#1E3A8A] px-4 py-3 text-white">
            <span className="mt-0.5 text-[18px] leading-none">🌟</span>
            <div className="min-w-0 flex-1">
              <p className="text-[15.5px] font-bold leading-snug">{p.judul}</p>
              {p.target && <p className="mt-0.5 text-[12.5px] text-[#BFD3FB]">Target: {p.target}</p>}
            </div>
          </div>
        ))}
        {rest.length > 0 && <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#5B6478]">Program pendukung</p>}
        {rest.map((p, i) => {
          const c = programCategory(p.kategori);
          return (
            <div key={p.id || `r${i}`} className="flex items-start gap-3 border-b border-[#E4EAF3] px-1 pb-2.5 last:border-b-0">
              <span className="mt-0.5 text-[15px] leading-none">{c.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-semibold leading-snug">{p.judul}</p>
                <p className="text-[12px] text-[#5B6478]">
                  {c.label}
                  {p.target ? ` · target: ${p.target}` : ''}
                </p>
              </div>
            </div>
          );
        })}
        {programs.length === 0 && <p className="text-[14px] text-[#5B6478]">Belum ada program kerja untuk bulan depan.</p>}
      </div>
      )}

      <div className="grid grid-cols-2 gap-4 border-t border-[#E4EAF3] bg-[#F8FAFC] px-7 py-4 text-[13px]">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#5B6478]">Ketua Bagian</p>
          <p className="font-semibold">{report.ketua_nama || department.ketua_nama || '—'}</p>
        </div>
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#5B6478]">Sekretaris Bagian</p>
          <p className="font-semibold">{report.sekretaris_nama || department.sekretaris_nama || '—'}</p>
        </div>
        <p className="col-span-2 text-[11.5px] text-[#5B6478]">
          Laporan diterima {formatTimestamp(report.submitted_at)}
          {report.direvisi_admin_at ? ` · direvisi admin ${formatTimestamp(report.direvisi_admin_at)}` : ''} · Laporan {HIJRI_MONTHS[programMonth.month - 1]} dikumpulkan selambatnya 5 {HIJRI_MONTHS[after.month - 1]} {after.year} H.
        </p>
      </div>
    </div>
  );
});

export function ReminderCardModal({ open, onClose, report, department, cycle }) {
  const { periods, period: viewPeriod, actions } = useStore();
  const period = periods.find((p) => p.id === cycle?.period_id) || viewPeriod;
  const ref = useRef(null);
  const [busy, setBusy] = useState('');
  const [variant, setVariant] = useState('proker');
  if (!open || !report || !department) return null;
  const ketua = report.ketua_nama || department.ketua_nama;
  const sekretaris = report.sekretaris_nama || department.sekretaris_nama;
  const text = variant === 'lengkap'
    ? buildFullReportText({ department, cycle, report, ketua, sekretaris })
    : buildProgramCardText({ department, cycle, programs: report.programs || [], ketua, sekretaris });
  const base = `Kartu${variant === 'lengkap' ? 'Lengkap' : ''}_${slug(department.nama)}_${HIJRI_MONTHS[cycle.hijri_month - 1].replace(/[^A-Za-z]/g, '')}_${cycle.hijri_year}H`;

  const act = async (kind) => {
    setBusy(kind);
    try {
      let res;
      if (kind === 'png') res = await saveFile(`${base}.png`, await nodeToPng(ref.current));
      if (kind === 'pdf') res = await saveFile(`${base}.pdf`, await pngToPdf(await nodeToPng(ref.current), `Kartu ${department.nama}`));
      if (kind === 'docx') res = await saveFile(reportDocxFilename({ department, cycle }), await reportDocxBlob({ report, department, cycle, period }));
      if (res === 'saved') actions.notify('Berkas siap diunduh.');
    } catch (e) {
      actions.notify(e.message || 'Gagal membuat berkas.', 'error');
    } finally {
      setBusy('');
    }
  };

  const contacts = [
    { role: 'Ketua', name: report.ketua_nama || department.ketua_nama, wa: department.ketua_wa },
    { role: 'Sekretaris', name: report.sekretaris_nama || department.sekretaris_nama, wa: department.sekretaris_wa },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      eyebrow="Kartu laporan & dokumen resmi"
      title={department.nama}
      footer={
        <>
          <Button icon={ImageIcon} busy={busy === 'png'} onClick={() => act('png')}>Gambar (.png)</Button>
          <Button icon={FileDown} busy={busy === 'pdf'} onClick={() => act('pdf')}>PDF</Button>
          <Button variant="primary" icon={FileText} busy={busy === 'docx'} onClick={() => act('docx')}>Laporan Word (.docx)</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <Segmented
            label="Isi kartu"
            value={variant}
            onChange={setVariant}
            options={[{ value: 'proker', label: 'Program kerja bulan depan' }, { value: 'lengkap', label: 'Laporan lengkap' }]}
          />
        </div>
        <div className="overflow-x-auto rounded-xl bg-mist p-4">
          <div className="mx-auto w-[640px]">
            <ReminderCard ref={ref} report={report} department={department} cycle={cycle} variant={variant} />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-[13px] font-semibold text-ink">Kirim balik ke WhatsApp bagian</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {contacts.map((c) => (
              <div key={c.role} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold">{c.role}: {c.name || '—'}</p>
                  <p className="text-[12px] text-muted tabular-nums select-all">{c.wa ? formatWa(c.wa) : 'Nomor belum diisi — pilih kontak di WhatsApp'}</p>
                </div>
                <a
                  href={waLink(c.wa, text)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-[#128C4A] px-3 text-[13px] font-semibold text-white hover:bg-[#0E7A40]"
                >
                  <MessageCircle className="size-4" /> Kirim
                </a>
              </div>
            ))}
          </div>
          <div>
            <Button
              size="sm"
              icon={Copy}
              onClick={async () => actions.notify((await copyText(text)) ? 'Teks kartu tersalin.' : 'Salin otomatis ditolak oleh peramban.')}
            >
              Salin teks kartu
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
