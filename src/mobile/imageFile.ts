/** Read dimensions before the browser preview adapter allocates decoded pixels.
 * Android independently verifies actual bytes with BitmapFactory bounds. */
export function imageFileInfo(bytes: Uint8Array) {
  if (bytes.length > 2 * 1024 * 1024) throw new Error('图片支持 2 MiB 以内的文件')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ascii = (from: number, count: number) => String.fromCharCode(...bytes.subarray(from, from + count))
  let mime = '', width = 0, height = 0
  if (bytes.length >= 24 && ascii(0, 8) === '\x89PNG\r\n\x1a\n' && ascii(12, 4) === 'IHDR') { mime = 'image/png'; width = view.getUint32(16); height = view.getUint32(20) }
  else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2
    while (at + 4 <= bytes.length) {
      if (bytes[at++] !== 0xff) break
      while (bytes[at] === 0xff) at++
      const marker = bytes[at++]!
      if (marker === 0xda || marker === 0xd9) break
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd8) continue
      if (at + 2 > bytes.length) break
      const length = view.getUint16(at)
      if (length < 2 || at + length > bytes.length) break
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 8) { mime = 'image/jpeg'; height = view.getUint16(at + 3); width = view.getUint16(at + 5); break }
      at += length
    }
  } else if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    for (let at = 12; at + 8 <= bytes.length;) {
      const type = ascii(at, 4), length = view.getUint32(at + 4, true), start = at + 8
      if (start + length > bytes.length) break
      if (type === 'VP8X' && length >= 10) { width = 1 + bytes[start + 4]! + (bytes[start + 5]! << 8) + (bytes[start + 6]! << 16); height = 1 + bytes[start + 7]! + (bytes[start + 8]! << 8) + (bytes[start + 9]! << 16) }
      else if (type === 'VP8 ' && length >= 10 && ascii(start + 3, 3) === '\x9d\x01\x2a') { width = view.getUint16(start + 6, true) & 0x3fff; height = view.getUint16(start + 8, true) & 0x3fff }
      else if (type === 'VP8L' && length >= 5 && bytes[start] === 0x2f) { const bits = view.getUint32(start + 1, true); width = (bits & 0x3fff) + 1; height = (bits >>> 14 & 0x3fff) + 1 }
      if (width && height) { mime = 'image/webp'; break }
      at = start + length + (length % 2)
    }
  }
  if (!mime || !width || !height) throw new Error('图片内容无法识别，支持 PNG、JPEG 和 WebP')
  if (width > 8192 || height > 8192 || width * height > 8000000) throw new Error('图片分辨率超过当前 800 万像素限制')
  return { mime, width, height, bytes: bytes.length }
}
