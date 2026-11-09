import test from 'node:test'
import assert from 'node:assert/strict'
import {receivedPdfName,receivedPdfPath,checkPdfIntakeCapacity,checkedReceivedPdf,receivedPdfSize} from '../src/mobile/pdfImport.ts'
const id='24a36a56-c1db-4d10-aafe-71e12ee7188c'
test('received PDF names cannot escape their single new local file',()=>{assert.equal(receivedPdfName('../a/b\\c?.PDF'),'_a_b_c_.pdf');assert.equal(receivedPdfName(''),'阅读资料.pdf');assert.equal(receivedPdfName('来自其他应用'),'来自其他应用.pdf')})
test('Unicode names retain full code points with a bounded filename',()=>{assert.equal(receivedPdfName('😀'.repeat(60)+'.pdf'),'😀'.repeat(40)+'.pdf')})
test('stable delivery paths allow idempotent confirmation and separate equal-named deliveries',()=>{assert.equal(receivedPdfPath('阅读.pdf',id),`阅读-接收-${id}.pdf`);assert.notEqual(receivedPdfPath('阅读.pdf',id),receivedPdfPath('阅读.pdf',id.replace('24a3','34a3')));assert.throws(()=>receivedPdfPath('a.pdf','../escape'))})
test('PDF byte checks reject text renamed as PDF and enforce the actual 20MiB boundary',()=>{assert.throws(()=>checkedReceivedPdf(new TextEncoder().encode('# text')),/文件头/);assert.throws(()=>checkedReceivedPdf(new Uint8Array(20*1024*1024+1)),/20 MiB/);const b=new TextEncoder().encode('%PDF-1.7\n');assert.equal(checkedReceivedPdf(b),b)})
test('six receipts and eighty MiB refuse intake without evicting existing records',()=>{assert.throws(()=>checkPdfIntakeCapacity(Array.from({length:6},()=>({bytes:1})),1),/6 条/);assert.throws(()=>checkPdfIntakeCapacity(Array.from({length:4},()=>({bytes:20*1024*1024})),1),/80 MiB/);assert.doesNotThrow(()=>checkPdfIntakeCapacity(Array.from({length:3},()=>({bytes:20*1024*1024})),20*1024*1024))})
test('reported sizes are readable and capacity rejects invalid lengths',()=>{assert.equal(receivedPdfSize(33504),'32.7 KiB');assert.equal(receivedPdfSize(1024*1024),'1.0 MiB');for(const n of [-1,NaN,0.5])assert.throws(()=>checkPdfIntakeCapacity([],n))})
