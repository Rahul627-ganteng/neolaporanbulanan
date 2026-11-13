import React from 'react';
import logoPutih from '../assets/logo-darul-marifat-putih.png';
import logoNavy from '../assets/logo-darul-marifat-navy.png';

export const LOGO_PUTIH = logoPutih;
export const LOGO_NAVY = logoNavy;

/** Logo resmi Darul Ma'rifat (PMDG Kampus 3). tone="putih" untuk latar gelap, "navy" untuk latar terang. */
export default function Logo({ tone = 'putih', className, alt = "Logo Pondok Modern Darussalam Gontor Kampus 3 Darul Ma'rifat" }) {
  return (
    <img
      src={tone === 'navy' ? logoNavy : logoPutih}
      alt={alt}
      width="256"
      height="256"
      className={className}
      draggable="false"
      decoding="async"
    />
  );
}
