// A legitimate generated PDF, not a bitmap/blank canvas substituted for a reader.
export function readingPdfFixture(pageCount=86){
 const objects=[],put=(id,text)=>objects[id]=`${id} 0 obj\n${text}\nendobj\n`
 put(1,'<< /Type /Catalog /Pages 2 0 R >>');put(3,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
 const kids=[]
 for(let page=1;page<=pageCount;page++){
  const id=4+(page-1)*2,stream=`BT /F1 18 Tf 50 720 Td (Reading source page ${page}) Tj 0 -50 Td /F1 12 Tf (Keep the original page and source when writing notes.) Tj ET\n`
  kids.push(`${id} 0 R`);put(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id+1} 0 R >>`);put(id+1,`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`)
 }
 put(2,`<< /Type /Pages /Count ${pageCount} /Kids [${kids.join(' ')}] >>`)
 let text='%PDF-1.4\n',offsets=[0]
 for(let id=1;id<objects.length;id++){offsets.push(Buffer.byteLength(text));text+=objects[id]}
 const xref=Buffer.byteLength(text);text+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
 return Buffer.from(text)
}
