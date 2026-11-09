/** Small ZIP writer for browser preview. No archive parser or extraction. */
export function storedZip(files: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder(), locals: Uint8Array[] = [], central: Uint8Array[] = []
  let offset = 0
  const crc32 = (bytes: Uint8Array) => { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0) } return (crc ^ 0xffffffff) >>> 0 }
  for (const file of files) {
    const name = encoder.encode(file.name), crc = crc32(file.bytes)
    const local = new Uint8Array(30 + name.length), view = new DataView(local.buffer)
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true); view.setUint16(12, 33, true)
    view.setUint32(14, crc, true); view.setUint32(18, file.bytes.length, true); view.setUint32(22, file.bytes.length, true); view.setUint16(26, name.length, true); local.set(name, 30)
    const entry = new Uint8Array(46 + name.length), index = new DataView(entry.buffer)
    index.setUint32(0, 0x02014b50, true); index.setUint16(4, 20, true); index.setUint16(6, 20, true); index.setUint16(8, 0x800, true); index.setUint16(14, 33, true)
    index.setUint32(16, crc, true); index.setUint32(20, file.bytes.length, true); index.setUint32(24, file.bytes.length, true); index.setUint16(28, name.length, true); index.setUint32(42, offset, true); entry.set(name, 46)
    locals.push(local, file.bytes); central.push(entry); offset += local.length + file.bytes.length
  }
  const centralSize = central.reduce((sum, entry) => sum + entry.length, 0), end = new Uint8Array(22), view = new DataView(end.buffer)
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, files.length, true); view.setUint16(10, files.length, true); view.setUint32(12, centralSize, true); view.setUint32(16, offset, true)
  const result = new Uint8Array(offset + centralSize + 22); let cursor = 0
  for (const part of [...locals, ...central, end]) { result.set(part, cursor); cursor += part.length }
  return result
}
