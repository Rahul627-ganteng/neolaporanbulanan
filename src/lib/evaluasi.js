// Evaluasi keterlaksanaan program kerja bulan lalu (diisi di laporan bulan berikutnya).

export const EVAL_STATUS = [
  { key: 'terlaksana', label: 'Terlaksana', score: 1, tone: 'ok', on: 'border-emerald-600 bg-emerald-50 text-emerald-800' },
  { key: 'sebagian', label: 'Sebagian', score: 0.5, tone: 'warn', on: 'border-amber-500 bg-amber-50 text-amber-900' },
  { key: 'belum', label: 'Belum', score: 0, tone: 'late', on: 'border-red-500 bg-red-50 text-red-800' },
];

export const evalStatus = (key) => EVAL_STATUS.find((s) => s.key === key) || null;

/** Persentase keterlaksanaan (terlaksana = 1, sebagian = ½); null bila belum ada penilaian. */
export function evalScore(items = []) {
  const rated = items.filter((e) => evalStatus(e.status));
  if (!rated.length) return null;
  return Math.round((rated.reduce((a, e) => a + evalStatus(e.status).score, 0) / rated.length) * 100);
}
