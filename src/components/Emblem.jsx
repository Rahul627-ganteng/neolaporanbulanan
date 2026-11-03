import React from 'react';

/** Motif bintang delapan (khatam) — ornamen geometris generik, bukan logo resmi pondok. */
export default function Emblem({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect x="0" y="0" width="64" height="64" rx="14" fill="#1E3A8A" />
      <g fill="none" stroke="#BFD3FB" strokeWidth="2.2" strokeLinejoin="round">
        <rect x="17" y="17" width="30" height="30" />
        <rect x="17" y="17" width="30" height="30" transform="rotate(45 32 32)" />
      </g>
      <circle cx="32" cy="32" r="7.5" fill="#FFFFFF" />
      <circle cx="32" cy="32" r="3.2" fill="#2563EB" />
    </svg>
  );
}
