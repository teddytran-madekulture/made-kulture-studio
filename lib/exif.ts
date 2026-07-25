// Minimal EXIF reader — pulls DateTimeOriginal out of a JPEG and nothing else.
// Sixty lines beats a dependency for one tag, and it fails closed to `null`
// (unknown) rather than throwing on anything it doesn't recognise.
//
// Used as the backstop on the closeout-photo fallback path: when a worker can't
// use the live camera and picks a file instead, this is how we tell a photo shot
// just now from one out of last week's camera roll.

// "YYYY:MM:DD HH:MM:SS" with no timezone — EXIF records the phone's wall clock.
// Read it as studio time (America/Chicago), not as the server's UTC.
function chicagoWallTimeToInstant(y: number, mo: number, d: number, hh: number, mm: number, ss: number): number {
  const naive = Date.UTC(y, mo - 1, d, hh, mm, ss)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(naive))
  const g = (t: string) => Number(parts.find(p => p.type === t)?.value)
  const shifted = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'))
  return naive - (shifted - naive)
}

function readTiffDate(tiff: Buffer): Date | null {
  if (tiff.length < 8) return null
  const le = tiff.toString('ascii', 0, 2) === 'II'
  const u16 = (o: number) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o))
  const u32 = (o: number) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o))
  if (u16(2) !== 42) return null

  const walk = (start: number, depth: number): string | null => {
    if (depth > 2 || start <= 0 || start + 2 > tiff.length) return null
    const count = u16(start)
    let exifIfd = 0
    for (let i = 0; i < count; i++) {
      const e = start + 2 + i * 12
      if (e + 12 > tiff.length) break
      const tag = u16(e), type = u16(e + 2), n = u32(e + 4)
      if (tag === 0x8769) exifIfd = u32(e + 8)                      // ExifIFD pointer
      // 0x9003 DateTimeOriginal, 0x9004 DateTimeDigitized, 0x0132 DateTime
      if ((tag === 0x9003 || tag === 0x9004 || tag === 0x0132) && type === 2 && n >= 19) {
        const vo = n > 4 ? u32(e + 8) : e + 8
        if (vo > 0 && vo + 19 <= tiff.length) return tiff.toString('ascii', vo, vo + 19)
      }
    }
    return exifIfd ? walk(exifIfd, depth + 1) : null
  }

  const s = walk(u32(4), 0)
  if (!s) return null
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const [y, mo, d, hh, mi, ss] = m.slice(1).map(Number)
  if (!y || y < 1990 || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const t = chicagoWallTimeToInstant(y, mo, d, hh, mi, ss)
  return isNaN(t) ? null : new Date(t)
}

// null = no usable EXIF timestamp (a screenshot, a re-encoded upload, a stripped
// file). That's "unknown", never "old" — callers must not treat it as failure.
export function exifTakenAt(buf: Buffer): Date | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null   // not a JPEG
  let off = 2
  while (off + 4 <= buf.length) {
    if (buf[off] !== 0xff) return null
    const marker = buf[off + 1]
    if (marker === 0xda || marker === 0xd9) return null                   // image data starts
    const size = buf.readUInt16BE(off + 2)
    if (size < 2) return null
    if (marker === 0xe1 && off + 10 <= buf.length && buf.toString('ascii', off + 4, off + 10) === 'Exif\0\0') {
      return readTiffDate(buf.subarray(off + 10, Math.min(off + 2 + size, buf.length)))
    }
    off += 2 + size
  }
  return null
}
