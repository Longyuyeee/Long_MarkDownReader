import assert from 'node:assert/strict'
import {test} from 'node:test'
import {portableCollection, planCollectionNames} from '../src/utils/collectionTransfer.ts'
test('portable conditions omit machine identities and keep independent filters and graph focus',()=>{
 const source={id:'local',libraryPath:'C:/private',createdAt:123,name:'项目',query:'预算',objectTypes:['markdown'],filters:{directory:'项目',tag:'工作',tags:['进行中'],modifiedWithinDays:7}}
 const copy=portableCollection(source);assert.deepEqual(Object.keys(copy).sort(),['filters','name','objectTypes','query']);copy.filters.tags.push('新条件');copy.objectTypes.push('pdf');assert.deepEqual(source.filters.tags,['进行中']);assert.deepEqual(source.objectTypes,['markdown'])
 assert.deepEqual(portableCollection({...source,filters:undefined,graphRoot:'中心.md',graphDepth:2}),{name:'项目',query:'预算',objectTypes:['markdown'],graphRoot:'中心.md',graphDepth:2})
 assert.equal('graphRoot' in portableCollection({...source,graphRoot:null,graphDepth:null}),false)
})
test('conflicting names are added separately and Unicode suffixes stay within the existing limit',()=>{
 const entry=name=>({name,query:'预算',objectTypes:[]}), long='🙂'.repeat(80)
 const planned=planCollectionNames([entry('项目'),entry('项目'),entry(long)],['项目',long]);assert.deepEqual(planned.slice(0,2).map(v=>v.name),['项目（导入 1）','项目（导入 2）']);assert.equal(Array.from(planned[2].name).length,80);assert.equal(new Set(planned.map(e=>e.name)).size,3)
})
