/** Keep native metadata envelopes out of the Java whole-message bridge. */
export type MetadataKind='source'|'text'|'pdf'|'recovery'|'bookmarks'
export interface MetadataSnapshot {content:string|null;revision:string}
export const metadataChunkBytes=16*1024
type Send=(payload:Record<string,unknown>)=>Promise<unknown>
const failed=()=>Error('READ_FAILED: 本机记录传输无法核对，当前输入仍保留，请重试。')
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)
const revision=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
const token=(value:unknown):value is string=>typeof value==='string'&&/^m[1-9][0-9]{0,19}$/.test(value)
const limit=(kind:MetadataKind)=>kind==='bookmarks'?512*1024:5*1024*1024
const hash=async(bytes:Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('')
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes))
function decode(value:unknown){
 if(typeof value!=='string'||value.length>Math.ceil(metadataChunkBytes/3)*4||!value.length||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw failed()
 const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));if(!bytes.length||bytes.length>metadataChunkBytes||encode(bytes)!==value)throw failed();return bytes
}
export function createMetadataTransport(send:Send){
 const end=async(id:string)=>{try{await send({op:'metadataEnd',transferId:id})}catch{/* Finite native sessions also expire after idle time. */}}
 return{
  async read(kind:MetadataKind):Promise<MetadataSnapshot>{
   const start=await send({op:'metadataBeginRead',kind});if(!object(start))throw failed()
   if(start.transferId===null&&start.size===0&&start.revision==='missing')return{content:null,revision:'missing'}
   if(!token(start.transferId))throw failed()
   const id=start.transferId
   try{
    if(!Number.isSafeInteger(start.size)||Number(start.size)<=0||Number(start.size)>limit(kind)||!revision(start.revision))throw failed()
    const bytes=new Uint8Array(Number(start.size));let offset=0
    while(offset<bytes.length){
     const reply=await send({op:'metadataReadChunk',transferId:id,offset});if(!object(reply)||reply.offset!==offset)throw failed()
     const chunk=decode(reply.base64);if(chunk.length>bytes.length-offset||reply.next!==offset+chunk.length)throw failed()
     bytes.set(chunk,offset);offset+=chunk.length
    }
    if(await hash(bytes)!==start.revision)throw failed()
    let content:string;try{content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes)}catch{throw failed()}
    return{content,revision:start.revision}
   }finally{await end(id)}
  },
  async write(kind:MetadataKind,content:string,expectedRevision:string):Promise<MetadataSnapshot>{
   if(!(expectedRevision==='missing'||revision(expectedRevision)))throw failed()
   const bytes=new TextEncoder().encode(content)
   if(bytes.length>limit(kind))throw Error(kind==='bookmarks'?'WRITE_FAILED: 本机书签空间已达512 KiB上限，原记录仍保留。':'WRITE_FAILED: 本机记录超过5 MiB，原记录仍保留。')
   if(!bytes.length||new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes)!==content)throw failed()
   const digest=await hash(bytes)
   const start=await send({op:'metadataBeginWrite',kind,size:bytes.length,revision:digest,expectedRevision})
   if(!object(start)||!token(start.transferId))throw failed()
   const id=start.transferId
   try{
    for(let offset=0;offset<bytes.length;offset+=metadataChunkBytes){
     const chunk=bytes.subarray(offset,offset+metadataChunkBytes)
     const reply=await send({op:'metadataWriteChunk',transferId:id,offset,base64:encode(chunk)})
     if(!object(reply)||reply.next!==offset+chunk.length)throw failed()
    }
    const saved=await send({op:'metadataCommit',transferId:id})
    if(!object(saved)||saved.revision!==digest||saved.size!==bytes.length)throw failed()
    return{content,revision:digest}
   }finally{await end(id)}
  }
 }
}
