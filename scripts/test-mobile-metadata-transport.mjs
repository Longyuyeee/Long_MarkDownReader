import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createMetadataTransport,metadataChunkBytes as chunk} from '../src/mobile/metadataTransport.ts'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
function backend(initial=null){
 const state={value:initial,sessions:new Map(),calls:[],closed:[],commits:0,sequence:0}
 state.send=async p=>{
  state.calls.push(p)
  if(p.op==='metadataBeginRead'){
   if(state.value===null)return{transferId:null,size:0,revision:'missing'}
   const data=Buffer.from(state.value),id='m'+ ++state.sequence;state.sessions.set(id,{data})
   return{transferId:id,size:data.length,revision:sha(data)}
  }
  if(p.op==='metadataBeginWrite'){const id='m'+ ++state.sequence;state.sessions.set(id,{data:[],...p});return{transferId:id}}
  if(p.op==='metadataEnd'){state.closed.push(p.transferId);state.sessions.delete(p.transferId);return{closed:true}}
  const s=state.sessions.get(p.transferId);assert.ok(s)
  if(p.op==='metadataReadChunk'){const data=s.data.subarray(p.offset,p.offset+chunk);return{offset:p.offset,next:p.offset+data.length,base64:data.toString('base64')}}
  if(p.op==='metadataWriteChunk'){const bytes=Buffer.from(p.base64,'base64');s.data.push(bytes);assert.equal(Buffer.concat(s.data).length,p.offset+bytes.length);return{next:p.offset+bytes.length}}
  if(p.op==='metadataCommit'){const bytes=Buffer.concat(s.data);assert.equal(sha(bytes),s.revision);assert.equal(bytes.length,s.size);assert.equal(s.expectedRevision,state.value===null?'missing':sha(Buffer.from(state.value)));state.value=bytes.toString();state.commits++;return{size:bytes.length,revision:s.revision}}
  throw Error('unexpected op')
 }
 return state
}
test('missing is explicit; zero length and inconsistent missing are rejected',async()=>{
 const b=backend();assert.deepEqual(await createMetadataTransport(b.send).read('source'),{content:null,revision:'missing'});assert.equal(b.calls.length,1)
 for(const start of [{transferId:null,size:1,revision:'missing'},{transferId:'m1',size:0,revision:'a'.repeat(64)},{transferId:'m1',size:5*1024*1024+1,revision:'a'.repeat(64)}]){
  const calls=[];await assert.rejects(createMetadataTransport(async p=>{calls.push(p);return start}).read('source'));if(start.transferId==='m1')assert.equal(calls.at(-1).op,'metadataEnd')
 }
})
test('5 MiB Unicode crosses byte boundaries and returns only after full digest validation',async()=>{
 const value=('x'.repeat(chunk-1)+'😀汉').repeat(320).padEnd(5*1024*1024,' ').slice(0,5*1024*1024-3000)
 // Size is bytes, never a JS character-count budget.
 const text=new TextDecoder().decode(new TextEncoder().encode(value).subarray(0,5*1024*1024-8))
 const b=backend(text),t=createMetadataTransport(b.send),before=await t.read('source');assert.equal(before.content,text)
 const next=JSON.stringify({version:1,records:{},future:text.slice(0,-500)})
 const saved=await t.write('source',next,before.revision);assert.equal(saved.content,next);assert.equal((await t.read('source')).content,next);assert.equal(b.commits,1);assert.equal(b.sessions.size,0)
 assert.ok(b.calls.every(p=>JSON.stringify(p).length<23000));assert.ok(b.calls.filter(p=>p.op==='metadataWriteChunk').every(p=>Buffer.from(p.base64,'base64').length<=chunk))
})
test('bad offsets, repeated bytes, malformed base64, hash changes and invalid UTF8 all release reads',async()=>{
 for(const fault of [
  r=>({...r,offset:1}),r=>({...r,next:r.next+1}),r=>({...r,base64:'Y R=='}),r=>({...r,base64:'YR=='}),r=>({...r,base64:'eA==',next:1}),
 ]){
  const b=backend('a'.repeat(chunk+3));await assert.rejects(createMetadataTransport(async p=>{const r=await b.send(p);return p.op==='metadataReadChunk'?fault(r):r}).read('source'));assert.equal(b.sessions.size,0)
 }
 const bytes=Buffer.from([0xff]),calls=[];await assert.rejects(createMetadataTransport(async p=>{calls.push(p);return p.op==='metadataBeginRead'?{transferId:'m1',size:1,revision:sha(bytes)}:{offset:0,next:1,base64:bytes.toString('base64')}}).read('source'));assert.equal(calls.at(-1).op,'metadataEnd')
})
test('BOM and Unicode are not silently stripped or replaced',async()=>{
 const b=backend('\ufeffhello😀');assert.equal((await createMetadataTransport(b.send).read('source')).content,b.value)
 await assert.rejects(createMetadataTransport(b.send).write('source','\ud800','missing'));assert.equal(b.calls.some(p=>p.op==='metadataBeginWrite'),false)
})
test('wrong chunk acknowledgement, transport interruption and unconfirmed commit keep the old value',async()=>{
 for(const mode of ['ack','interrupt','commit']){
  const b=backend('original'),t=createMetadataTransport(async p=>{
   if(mode==='interrupt'&&p.op==='metadataWriteChunk')throw Error('connection')
   if(mode==='commit'&&p.op==='metadataCommit')return{revision:'a'.repeat(64),size:10}
   const r=await b.send(p);return mode==='ack'&&p.op==='metadataWriteChunk'?{next:0}:r
  })
  await assert.rejects(t.write('source','new value',sha(Buffer.from('original'))));assert.equal(b.value,'original');assert.equal(b.sessions.size,0);assert.equal(b.commits,0)
 }
})
test('over-limit, invalid revisions and zero length fail before opening a write session',async()=>{
 const b=backend(),t=createMetadataTransport(b.send)
 for(const [kind,value,expected]of [['source','x'.repeat(5*1024*1024+1),'missing'],['bookmarks','x'.repeat(512*1024+1),'missing'],['source','','missing'],['source','x','bad']])await assert.rejects(t.write(kind,value,expected))
 assert.equal(b.calls.length,0)
})
test('read failure never creates a default record or a write',async()=>{
 const b=backend('original'),t=createMetadataTransport(async p=>{if(p.op==='metadataReadChunk')throw Error('disk');return b.send(p)})
 await assert.rejects(t.read('source'));assert.equal(b.value,'original');assert.equal(b.commits,0);assert.equal(b.sessions.size,0)
})
test('cleanup failure does not conceal a confirmed snapshot; commit acknowledgement is checked',async()=>{
 const b=backend('x'),t=createMetadataTransport(async p=>{if(p.op==='metadataEnd')throw Error('gone');return b.send(p)})
 assert.equal((await t.read('source')).content,'x')
 const c=backend();await assert.rejects(createMetadataTransport(async p=>{const r=await c.send(p);return p.op==='metadataCommit'?{...r,size:r.size+1}:r}).write('source','x','missing'));assert.equal(c.value,'x');assert.equal(c.sessions.size,0)
})
