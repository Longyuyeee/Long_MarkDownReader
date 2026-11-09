export interface PdfOutlineRow { id:string; title:string; depth:number; parents:string[]; children:boolean; destination:unknown; local:boolean }
export function flattenPdfOutline(input:unknown) {
  const rows:PdfOutlineRow[]=[], seen=new WeakSet<object>()
  let partial=false
  const stack:Array<{node:unknown;depth:number;id:string;parents:string[]}>=[]
  const push=(items:unknown[],depth:number,parent:string,parents:string[])=>{
    if(items.length>500)partial=true
    for(let i=Math.min(items.length,500)-1;i>=0;i--)stack.push({node:items[i],depth,id:parent+String(i),parents})
  }
  if(Array.isArray(input))push(input,0,'outline-',[])
  while(stack.length && rows.length<500){
    const {node,depth,id,parents}=stack.pop()!
    if(!node || typeof node!=='object' || Array.isArray(node) || seen.has(node)){partial=true;continue}
    seen.add(node)
    const value=node as Record<string,unknown>, items=Array.isArray(value.items)?value.items:[]
    const title=typeof value.title==='string'?Array.from(value.title.replace(/[\u0000-\u001f\u007f]/g,' ').trim()).slice(0,200).join(''):''
    rows.push({id,title:title||'未命名章节',depth,parents,children:items.length>0 && depth<12,destination:value.dest,local:!value.url && !value.unsafeUrl && !value.action && !value.newWindow && (typeof value.dest==='string' || Array.isArray(value.dest))})
    if(items.length){if(depth<12)push(items,depth+1,id+'-',[...parents,id]);else partial=true}
  }
  return {rows,partial:partial||stack.length>0}
}
interface DestinationDocument { numPages:number; getDestination(name:string):Promise<unknown>; getPageIndex(ref:{num:number;gen:number}):Promise<number> }
/** Resolve only a local page. Never follow URL/action destinations or apply PDF scripts. */
export async function resolvePdfDestination(pdf:DestinationDocument,destination:unknown,cancelled:()=>boolean=()=>false):Promise<number|null>{
  if(cancelled())return null
  let explicit=destination
  if(typeof destination==='string'){
    if(!destination || destination.length>512 || /[\u0000-\u001f\u007f]/.test(destination))return null
    explicit=await pdf.getDestination(destination)
  }
  if(cancelled() || !Array.isArray(explicit) || !explicit.length || explicit.length>10)return null
  const target=explicit[0]
  let index:unknown=target
  if(target && typeof target==='object' && !Array.isArray(target)){
    const {num,gen}=target
    if(!Number.isSafeInteger(num)||num<=0||!Number.isSafeInteger(gen)||gen<0)return null
    index=await pdf.getPageIndex({num,gen})
  }
  if(cancelled() || typeof index!=='number' || !Number.isSafeInteger(index) || index<0 || index>=pdf.numPages)return null
  return index+1
}
export function pdfThumbnailBatch(page:number,count:number){
  if(!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(page)||page<1||page>count)throw new Error('页面范围无效。')
  const first=Math.floor((page-1)/6)*6+1
  return Array.from({length:Math.min(6,count-first+1)},(_,i)=>first+i)
}
export function pdfThumbnailSize(width:number,height:number,density=1){
  if(![width,height].every(v=>Number.isFinite(v)&&v>0))throw new Error('页面尺寸无效。')
  const pixelRatio=Number.isFinite(density)?Math.max(1,Math.min(2,density)):1
  const scale=Math.min(160*pixelRatio/width,210*pixelRatio/height)
  if(!Number.isFinite(scale)||scale<=0)throw new Error('页面尺寸无效。')
  return {scale,width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))}
}
export function pdfThumbnailQueue(){
  let pending=Promise.resolve()
  return (work:()=>Promise<void>)=>{const next=pending.then(work);pending=next.catch(()=>{});return next}
}
