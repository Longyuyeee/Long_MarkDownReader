import fs from 'node:fs/promises'
import path from 'node:path'

const target = process.argv[2]
if (!target) throw new Error('P1-B2B6 choice fixture target is required')
const objects = new Map()
const stream = (content, entries = '') => `<< ${entries} /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
objects.set(1, '<< /Type /Catalog /Pages 2 0 R /AcroForm 6 0 R >>')
objects.set(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
objects.set(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /Helv 5 0 R >> >> /Contents 4 0 R /Annots [7 0 R] >>')
objects.set(4, stream('BT /Helv 22 Tf 72 720 Td (LongEdit Choice Form) Tj /Helv 11 Tf 0 -34 Td (Region selection - export and display values differ) Tj 0 -92 Td (Selected region:) Tj ET'))
objects.set(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
objects.set(6, '<< /Fields [7 0 R] /NeedAppearances false /DR << /Font << /Helv 5 0 R >> >> >>')
objects.set(7, '<< /Type /Annot /Subtype /Widget /FT /Ch /T (Profile.Region) /V (region-north) /I [0] /Ff 131072 /Opt [[(region-north) (Northwest Operations)] [(region-east) (East)] [(region-south) (South)]] /Rect [72 560 300 588] /P 3 0 R /AP << /N 8 0 R >> >>')
objects.set(8, stream('q 1 g 0 0 228 28 re f 0.75 G 0 0 228 28 re S BT /Helv 10 Tf 0 g 4 9 Td (Northwest Operations) Tj ET Q', '/Type /XObject /Subtype /Form /BBox [0 0 228 28] /Resources << /Font << /Helv 5 0 R >> >>'))
let pdf = '%PDF-1.7\n%LongEdit\n'
const offsets = [0]
for (const [id, body] of objects) { offsets[id] = Buffer.byteLength(pdf); pdf += `${id} 0 obj\n${body}\nendobj\n` }
const xref = Buffer.byteLength(pdf)
pdf += `xref\n0 ${objects.size + 1}\n0000000000 65535 f \n`
for (let id = 1; id <= objects.size; id += 1) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
pdf += `trailer\n<< /Size ${objects.size + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
await fs.mkdir(path.dirname(path.resolve(target)), { recursive: true })
await fs.writeFile(target, Buffer.from(pdf, 'binary'))
console.log(target)
