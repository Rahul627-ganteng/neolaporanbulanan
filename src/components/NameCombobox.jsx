import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { isKnownTeacher, searchTeachers } from '../lib/teachers.js';
import { cx, Input } from './ui.jsx';

/**
 * Kotak isian nama dengan saran dari direktori guru (pola combobox ARIA).
 * Nama di luar daftar tetap boleh diketik.
 */
export default function NameCombobox({ id, value, onChange, options = [], placeholder, disabledHint }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef(null);
  const listId = useId();
  const hits = useMemo(() => (open ? searchTeachers(options, value) : []), [open, options, value]);
  const known = useMemo(() => isKnownTeacher(options, value), [options, value]);

  useEffect(() => setActive(0), [value]);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => !wrap.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away, { passive: true });
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('touchstart', away);
    };
  }, [open]);

  const pick = (t) => {
    onChange(t.nama);
    setOpen(false);
  };
  const showList = open && hits.length > 0 && !(hits.length === 1 && hits[0].nama === value);

  const onKey = (e) => {
    if (!showList) {
      if (e.key === 'ArrowDown' && options.length) setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(hits[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrap} className="relative">
      <div className="relative">
        {options.length > 0 && <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />}
        <Input
          id={id}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          className={options.length ? 'pl-9' : ''}
          value={value}
          placeholder={options.length ? 'Ketik nama guru untuk mencari' : placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
        />
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+4px)] z-30 max-h-[280px] overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-xl"
        >
          {hits.map((t, i) => (
            <li
              key={t.nama}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(t);
              }}
              onMouseEnter={() => setActive(i)}
              className={cx('flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-[14px]', i === active ? 'bg-sky-wash text-navy' : 'text-ink')}
            >
              <span className="min-w-0 truncate font-medium">{t.nama}</span>
              {t.tahun && <span className="shrink-0 rounded bg-slate-100 px-1.5 py-px text-[11.5px] font-semibold text-slate-600">Tahun {t.tahun}</span>}
            </li>
          ))}
        </ul>
      )}
      {options.length > 0 && value.trim() && !known && !showList && (
        <p className="mt-1 text-[12px] text-muted">Tidak ada di daftar guru; nama yang diketik tetap dipakai.</p>
      )}
      {!options.length && disabledHint && <p className="mt-1 text-[12px] text-muted">{disabledHint}</p>}
    </div>
  );
}
