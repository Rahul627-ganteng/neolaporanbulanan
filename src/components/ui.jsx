import React, { useEffect, useId, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';

const cx = (...a) => a.filter(Boolean).join(' ');
export { cx };

// Gabungkan kelas dasar dengan kelas tambahan: kelas dasar yang prefiksnya
// ditimpa (mis. w-, h-, py-) dibuang agar tidak bentrok urutan CSS.
const PREFIXES = ['w-', 'h-', 'py-', 'px-', 'pl-', 'pr-', 'min-h-'];
function merge(base, extra) {
  if (!extra) return base;
  const ex = extra.split(/\s+/);
  const over = PREFIXES.filter((p) => ex.some((c) => c.startsWith(p)));
  return [...base.split(/\s+/).filter((c) => !over.some((p) => c.startsWith(p))), ...ex].join(' ');
}

const BTN = {
  primary: 'bg-brand text-white hover:bg-brand-2 shadow-sm shadow-brand/20',
  navy: 'bg-navy text-white hover:bg-ink',
  secondary: 'bg-white text-ink border border-line hover:border-brand/40 hover:bg-sky-wash',
  ghost: 'text-ink/80 hover:bg-sky-wash hover:text-ink',
  danger: 'bg-white text-red-700 border border-red-200 hover:bg-red-50',
  wa: 'bg-[#128C4A] text-white hover:bg-[#0E7A40]',
};

export function Button({ variant = 'secondary', size = 'md', icon: Icon, busy, className, children, ...rest }) {
  const sz = size === 'sm' ? 'h-8 px-2.5 text-[13px] gap-1.5' : size === 'lg' ? 'h-11 px-5 text-[15px] gap-2' : 'h-9 px-3.5 text-sm gap-2';
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center rounded-md font-semibold transition-colors whitespace-nowrap',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50 disabled:pointer-events-none',
        BTN[variant],
        sz,
        className
      )}
      disabled={busy || rest.disabled}
      {...rest}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function Panel({ title, eyebrow, actions, children, className, bodyClass, id }) {
  return (
    <section id={id} className={cx('min-w-0 rounded-[14px] border border-line bg-white', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand">{eyebrow}</p>}
            {title && <h2 className="font-serif text-[19px] font-semibold leading-tight text-ink text-balance">{title}</h2>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx('px-5 py-4', bodyClass)}>{children}</div>
    </section>
  );
}

const TONES = {
  ok: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
  warn: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  late: 'bg-red-50 text-red-800 ring-red-600/20',
  muted: 'bg-slate-100 text-slate-700 ring-slate-500/15',
  brand: 'bg-sky-wash text-navy ring-brand/20',
  navy: 'bg-navy text-white ring-navy',
};

export function Badge({ tone = 'muted', children, className, icon: Icon }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ring-1 ring-inset whitespace-nowrap', TONES[tone], className)}>
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </span>
  );
}

const DOT = { ok: 'bg-emerald-600', warn: 'bg-amber-500', late: 'bg-red-600', muted: 'bg-slate-400', brand: 'bg-brand' };
export function StatusDot({ tone = 'muted', label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink whitespace-nowrap">
      <span className={cx('size-2 rounded-full', DOT[tone])} aria-hidden />
      {label}
    </span>
  );
}

export function Field({ label, hint, children, className, htmlFor }) {
  return (
    <label className={cx('flex min-w-0 flex-col gap-1.5', className)} htmlFor={htmlFor}>
      <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-muted">{hint}</span>}
    </label>
  );
}

const INPUT =
  'w-full rounded-md border border-line bg-white px-3 text-[14px] text-ink placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15 disabled:bg-mist disabled:text-muted';
const INPUT_H = `${INPUT} h-10`;

export const Input = React.forwardRef(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={merge(INPUT_H, className)} {...p} />;
});
export function Textarea({ className, ...p }) {
  return <textarea className={merge(`${INPUT} min-h-[76px] py-2 leading-relaxed`, className)} {...p} />;
}
export function Select({ className, children, ...p }) {
  return (
    <select className={merge(`${INPUT_H} pr-8`, className)} {...p}>
      {children}
    </select>
  );
}

export function Progress({ value, max, tone = 'brand', className }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  const bar = tone === 'ok' ? 'bg-emerald-600' : tone === 'warn' ? 'bg-amber-500' : 'bg-brand';
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-slate-100', className)} role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={cx('h-full rounded-full transition-[width] duration-500', bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Modal({ open, onClose, title, eyebrow, children, footer, size = 'md' }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement;
    setTimeout(() => ref.current?.querySelector('input,textarea,select,button')?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  const w = size === 'lg' ? 'max-w-4xl' : size === 'sm' ? 'max-w-md' : 'max-w-2xl';
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx('flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl', w)}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand">{eyebrow}</p>}
            <h3 id={titleId} className="font-serif text-lg font-semibold text-ink text-balance">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-sky-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-brand" aria-label="Tutup">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-mist px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Callout({ tone = 'info', title, children, className }) {
  const map = {
    info: ['border-brand/20 bg-sky-wash text-navy', Info],
    warn: ['border-amber-300/60 bg-amber-50 text-amber-900', AlertTriangle],
    ok: ['border-emerald-300/60 bg-emerald-50 text-emerald-900', CheckCircle2],
    error: ['border-red-300/60 bg-red-50 text-red-900', AlertTriangle],
  };
  const [cls, Icon] = map[tone];
  return (
    <div className={cx('flex gap-3 rounded-lg border px-4 py-3 text-[13.5px] leading-relaxed', cls, className)} role={tone === 'error' ? 'alert' : undefined}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {Icon && <Icon className="size-8 text-brand/50" aria-hidden />}
      <p className="font-serif text-[17px] font-semibold text-ink">{title}</p>
      {children && <div className="max-w-md text-[13.5px] text-muted">{children}</div>}
    </div>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  const err = toast.tone === 'error';
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4"
      style={{ bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
      role="status"
      aria-live="polite"
    >
      <div className={cx('pointer-events-auto flex max-w-lg items-start gap-2.5 rounded-xl px-4 py-3 text-[14px] font-medium shadow-xl', err ? 'bg-red-700 text-white' : 'bg-ink text-white')}>
        {err ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" />}
        <span>{toast.message}</span>
      </div>
    </div>
  );
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-mist p-0.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-8 rounded-md px-3 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand',
            value === o.value ? 'bg-white text-navy shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
