import fs from 'node:fs/promises'
import path from 'node:path'

const target = process.argv[2]
if (!target) throw new Error('P1-B3D redaction fixture target is required')

const secret = 'SECRET-P1B3D-ALPHA-9284'
const objects = new Map()
const stream = content => `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
objects.set(1, '<< /Type /Catalog /Pages 2 0 R /Outlines 10 0 R >>')
objects.set(2, '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>')
objects.set(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /Helv 5 0 R >> >> /Contents 4 0 R /Annots [8 0 R] >>')
objects.set(4, stream(`BT /Helv 24 Tf 60 720 Td (P1-B3D Permanent Redaction Evidence) Tj /Helv 12 Tf 0 -48 Td (Public record: Account audit remains readable.) Tj /Helv 16 Tf 0 -90 Td (${secret}) Tj /Helv 12 Tf 0 -80 Td (Public footer: Retain this sentence after redaction.) Tj ET`))
objects.set(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
objects.set(6, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /Helv 5 0 R >> >> /Contents 7 0 R >>')
objects.set(7, stream('BT /Helv 24 Tf 60 720 Td (P1-B3D Public Page Two) Tj /Helv 12 Tf 0 -48 Td (All pages must survive in source order.) Tj 0 -32 Td (This page confirms readable unredacted output.) Tj ET'))
objects.set(8, '<< /Type /Annot /Subtype /Link /Rect [60 650 360 686] /Border [0 0 1] /A << /S /URI /URI (https://example.invalid/private-link) >> >>')
objects.set(9, `<< /Title (P1-B3D fixture) /Subject (${secret}) /Author (LongEdit audit) >>`)
objects.set(10, '<< /Type /Outlines /Count 0 >>')

let pdf = '%PDF-1.7\n%LongEdit P1-B3D\n'
const offsets = [0]
for (const [id, body] of objects) {
  offsets[id] = Buffer.byteLength(pdf)
  pdf += `${id} 0 obj\n${body}\nendobj\n`
}
const xref = Buffer.byteLength(pdf)
pdf += `xref\n0 ${objects.size + 1}\n0000000000 65535 f \n`
for (let id = 1; id <= objects.size; id += 1) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
pdf += `trailer\n<< /Size ${objects.size + 1} /Root 1 0 R /Info 9 0 R >>\nstartxref\n${xref}\n%%EOF\n`

await fs.mkdir(path.dirname(path.resolve(target)), { recursive: true })
await fs.writeFile(target, Buffer.from(pdf, 'binary'))
console.log(target)
