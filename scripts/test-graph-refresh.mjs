import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createGraphLoadGate,prepareGraphRefresh} from '../src/utils/graphRefresh.ts'
const node=(id,extra={})=>({id,path:'C:/a/'+id+'.md',title:id,objectType:'markdown',size:8,tags:[],directory:'',modifiedAt:0,searchText:id,...extra})
const graph=nodes=>({nodes,edges:[]})
test('latest same-root request wins, including late failures and switch-away/switch-back',()=>{
 const gate=createGraphLoadGate(),first=gate.begin('A'),last=gate.begin('A')
 assert.equal(gate.accepts(first,'A',true),false);assert.equal(gate.accepts(last,'A',true),true)
 const away=gate.begin('B'),back=gate.begin('A')
 assert.equal(gate.accepts(last,'A',true),false);assert.equal(gate.accepts(away,'A',true),false);assert.equal(gate.accepts(back,'A',true),true)
})
test('hidden, unmounted, rootless and invalidated work cannot commit',()=>{
 const gate=createGraphLoadGate(),ticket=gate.begin('A')
 assert.equal(gate.accepts(ticket,'A',false),false);assert.equal(gate.accepts(ticket,'',true),false)
 gate.invalidate();assert.equal(gate.accepts(ticket,'A',true),false)
})
test('refresh copies latest dragged coordinates but updates metadata and rebinds selection',()=>{
 const old=node('1',{x:31,y:-9,vx:8,vy:2}),incoming=node('1',{title:'new',tags:['changed'],x:999,y:999})
 const before=graph([old]),next=graph([incoming]),result=prepareGraphRefresh(before,next)
 assert.equal(result.sameNodes,true);assert.equal(result.preserved,1);assert.equal(result.rebind(old),result.graph.nodes[0])
 assert.deepEqual(result.graph.nodes[0],{...incoming,x:31,y:-9,vx:0,vy:0})
 assert.equal(incoming.x,999);assert.equal(old.vx,8);assert.equal(old.title,'1');assert.notEqual(result.graph.nodes[0],incoming)
})
test('deleted IDs and reused identities cannot retain an old selection or coordinates',()=>{
 const old=node('1',{x:1,y:2}),result=prepareGraphRefresh(graph([old,node('2',{x:2,y:3})]),graph([node('1',{path:'C:/new.md'}),node('3')]))
 assert.equal(result.preserved,0);assert.equal(result.sameNodes,false);assert.equal(result.rebind(old),null);assert.equal(result.rebind(node('2')),null)
})
test('new nodes and non-finite old coordinates are not mistaken for settled restored nodes',()=>{
 const old=node('1',{x:NaN,y:1}),result=prepareGraphRefresh(graph([old]),graph([node('1'),node('2')]))
 assert.equal(result.sameNodes,false);assert.equal(result.preserved,0);assert.equal(result.graph.nodes.length,2)
})
