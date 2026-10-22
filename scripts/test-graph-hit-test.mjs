import assert from 'node:assert/strict'
import {test} from 'node:test'
import {nearestGraphNode} from '../src/utils/graphHitTest.ts'
const early = {id:'early',x:8,y:0,size:20}, intended = {id:'intended',x:0,y:0,size:12}
test('overlapping graph targets select the actual nearest center regardless of native file order',()=>{
 for(const nodes of [[early,intended],[intended,early]])for(const zoom of [.25,.5,1,2,3])assert.equal(nearestGraphNode(nodes,0,0,zoom,'network'),intended)
 assert.equal(nearestGraphNode([early,intended],7,0,1,'network'),early)
})
test('outside targets and hidden nodes cannot be selected',()=>{
 assert.equal(nearestGraphNode([early,intended],200,200,1,'network'),null)
 assert.equal(nearestGraphNode([],0,0,1,'network'),null)
 assert.equal(nearestGraphNode([early],0,0,1,'network'),early)
})
test('mindmap hit areas retain root width and height while resolving overlaps by distance',()=>{
 const root={id:'root',x:0,y:0,size:20},other={id:'other',x:20,y:0,size:20}
 assert.equal(nearestGraphNode([root,other],20,0,1,'mindmap','root'),other)
 assert.equal(nearestGraphNode([root],85,0,1,'mindmap','root'),root)
 assert.equal(nearestGraphNode([root],85,0,1,'mindmap'),null)
 assert.equal(nearestGraphNode([root],0,25,1,'mindmap','root'),null)
})
