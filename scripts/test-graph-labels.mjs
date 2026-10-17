import assert from 'node:assert/strict'
import {test} from 'node:test'
import {fitGraphLabelText,placeGraphLabels,graphLabelOverlap} from '../src/utils/graphLabels.ts'
const measure=text=>Array.from(text).length*12
const candidate=(id,extra={})=>({id,text:'长中文项目记录与研究依据 · '+id,x:120,y:90,radius:8,priority:4,weight:1,...extra})
test('measured truncation fits width and never splits a Unicode surrogate pair',()=>{
 const text=fitGraphLabelText('📚📚中文资料非常长',60,measure);assert.ok(measure(text)<=60);assert.equal(text,'📚📚中文…');assert.ok(!/[\uD800-\uDBFF]$/.test(text))
 assert.equal(fitGraphLabelText('短名',100,measure),'短名')
})
test('active name gets a longer first placement even if it occurs last in native order',()=>{
 const result=placeGraphLabels([candidate('other'),candidate('active',{priority:0})],{width:600,height:350},measure)
 assert.equal(result[0].id,'active');assert.equal(result[0].emphasized,true)
 assert.ok(result[0].text.length>10)
 for(let i=0;i<result.length;i++)for(let j=i+1;j<result.length;j++)assert.equal(graphLabelOverlap(result[i],result[j]),false)
})
test('dense labels remain in viewport, avoid each other and honor a strict render budget',()=>{
 const nodes=Array.from({length:1200},(_,i)=>candidate(String(i),{x:10+i%30*32,y:10+Math.floor(i/30)*25,priority:i===1199?0:4}))
 const result=placeGraphLabels(nodes,{width:480,height:320},measure,36)
 assert.ok(result.length>0&&result.length<=36)
 for(const box of result){assert.ok(box.left>=4&&box.right<=476&&box.top>=4&&box.bottom<=316)}
 for(let i=0;i<result.length;i++)for(let j=i+1;j<result.length;j++)assert.equal(graphLabelOverlap(result[i],result[j]),false)
})
test('alternate anchors allow two near nodes to retain labels without forced overlap',()=>{
 const result=placeGraphLabels([candidate('a',{text:'A',priority:0}),candidate('b',{text:'B',priority:1})],{width:300,height:220},measure)
 assert.equal(result.length,2);assert.equal(graphLabelOverlap(result[0],result[1]),false)
})
