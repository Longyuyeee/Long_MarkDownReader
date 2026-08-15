import fs from 'node:fs/promises'
import path from 'node:path'

const target = process.argv[2]
if (!target) throw new Error('P1-B2B5 radio fixture target is required')

const objects = new Map()
const stream = (content, entries = '') => `<< ${entries} /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
const radioOff = 'q 1 g 0 0 20 20 re f 0 G 1 w 10 2 m 14.42 2 18 5.58 18 10 c 18 14.42 14.42 18 10 18 c 5.58 18 2 14.42 2 10 c 2 5.58 5.58 2 10 2 c S Q'
const radioOn = `${radioOff.slice(0, -2)} 0 g 10 6 m 12.21 6 14 7.79 14 10 c 14 12.21 12.21 14 10 14 c 7.79 14 6 12.21 6 10 c 6 7.79 7.79 6 10 6 c f Q`
objects.set(1, '<< /Type /Catalog /Pages 2 0 R /AcroForm 6 0 R >>')
objects.set(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
objects.set(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /Helv 5 0 R >> >> /Contents 4 0 R /Annots [8 0 R 9 0 R] >>')
objects.set(4, stream('BT /Helv 22 Tf 72 720 Td (LongEdit Radio Form) Tj /Helv 11 Tf 0 -34 Td (Preferred plan - choose one option) Tj 28 -100 Td (Standard) Tj 0 -40 Td (Professional) Tj ET'))
objects.set(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
objects.set(6, '<< /Fields [7 0 R] /NeedAppearances false >>')
objects.set(7, '<< /FT /Btn /T (Profile.Plan) /V /Standard /Ff 32768 /Kids [8 0 R 9 0 R] >>')
objects.set(8, '<< /Type /Annot /Subtype /Widget /Parent 7 0 R /AS /Standard /Rect [72 570 92 590] /P 3 0 R /AP << /N << /Off 10 0 R /Standard 11 0 R >> >> >>')
objects.set(9, '<< /Type /Annot /Subtype /Widget /Parent 7 0 R /AS /Off /Rect [72 530 92 550] /P 3 0 R /AP << /N << /Off 12 0 R /Professional 13 0 R >> >> >>')
objects.set(10, stream(radioOff, '/Type /XObject /Subtype /Form /BBox [0 0 20 20]'))
objects.set(11, stream(radioOn, '/Type /XObject /Subtype /Form /BBox [0 0 20 20]'))
objects.set(12, stream(radioOff, '/Type /XObject /Subtype /Form /BBox [0 0 20 20]'))
objects.set(13, stream(radioOn, '/Type /XObject /Subtype /Form /BBox [0 0 20 20]'))

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
