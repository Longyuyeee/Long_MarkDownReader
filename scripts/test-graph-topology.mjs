import assert from 'node:assert/strict'
import {test} from 'node:test'
import {buildGraphTopology} from '../src/utils/graphTopology.ts'
const nodes=Array.from({length:1200},(_,i)=>({id:String(i)}))
test('one topology preserves directed counts, duplicate relation degree and undirected unique neighbors',()=>{
 const edges=[{source:'0',target:'1',directed:true},{source:'0',target:'1',directed:false},{source:'1',target:'1',directed:true}]
 const result=buildGraphTopology({nodes,edges})
 assert.equal(result.degree.get('0'),2);assert.equal(result.degree.get('1'),4)
 assert.equal(result.incoming.get('1'),2);assert.equal(result.outgoing.get('0'),1);assert.equal(result.outgoing.get('1'),1)
 assert.deepEqual([...result.neighbors.get('0')],['1']);assert.deepEqual([...result.neighbors.get('1')],['0','1']);assert.equal(result.byId.get('3'),nodes[3])
})
test('all 1200 adjacency queries match the original edge traversal exactly',()=>{
 const edges=nodes.flatMap((n,i)=>[1,7,31].map(offset=>({source:n.id,target:String((i+offset)%1200),directed:offset!==7})))
 const result=buildGraphTopology({nodes,edges})
 for(const node of nodes){
  const ids=new Set();for(const edge of edges){if(edge.source===node.id)ids.add(edge.target);if(edge.target===node.id)ids.add(edge.source)}
  assert.deepEqual([...(result.neighbors.get(node.id)||[])],[...ids])
 }
 assert.equal(result.byId.size,1200);assert.equal(result.neighbors.size,1200)
})
test('empty and dangling topology does not fabricate nodes or lose an edge count',()=>{
 assert.equal(buildGraphTopology({nodes:[],edges:[]}).byId.size,0)
 const value=buildGraphTopology({nodes:[{id:'a'}],edges:[{source:'a',target:'missing',directed:false}]})
 assert.equal(value.byId.has('missing'),false);assert.equal(value.degree.get('a'),1);assert.deepEqual([...value.neighbors.get('a')],['missing'])
})
