import React, { useMemo, useState } from 'react';
import { Copy, FileSpreadsheet, FileText, MessageCircle, Table2 } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { buildBelumLaporText, cycleLabel, deadlineText, HIJRI_MONTHS, INSTITUTION, waLink } from '../lib/constants.js';
import { buildBelumLaporPdf, buildXlsx, toCSV } from '../lib/exports.js';
import { copyText, saveFile } from '../lib/files.js';
import { formatHijri, todayIso } from '../lib/hijri.js';
import { PORTAL_URL } from '../lib/env.js';
import { Button, Modal } from './ui.jsx';

export function useBelumLapor() {
  const { activeDepartments, reportByDept } = useStore();
  return useMemo(
    () => activeDepartments.filter((d) => !reportByDept.get(d.id)?.submitted_at),
    [activeDepartments, reportByDept]
  );
}

export default function BelumLaporModal({ open, onClose }) {
  const { viewCycle, period, activeDepartments, actions } = useStore();
  const list = useBelumLapor();
  const [busy, setBusy] = useState('');
  const text = viewCycle
    ? buildBelumLaporText({ cycle: viewCycle, departments: list, total: activeDepartments.length, portalUrl: PORTAL_URL })
    : '';
  const base = viewCycle ? `Belum_Lapor_${HIJRI_MONTHS[viewCycle.hijri_month - 1].replace(/[^A-Za-z]/g, '')}_${viewCycle.hijri_year}H` : 'Belum_Lapor';

  const rows = list.map((d) => ({ no: d.no, nama: d.nama, ketua: d.ketua_nama || '-', sekretaris: d.sekretaris_nama || '-' }));

  const doSave = async (kind) => {
    setBusy(kind);
    try {
      if (kind === 'xlsx') {
        const blob = await buildXlsx([
          {
            name: 'Belum Lapor',
            title: [
              'DAFTAR BAGIAN YANG BELUM MENGUMPULKAN LAPORAN BULANAN',
              `${INSTITUTION.sektor} · ${INSTITUTION.singkat}`,
              `Bulan ${cycleLabel(viewCycle)} · Tenggat ${deadlineText(viewCycle)} · per ${formatHijri(todayIso())}`,
            ],
            header: ['No', 'No. Bagian', 'Nama Bagian', 'Ketua Bagian', 'Sekretaris Bagian', 'Keterangan'],
            rows: rows.map((r, i) => [i + 1, r.no, r.nama, r.ketua, r.sekretaris, 'Belum menginput softfile']),
            widths: [5, 10, 46, 28, 28, 26],
          },
        ]);
        await done(await saveFile(`${base}.xlsx`, blob));
      } else if (kind === 'csv') {
        const csv = toCSV(['No', 'No. Bagian', 'Nama Bagian', 'Ketua Bagian', 'Sekretaris Bagian'], rows.map((r, i) => [i + 1, r.no, r.nama, r.ketua, r.sekretaris]));
        await done(await saveFile(`${base}.csv`, csv));
      } else if (kind === 'pdf') {
        const blob = await buildBelumLaporPdf({ cycle: viewCycle, period, rows, total: activeDepartments.length });
        await done(await saveFile(`${base}.pdf`, blob));
      }
    } catch (e) {
      actions.notify(e.message, 'error');
    } finally {
      setBusy('');
    }
  };
  const done = async (r) => r === 'saved' && actions.notify('Berkas rekap siap diunduh.');

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={`${list.length} dari ${activeDepartments.length} bagian`}
      title="Daftar bagian yang belum lapor"
      footer={
        <>
          <Button icon={Table2} busy={busy === 'xlsx'} onClick={() => doSave('xlsx')}>Excel (.xlsx)</Button>
          <Button icon={FileSpreadsheet} busy={busy === 'csv'} onClick={() => doSave('csv')}>CSV</Button>
          <Button icon={FileText} busy={busy === 'pdf'} onClick={() => doSave('pdf')}>PDF</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[13.5px] text-muted">
          Teks di bawah siap ditempel ke grup WhatsApp KMI. Berkas rekap Excel/CSV/PDF untuk lampiran laporan ke Staf Sekretaris Wakil Pengasuh.
        </p>
        <pre className="max-h-[42vh] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-mist p-4 font-sans text-[13px] leading-relaxed text-ink">
          {text}
        </pre>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            icon={Copy}
            onClick={async () => actions.notify((await copyText(text)) ? 'Teks daftar belum lapor tersalin.' : 'Salin otomatis ditolak; blok teks lalu salin manual.', 'ok')}
          >
            Salin teks WhatsApp
          </Button>
          <a
            href={waLink('', text)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[#128C4A] px-3.5 text-sm font-semibold text-white hover:bg-[#0E7A40]"
          >
            <MessageCircle className="size-4" /> Bagikan ke WhatsApp
          </a>
        </div>
      </div>
    </Modal>
  );
}
