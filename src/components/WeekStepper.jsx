import React from 'react';
import { Check } from 'lucide-react';
import { RUNDOWN } from '../lib/constants.js';
import { cx } from './ui.jsx';

/** Pelacak tahapan Rundown 4 minggu. onSelect opsional (memilih minggu untuk pengingat). */
export default function WeekStepper({ week, selected, onSelect, compact = false }) {
  return (
    <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {RUNDOWN.map((r) => {
        const state = r.week < week ? 'done' : r.week === week ? 'now' : 'next';
        const isSel = selected === r.week;
        const Tag = onSelect ? 'button' : 'div';
        return (
          <li key={r.week} className="min-w-0">
            <Tag
              type={onSelect ? 'button' : undefined}
              onClick={onSelect ? () => onSelect(r.week) : undefined}
              aria-pressed={onSelect ? isSel : undefined}
              className={cx(
                'flex h-full w-full flex-col gap-2 rounded-xl border p-4 text-left transition-colors',
                state === 'now' ? 'border-navy bg-navy text-white' : 'border-line bg-white text-ink',
                onSelect && 'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                onSelect && !isSel && state !== 'now' && 'hover:border-brand/40',
                isSel && state !== 'now' && 'border-brand ring-2 ring-brand/25',
                isSel && state === 'now' && 'ring-2 ring-brand ring-offset-2'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cx('text-[11px] font-semibold uppercase tracking-[0.14em]', state === 'now' ? 'text-blue-200' : 'text-brand')}>
                  Minggu {r.week}
                </span>
                {state === 'done' && (
                  <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-emerald-700">
                    <Check className="size-3.5" /> lewat
                  </span>
                )}
                {state === 'now' && <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">pekan ini</span>}
              </div>
              <p className="font-serif text-[16px] font-semibold leading-snug">{r.title}</p>
              {!compact && (
                <ul className={cx('flex flex-col gap-1.5 text-[12.5px] leading-snug', state === 'now' ? 'text-blue-50' : 'text-muted')}>
                  {r.items.map((it, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="tabular-nums opacity-70">{i + 1}.</span>
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Tag>
          </li>
        );
      })}
    </ol>
  );
}
