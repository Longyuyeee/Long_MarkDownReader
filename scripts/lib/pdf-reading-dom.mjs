// Read real rendered controls/text/pixels; no component handlers or hidden state.
export function observePdfReadingPage(pageNumber){
 const shell=document.querySelector('#pdf-page-'+pageNumber),canvas=shell?.querySelector('canvas'),active=document.querySelector('.reading-row .annotation-card.active')
 if(!canvas||shell.querySelector('.page-placeholder'))return null
 const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data
 let opaquePixels=0,inkPixels=0
 for(let i=0;i<data.length;i+=64)if(data[i+3]>200){opaquePixels++;if(data[i]<180&&data[i+1]<180&&data[i+2]<180)inkPixels++}
 return {observedFrom:'rendered-pdf-controls-text-and-canvas',page:Number(document.querySelector('[aria-label="跳转到 PDF 页码"]')?.value),width:canvas.width,height:canvas.height,opaquePixels,inkPixels,text:shell.querySelector('.textLayer')?.textContent||'',placeholderAbsent:true,annotationId:active?.closest('.reading-row')?.querySelector('input')?.getAttribute('aria-label')?.replace(/^选择批注 /,'')||''}
}
export function observePdfReferenceNotice(){
 const el=document.querySelector('.reference-notice'),panel=el?.closest('.annotation-panel')
 if(!el||!panel)return null
 const r=el.getBoundingClientRect(),p=panel.getBoundingClientRect()
 return {observedFrom:'rendered-reference-notice-in-panel-viewport',text:el.textContent,top:r.top,bottom:r.bottom,parentTop:p.top,parentBottom:p.bottom,visible:r.top>=p.top&&r.bottom<=p.bottom}
}
