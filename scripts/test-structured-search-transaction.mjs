import assert from 'node:assert/strict'
import {test} from 'node:test'
import {EditorState,StateField} from '@codemirror/state'
import {getSearchQuery,SearchQuery,setSearchQuery,search} from '@codemirror/search'
import {sourceSearchScopeExtensions} from '../src/services/structuredSearchScope.ts'
test('scope query injection computes the edited document state once, without speculative parser state',()=>{
 let updates=0
 const observed=StateField.define({create:()=>0,update(value,tr){if(tr.docChanged)updates++;return value+1}})
 const start=EditorState.create({doc:'key = "原文"\n',extensions:[observed,search(),sourceSearchScopeExtensions]})
 const next=start.update({changes:{from:7,to:9,insert:'当前草稿'},effects:setSearchQuery.of(new SearchQuery({search:'当前',replace:'替换'}))}).state
 assert.equal(updates,1)
 assert.equal(next.doc.toString(),'key = "当前草稿"\n');assert.equal(getSearchQuery(next).search,'当前');assert.equal(getSearchQuery(next).replace,'替换')
 assert.equal(start.doc.toString(),'key = "原文"\n')
})
