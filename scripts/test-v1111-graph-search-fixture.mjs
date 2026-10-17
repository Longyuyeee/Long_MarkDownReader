// Schema/fixture check only, not an installed acceptance report.
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {applyGraphFilters} from '../src/composables/useGraphFilters.ts'
test('linked native-shaped notes legitimately match a short name more than once; full path uniquely identifies the target',()=>{
 const title=i=>`图谱验收主题${String(i).padStart(3,'0')} - 项目长期研究与来源证据核对`
 const nodes=Array.from({length:180},(_,i)=>({id:String(i),title:title(i),path:'C:\\LongEditR5ILibrary\\owned\\'+title(i)+'.md',objectType:'markdown',directory:'owned',tags:[],modifiedAt:0,size:8,searchText:`# ${title(i)}\n[[${title((i+1)%180)}]]\n[[${title((i+7)%180)}]]`}))
 const filters={query:'图谱验收主题017',tags:[],directories:[],relationTypes:[],objectTypes:[],dateRange:'all',showOrphans:true}
 const matches=query=>applyGraphFilters({nodes,edges:[]},{...filters,query}).nodes.map(node=>node.id)
 assert.deepEqual(matches(filters.query),['10','16','17'])
 assert.deepEqual(matches(nodes[17].path),['17'])
})
