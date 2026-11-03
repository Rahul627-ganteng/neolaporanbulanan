// Unduh & salin. Di prototipe artefak claude.ai, unduhan lewat capability
// `downloads` (penampil meminta konfirmasi). Di situs produksi memakai
// tautan unduhan biasa.

export async function saveFile(filename, data) {
  if (typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function') {
    const downloads = await window.claude.use('downloads');
    if (!downloads) throw new Error('Unduhan tidak tersedia di tampilan ini. Buka artefak di claude.ai.');
    try {
      await downloads.save({ filename, data });
      return 'saved';
    } catch (e) {
      if (e && e.code === 'declined') return 'declined';
      throw new Error(e?.message || 'Unduhan gagal.');
    }
  }
  const blob = data instanceof Blob ? data : new Blob([data]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'saved';
}

/** Panggil langsung di dalam handler klik. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export function slug(s) {
  return String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}
