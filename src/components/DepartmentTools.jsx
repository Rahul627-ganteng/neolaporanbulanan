import React, { useMemo, useState } from 'react';
import JSZip from 'jszip';
import { AlertTriangle, Copy, Download, GraduationCap, Key, MessageCircle, Table2, Upload } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { buildAccessCodeMessage, formatWa, normalizeWa, waLink } from '../lib/constants.js';
import { buildXlsx } from '../lib/exports.js';
import { copyText, saveFile } from '../lib/files.js';
import { PORTAL_URL } from '../lib/env.js';
import { groupCounts, parseTeacherTable } from '../lib/teachers.js';
import { Badge, Button, Callout, cx, Modal, Textarea } from './ui.jsx';

// =====================================================================
//  Kode akses massal
// =====================================================================
export function AccessCodesModal({ open, onClose }) {
  const { activeDepartments, departments, activeCycle, actions } = useStore();
  const [scope, setScope] = useState('missing');
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState('');
  const missing = activeDepartments.filter((d) => !d.has_access_code).length;
  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
  const portal = PORTAL_URL || 'https://neolaporanbulanan.netlify.app';

  const close = () => {
    setRows(null);
    setScope('missing');
    onClose();
  };

  const generate = async () => {
    setBusy('gen');
    try {
      const out = await actions.generateAccessCodes(scope === 'missing');
      setRows(out);
      if (!out.length) actions.notify('Semua bagian sudah punya kode akses.');
    } catch {
      /* toast tampil */
    } finally {
      setBusy('');
    }
  };

  const message = (r) => buildAccessCodeMessage({ department: deptById.get(r.department_id) || r, code: r.kode, portalUrl: portal, cycle: activeCycle });

  const download = async () => {
    setBusy('xlsx');
    try {
      const blob = await buildXlsx([
        {
          name: 'Kode Akses',
          title: ['KODE AKSES INPUT LAPORAN BULANAN — SEKTOR GURU KMI', `Portal: ${portal} · Simpan berkas ini dengan aman`],
          header: ['No', 'Nama Bagian', 'Kode Akses', 'Sekretaris Bagian', 'WA Sekretaris'],
          rows: rows.map((r) => {
            const d = deptById.get(r.department_id) || {};
            return [r.no, r.nama, r.kode, d.sekretaris_nama || '', d.sekretaris_wa ? formatWa(d.sekretaris_wa) : ''];
          }),
          widths: [6, 44, 14, 30, 18],
        },
      ]);
      const res = await saveFile('Kode_Akses_Laporan_KMI.xlsx', blob);
      if (res === 'saved') actions.notify('Daftar kode akses siap diunduh.');
    } catch (e) {
      actions.notify(e.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const allText = rows ? rows.map((r) => `${r.no}. ${r.nama}: ${r.kode}`).join('\n') : '';

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      eyebrow="Data Bagian"
      title={rows ? `${rows.length} kode akses baru` : 'Buat kode akses massal'}
      footer={
        rows ? (
          <>
            <Button icon={Copy} onClick={async () => actions.notify((await copyText(allText)) ? 'Semua kode tersalin.' : 'Salin otomatis ditolak peramban.')}>
              Salin semua
            </Button>
            <Button variant="primary" icon={Table2} busy={busy === 'xlsx'} disabled={!rows.length} onClick={download}>
              Unduh Excel
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>Batal</Button>
            <Button variant="primary" icon={Key} busy={busy === 'gen'} disabled={scope === 'missing' && missing === 0} onClick={generate}>
              Buat kode
            </Button>
          </>
        )
      }
    >
      {!rows ? (
        <div className="flex flex-col gap-4">
          <p className="text-[13.5px] leading-relaxed text-muted">
            Setiap bagian mendapat kode 6 karakter untuk menginput laporan di portal. Database hanya menyimpan versi terenkripsi, jadi kode
            asli ditampilkan sekali setelah dibuat untuk diunduh dan dikirim ke Sekretaris Bagian.
          </p>
          <fieldset className="flex flex-col gap-2">
            {[
              { v: 'missing', t: `Hanya bagian yang belum punya kode (${missing} bagian)`, d: 'Kode yang sudah dibagikan tetap berlaku.' },
              { v: 'all', t: `Buat ulang kode untuk semua bagian (${activeDepartments.length})`, d: 'Semua kode lama dan sandi akun bagian (termasuk yang sudah diganti bagian) langsung tidak berlaku; semua bagian keluar dari akunnya.' },
            ].map((o) => (
              <label key={o.v} className={cx('flex cursor-pointer gap-3 rounded-lg border px-4 py-3', scope === o.v ? 'border-brand bg-sky-wash' : 'border-line')}>
                <input type="radio" name="code-scope" className="mt-1 accent-[#1D4ED8]" checked={scope === o.v} onChange={() => setScope(o.v)} />
                <span>
                  <span className="block text-[14px] font-semibold text-ink">{o.t}</span>
                  <span className="text-[12.5px] text-muted">{o.d}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {scope === 'all' && <Callout tone="warn">Sekretaris yang memakai kode lama harus menerima kode baru sebelum bisa mengirim laporan.</Callout>}
        </div>
      ) : rows.length === 0 ? (
        <Callout tone="ok">Semua bagian sudah punya kode akses.</Callout>
      ) : (
        <div className="flex flex-col gap-3">
          <Callout tone="warn" title="Unduh atau salin sekarang">
            Kode tidak bisa dilihat lagi setelah jendela ini ditutup. Bila hilang, buat ulang kode untuk bagian tersebut.
          </Callout>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead className="bg-mist text-[11px] uppercase tracking-[0.08em] text-muted">
                <tr>
                  <th className="py-2 pl-3 pr-2 font-semibold">No</th>
                  <th className="px-2 py-2 font-semibold">Bagian</th>
                  <th className="px-2 py-2 font-semibold">Kode</th>
                  <th className="py-2 pl-2 pr-3 text-right font-semibold">Kirim ke Sekretaris</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const d = deptById.get(r.department_id) || {};
                  return (
                    <tr key={r.department_id}>
                      <td className="py-2 pl-3 pr-2 text-muted tabular-nums">{r.no}</td>
                      <td className="px-2 py-2 font-medium text-ink">{r.nama}</td>
                      <td className="select-all px-2 py-2 font-mono text-[14px] font-semibold tracking-[0.18em] text-navy">{r.kode}</td>
                      <td className="py-2 pl-2 pr-3 text-right">
                        <a
                          href={waLink(d.sekretaris_wa, message(r))}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#128C4A] px-2.5 text-[12.5px] font-semibold text-white hover:bg-[#0E7A40]"
                          title={d.sekretaris_wa ? formatWa(d.sekretaris_wa) : 'Nomor belum diisi, pilih kontak di WhatsApp'}
                        >
                          <MessageCircle className="size-3.5" /> WA
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

// =====================================================================
//  Impor data bagian dari spreadsheet (tempel dari Google Sheets/Excel,
//  atau unggah .xlsx/.csv dari templat)
// =====================================================================
const COLS = [
  { key: 'no', label: 'No', match: /^no\.?$|^nomor/ },
  { key: 'nama', label: 'Nama Bagian', match: /bagian/ },
  { key: 'ketua_nama', label: 'Nama Ketua', match: /ketua/, not: /wa|hp|telp|nomor/ },
  { key: 'ketua_wa', label: 'WA Ketua', match: /(wa|hp|telp|nomor).*ketua|ketua.*(wa|hp|telp|nomor)/ },
  { key: 'sekretaris_nama', label: 'Nama Sekretaris', match: /sekretaris/, not: /wa|hp|telp|nomor/ },
  { key: 'sekretaris_wa', label: 'WA Sekretaris', match: /(wa|hp|telp|nomor).*sekretaris|sekretaris.*(wa|hp|telp|nomor)/ },
  { key: 'pembimbing_nama', label: 'Nama Pembimbing', match: /pembimbing/ },
];

export function parseDelimited(text) {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const delim = firstLine.includes('\t') ? '\t' : (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

export async function parseXlsx(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = (path) => zip.file(path)?.async('string');
  const dom = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const shared = [];
  const ss = await xml('xl/sharedStrings.xml');
  if (ss) dom(ss).querySelectorAll('si').forEach((si) => shared.push([...si.querySelectorAll('t')].map((t) => t.textContent).join('')));
  const sheetPath = Object.keys(zip.files).filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p)).sort()[0];
  if (!sheetPath) throw new Error('Lembar kerja tidak ditemukan di berkas Excel.');
  const doc = dom(await xml(sheetPath));
  const colIndex = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  const out = [];
  doc.querySelectorAll('sheetData > row').forEach((r) => {
    const row = [];
    r.querySelectorAll('c').forEach((c) => {
      const t = c.getAttribute('t');
      let v = '';
      if (t === 's') v = shared[Number(c.querySelector('v')?.textContent)] ?? '';
      else if (t === 'inlineStr') v = [...c.querySelectorAll('t')].map((x) => x.textContent).join('');
      else v = c.querySelector('v')?.textContent ?? '';
      row[colIndex(c.getAttribute('r'))] = String(v).trim();
    });
    if (row.some(Boolean)) out.push(Array.from(row, (x) => x ?? ''));
  });
  return out;
}

function mapRows(table, departments) {
  if (!table.length) return { items: [], unmatched: [] };
  const headerIdx = table.findIndex((r) => r.some((c) => /bagian/i.test(c)) && r.some((c) => /ketua|sekretaris/i.test(c)));
  let mapping;
  let body;
  if (headerIdx >= 0) {
    const head = table[headerIdx].map((h) => h.toLowerCase());
    mapping = {};
    COLS.forEach((c) => {
      const i = head.findIndex((h, idx) => c.match.test(h) && !(c.not && c.not.test(h)) && !Object.values(mapping).includes(idx));
      if (i >= 0) mapping[c.key] = i;
    });
    body = table.slice(headerIdx + 1);
  } else {
    mapping = Object.fromEntries(COLS.map((c, i) => [c.key, i]));
    body = table;
  }
  const byNo = new Map(departments.map((d) => [d.no, d]));
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const byName = new Map(departments.map((d) => [norm(d.nama), d]));
  const items = [];
  const unmatched = [];
  body.forEach((r) => {
    const get = (k) => (mapping[k] != null ? r[mapping[k]] ?? '' : '');
    const no = Number(String(get('no')).replace(/\D/g, ''));
    const dept = byNo.get(no) || byName.get(norm(get('nama')));
    if (!dept) {
      if (r.some(Boolean)) unmatched.push(r.join(' | '));
      return;
    }
    const next = { ...dept };
    ['ketua_nama', 'sekretaris_nama', 'pembimbing_nama'].forEach((k) => {
      if (mapping[k] != null && get(k)) next[k] = get(k);
    });
    const waIssues = [];
    ['ketua_wa', 'sekretaris_wa'].forEach((k) => {
      if (mapping[k] == null || !get(k)) return;
      const n = normalizeWa(get(k));
      if (/^62\d{8,13}$/.test(n)) next[k] = n;
      else waIssues.push(`${k === 'ketua_wa' ? 'WA Ketua' : 'WA Sekretaris'} "${get(k)}" tidak valid`);
    });
    const changed = ['ketua_nama', 'ketua_wa', 'sekretaris_nama', 'sekretaris_wa', 'pembimbing_nama'].filter(
      (k) => (next[k] || '') !== (dept[k] || '')
    );
    items.push({ dept, next, changed, waIssues });
  });
  return { items, unmatched, mapped: Object.keys(mapping) };
}

export function ImportDepartmentsModal({ open, onClose }) {
  const { departments, actions } = useStore();
  const [text, setText] = useState('');
  const [table, setTable] = useState(null);
  const [busy, setBusy] = useState('');
  const sorted = useMemo(() => [...departments].sort((a, b) => a.no - b.no), [departments]);
  const result = useMemo(() => (table ? mapRows(table, sorted) : null), [table, sorted]);
  const changes = result ? result.items.filter((i) => i.changed.length) : [];

  const close = () => {
    setText('');
    setTable(null);
    onClose();
  };

  const template = async () => {
    setBusy('tpl');
    try {
      const blob = await buildXlsx([
        {
          name: 'Data Bagian',
          title: [`DATA PEJABAT ${sorted.length} BAGIAN SEKTOR GURU KMI — isi lalu unggah/tempel kembali ke portal`],
          header: COLS.map((c) => c.label),
          rows: sorted.map((d) => [d.no, d.nama, d.ketua_nama || '', d.ketua_wa ? `0${d.ketua_wa.slice(2)}` : '', d.sekretaris_nama || '', d.sekretaris_wa ? `0${d.sekretaris_wa.slice(2)}` : '', d.pembimbing_nama || '']),
          widths: [6, 44, 28, 18, 28, 18, 28],
        },
      ]);
      const res = await saveFile('Templat_Data_Bagian_KMI.xlsx', blob);
      if (res === 'saved') actions.notify('Templat data bagian siap diunduh.');
    } catch (e) {
      actions.notify(e.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      if (/\.xlsx$/i.test(f.name)) setTable(await parseXlsx(f));
      else setTable(parseDelimited(await f.text()));
    } catch (err) {
      actions.notify(err.message || 'Berkas tidak dapat dibaca.', 'error');
    }
  };

  const save = async () => {
    setBusy('save');
    try {
      await actions.importDepartments(changes.map((c) => c.next));
      close();
    } catch {
      /* toast tampil */
    } finally {
      setBusy('');
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      eyebrow="Data Bagian"
      title="Impor dari spreadsheet"
      footer={
        <>
          <Button variant="ghost" onClick={close}>Batal</Button>
          <Button variant="primary" icon={Upload} busy={busy === 'save'} disabled={!changes.length} onClick={save}>
            Simpan {changes.length || ''} perubahan
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13.5px] leading-relaxed text-ink">
          <li>
            Unduh templat berisi {sorted.length} bagian, isi nama dan nomor WA di Excel atau Google Sheets.{' '}
            <Button size="sm" icon={Download} busy={busy === 'tpl'} onClick={template} className="ml-1 align-middle">
              Unduh templat
            </Button>
          </li>
          <li>Blok seluruh tabel (termasuk baris judul kolom), salin, lalu tempel di bawah. Atau unggah berkas .xlsx/.csv.</li>
          <li>Periksa pratinjau, lalu simpan. Kolom kosong tidak menimpa data yang sudah ada.</li>
        </ol>
        <Textarea
          id="import-paste"
          rows={6}
          placeholder={'No\tNama Bagian\tNama Ketua\tWA Ketua\tNama Sekretaris\tWA Sekretaris\tNama Pembimbing\n1\tBagian Pengasuhan Santri\tUst. …\t0812…\tUst. …\t0813…\tUst. …'}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setTable(e.target.value.trim() ? parseDelimited(e.target.value) : null);
          }}
          className="font-mono text-[12.5px]"
        />
        <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-2 text-[13px] font-semibold text-ink hover:bg-sky-wash">
          <Upload className="size-4" /> Unggah .xlsx / .csv
          <input id="import-file" type="file" accept=".xlsx,.csv,.tsv,.txt" className="sr-only" onChange={onFile} />
        </label>

        {result && (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-muted">
              {result.items.length} baris cocok dengan bagian · <strong className="text-ink">{changes.length} akan diperbarui</strong>
              {result.unmatched.length ? ` · ${result.unmatched.length} baris tidak dikenali` : ''}
            </p>
            {result.unmatched.length > 0 && (
              <Callout tone="warn" title="Baris tidak cocok dengan nomor/nama bagian">
                <ul className="list-disc pl-4">{result.unmatched.slice(0, 5).map((u) => <li key={u}>{u}</li>)}</ul>
              </Callout>
            )}
            {changes.length > 0 && (
              <div className="max-h-[38vh] overflow-auto rounded-lg border border-line">
                <table className="w-full min-w-[640px] text-left text-[12.5px]">
                  <thead className="sticky top-0 bg-mist text-[11px] uppercase tracking-[0.08em] text-muted">
                    <tr>
                      <th className="py-2 pl-3 pr-2 font-semibold">Bagian</th>
                      <th className="px-2 py-2 font-semibold">Ketua</th>
                      <th className="px-2 py-2 font-semibold">Sekretaris</th>
                      <th className="py-2 pl-2 pr-3 font-semibold">Pembimbing</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line align-top">
                    {changes.map(({ dept, next, waIssues }) => (
                      <tr key={dept.id}>
                        <td className="py-2 pl-3 pr-2 font-semibold text-ink">
                          {dept.no}. {dept.nama}
                          {waIssues.length > 0 && (
                            <span className="mt-1 flex items-center gap-1 font-normal text-amber-800">
                              <AlertTriangle className="size-3.5" /> {waIssues.join('; ')}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2">{next.ketua_nama || '—'}<br /><span className="text-muted tabular-nums">{next.ketua_wa ? formatWa(next.ketua_wa) : ''}</span></td>
                        <td className="px-2 py-2">{next.sekretaris_nama || '—'}<br /><span className="text-muted tabular-nums">{next.sekretaris_wa ? formatWa(next.sekretaris_wa) : ''}</span></td>
                        <td className="py-2 pl-2 pr-3">{next.pembimbing_nama || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result.items.length > 0 && changes.length === 0 && <Badge tone="ok">Tidak ada perubahan dibanding data saat ini</Badge>}
          </div>
        )}
      </div>
    </Modal>
  );
}

// =====================================================================
//  Daftar guru (untuk mencari nama Ketua & Sekretaris Bagian)
// =====================================================================
export function ImportTeachersModal({ open, onClose }) {
  const { actions } = useStore();
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setParsed(null);
    setFileName('');
    onClose();
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const table = /\.xlsx$/i.test(f.name) ? await parseXlsx(f) : parseDelimited(await f.text());
      const out = parseTeacherTable(table);
      if (!out.teachers.length) throw new Error('Tidak ada nama guru yang terbaca. Pastikan ada kolom "Nama".');
      setParsed(out);
      setFileName(f.name);
    } catch (err) {
      setParsed(null);
      actions.notify(err.message || 'Berkas tidak dapat dibaca.', 'error');
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const out = await actions.replaceTeachers(parsed.teachers);
      actions.notify(`Daftar guru diperbarui: ${out.aktif} aktif, ${out.baru} baru, ${out.dinonaktifkan} dinonaktifkan.`);
      close();
    } catch {
      /* toast tampil */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      eyebrow="Data Bagian"
      title="Perbarui daftar guru"
      footer={
        <>
          <Button variant="ghost" onClick={close}>Batal</Button>
          <Button variant="primary" icon={Upload} busy={busy} disabled={!parsed} onClick={save}>
            Simpan {parsed ? `${parsed.teachers.length} guru` : ''}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[13.5px] leading-relaxed text-ink">
          Unggah Excel absen guru per angkatan (format seperti <strong>ABSEN GURU KMI</strong>: blok “Guru Tahun …” dengan kolom No, Nama, Tahun).
          Guru Senior otomatis tidak dimasukkan. Nama yang tidak ada di berkas baru dinonaktifkan, tidak dihapus.
        </p>
        <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-2 text-[13px] font-semibold text-ink hover:bg-sky-wash">
          <Upload className="size-4" /> Pilih berkas .xlsx / .csv
          <input id="teachers-file" type="file" accept=".xlsx,.csv,.tsv,.txt" className="sr-only" onChange={onFile} />
        </label>
        {parsed && (
          <div className="flex flex-col gap-3">
            <Callout tone="ok" title={`${parsed.teachers.length} guru terbaca dari ${fileName}`}>
              {parsed.senior ? `${parsed.senior} Guru Senior dilewati. ` : ''}Periksa ringkasan di bawah, lalu simpan.
            </Callout>
            <div className="flex flex-wrap gap-1.5">
              {groupCounts(parsed.teachers).map(([g, n]) => (
                <Badge key={g} tone="brand" icon={GraduationCap}>{g}: {n}</Badge>
              ))}
            </div>
            <ul className="max-h-[30vh] overflow-y-auto rounded-lg border border-line text-[13px]">
              {parsed.teachers.slice(0, 40).map((t) => (
                <li key={t.nama} className="flex justify-between gap-3 border-b border-line px-3 py-1.5 last:border-b-0">
                  <span className="text-ink">{t.nama}</span>
                  <span className="shrink-0 text-muted">{t.tahun ? `Tahun ${t.tahun}` : ''}</span>
                </li>
              ))}
              {parsed.teachers.length > 40 && <li className="px-3 py-1.5 text-muted">… dan {parsed.teachers.length - 40} nama lain</li>}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
