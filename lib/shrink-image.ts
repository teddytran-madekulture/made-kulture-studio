// Client-side: shrink a photo before upload (≤ maxEdge px long side, JPEG).
// Every upload in this project goes through a Vercel function capped at a
// 4.5 MB request body, so big phone photos must be made small FIRST.
export async function shrinkImage(file: File, maxEdge = 1600, quality = 0.84): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale)
    const c = document.createElement('canvas'); c.width = w; c.height = h
    c.getContext('2d')!.drawImage(img, 0, 0, w, h)
    return await new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('encode')), 'image/jpeg', quality))
  } finally { URL.revokeObjectURL(url) }
}
