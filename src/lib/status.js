import { isoOfTimestamp } from './hijri.js';

/** Status kepatuhan satu bagian pada satu siklus. */
export function reportState(report, cycle, today) {
  if (report?.submitted_at) {
    return isoOfTimestamp(report.submitted_at) <= cycle.deadline_date ? 'tepat' : 'terlambat';
  }
  return today > cycle?.deadline_date ? 'lewat' : 'belum';
}

export const STATE_META = {
  tepat: { label: 'Tepat waktu', tone: 'ok' },
  terlambat: { label: 'Terlambat', tone: 'warn' },
  belum: { label: 'Belum lapor', tone: 'muted' },
  lewat: { label: 'Lewat tenggat', tone: 'late' },
};

export const isSubmitted = (r) => Boolean(r?.submitted_at);
