import assert from 'node:assert/strict'
import {test} from 'node:test'
import {Text} from '@codemirror/state'
import {recordStructuredSavepoint, matchesStructuredSavepoint} from '../src/services/structuredSavepoints.ts'
const identity={root:'C:/library',path:'C:/library/a.json',external:false,format:'json',signature:'read-1',encoding:'utf-8-bom'}
const doc=s=>Text.of(s.split('\n'))
test('read baseline compares exact displayed source while normalizing CRLF only',()=>{
 const tab={},source='{"n":9007199254740993123,"s":"中文😀"}\r\n';recordStructuredSavepoint(tab,identity,source)
 assert.equal(matchesStructuredSavepoint(tab,identity,doc(source.replaceAll('\r\n','\n'))),true)
 for(const changed of [source.replace('123','124'),source.replace('"n":','"n": '),source.replace('\r\n',''),source+'\n'])assert.equal(matchesStructuredSavepoint(tab,identity,doc(changed.replaceAll('\r\n','\n'))),false)
})
test('baseline belongs to tab, file, library, format, signature, encoding and external mode',()=>{
 const tab={};recordStructuredSavepoint(tab,identity,'original')
 for(const change of [{root:'D:/library'},{path:'C:/library/moved.json'},{external:true},{format:'jsonc'},{signature:'peer'},{encoding:'utf-16le'}])assert.equal(matchesStructuredSavepoint(tab,{...identity,...change},doc('original')),false)
 assert.equal(matchesStructuredSavepoint({},identity,doc('original')),false)
})
test('save receipt advances baseline, and later input stays dirty until exact restoration',()=>{
 const tab={};recordStructuredSavepoint(tab,identity,'original');const saved={...identity,signature:'write-2'};recordStructuredSavepoint(tab,saved,'submitted')
 assert.equal(matchesStructuredSavepoint(tab,saved,doc('later input')),false)
 assert.equal(matchesStructuredSavepoint(tab,saved,doc('original')),false)
 assert.equal(matchesStructuredSavepoint(tab,saved,doc('submitted')),true)
})
test('transported or unverified drafts cannot create or keep a trusted baseline',()=>{
 const tab={};assert.equal(matchesStructuredSavepoint(tab,identity,doc('draft')),false)
 recordStructuredSavepoint(tab,identity,'draft');recordStructuredSavepoint(tab,{...identity,signature:''},'draft')
 assert.equal(matchesStructuredSavepoint(tab,identity,doc('draft')),false)
})
