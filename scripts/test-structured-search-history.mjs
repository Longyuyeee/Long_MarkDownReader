import assert from 'node:assert/strict'
import {test} from 'node:test'
import {structuredSearchHistory} from '../src/services/structuredSearchHistory.ts'
const condition={search:'关键词',replace:'替换 $1',caseSensitive:false,regexp:true,wholeWord:false,literal:false}
test('recent conditions are library-local, shared across files, detached and bounded to ten',()=>{
 const a=structuredSearchHistory('history-a'),b=structuredSearchHistory('history-b');a.clear();b.clear()
 a.remember(condition);const first=a.list();first[0].search='changed';assert.equal(a.list()[0].search,'关键词');assert.deepEqual(b.list(),[])
 assert.deepEqual(structuredSearchHistory('history-a').list(),[condition])
 for(let i=0;i<12;i++)a.remember({...condition,search:String(i)})
 assert.equal(a.list().length,10);assert.equal(a.list()[0].search,'11');assert.equal(a.list().at(-1).search,'2')
 a.remember({...condition,search:'4'});assert.equal(a.list()[0].search,'4');assert.equal(a.list().filter(v=>v.search==='4').length,1)
 a.clear();assert.deepEqual(a.list(),[])
})
test('capture groups, Unicode, newlines, empty replacement and options remain exact',()=>{
 const history=structuredSearchHistory('history-options');history.clear()
 const value={...condition,search:'😀 (中文)\n\\d+',replace:'',caseSensitive:true,wholeWord:true}
 history.remember(value);value.search='mutated';assert.equal(history.list()[0].search,'😀 (中文)\n\\d+');assert.equal(history.list()[0].replace,'')
 history.remember({...history.list()[0],regexp:false});assert.equal(history.list().length,2)
 history.remember({...condition,search:''});assert.equal(history.list().length,2)
})
test('documents, scope, predicates and match offsets never enter history; clearing only affects its library',()=>{
 const a=structuredSearchHistory('history-metadata'),b=structuredSearchHistory('history-neighbor');a.clear();b.clear()
 a.remember({...condition,scope:{from:10,to:30},doc:'private',test:()=>true,open:true});b.remember(condition)
 assert.deepEqual(a.list(),[condition]);a.clear();assert.deepEqual(a.list(),[]);assert.deepEqual(b.list(),[condition])
 const unavailable=structuredSearchHistory('');unavailable.remember(condition);assert.deepEqual(unavailable.list(),[])
})
