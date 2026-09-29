// Stamp a copyright line into a JPEG after the browser has re-encoded it.
//
// Every member upload (portfolio, cover, profile photo) is redrawn on a canvas
// first, which strips ALL embedded data — including GPS, so a photo shot at
// home can't reveal the address. This adds back ONLY the credit: EXIF Artist
// + Copyright ("Copyright 2026 Jane Doe. All rights reserved."), so the image
// still names its owner when saved elsewhere. EXIF is ASCII-only, so accented
// names are folded to plain letters. Never throws: on any problem the image is
// returned unchanged (still stripped, just unstamped).

const ascii = (s: string) => s.normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim()

export async function stampCopyright(blob: Blob, ownerName: string): Promise<Blob> {
  try {
    const src = new Uint8Array(await blob.arrayBuffer())
    if (src[0] !== 0xff || src[1] !== 0xd8) return blob // not a JPEG
    const who = ascii(ownerName) || 'Made Kulture member'
    const fields: [number, string][] = [
      [0x013b, who],                                                          // Artist
      [0x8298, `Copyright ${new Date().getFullYear()} ${who}. All rights reserved.`], // Copyright
    ]
    const enc = fields.map(([tag, s]) => [tag, new TextEncoder().encode(s + '\0')] as const)
    const ifdSize = 2 + enc.length * 12 + 4
    let dataOff = 8 + ifdSize
    const tiffLen = dataOff + enc.reduce((n, [, b]) => n + (b.length > 4 ? b.length : 0), 0)
    const tiff = new Uint8Array(tiffLen)
    const dv = new DataView(tiff.buffer)
    tiff.set([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]) // big-endian TIFF header, IFD0 at 8
    dv.setUint16(8, enc.length)
    let p = 10
    for (const [tag, bytes] of enc) {
      dv.setUint16(p, tag); dv.setUint16(p + 2, 2 /* ASCII */); dv.setUint32(p + 4, bytes.length)
      if (bytes.length <= 4) tiff.set(bytes, p + 8)
      else { dv.setUint32(p + 8, dataOff); tiff.set(bytes, dataOff); dataOff += bytes.length }
      p += 12
    }
    dv.setUint32(p, 0) // no next IFD
    const exifHdr = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00] // "Exif\0\0"
    const segLen = 2 + exifHdr.length + tiff.length
    if (segLen > 0xffff) return blob
    const app1 = new Uint8Array(2 + segLen)
    app1.set([0xff, 0xe1, segLen >> 8, segLen & 0xff])
    app1.set(exifHdr, 4)
    app1.set(tiff, 10)
    const out = new Uint8Array(src.length + app1.length)
    out.set(src.subarray(0, 2), 0)        // SOI
    out.set(app1, 2)                      // our EXIF, right after SOI
    out.set(src.subarray(2), 2 + app1.length)
    return new Blob([out], { type: 'image/jpeg' })
  } catch {
    return blob
  }
}
