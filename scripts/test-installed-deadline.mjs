import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withDeadline } from './lib/with-deadline.mjs'
import vm from 'node:vm'
import { visibleVersionSurfaceExpression } from './lib/installed-version-identity.mjs'

test('a WebView promise that never returns fails with its phase instead of hanging CI', async () => {
  await assert.rejects(withDeadline(() => new Promise(() => {}), 10, 'Markdown frame sampling'), /Markdown frame sampling/)
})
test('completed work preserves its result', async () => {
  assert.equal(await withDeadline(() => Promise.resolve('done'), 1000, 'test'), 'done')
})
test('underlying failures are retained', async () => {
  await assert.rejects(withDeadline(() => { throw Error('native error') }, 1000, 'test'), /native error/)
})

test('retained infinite decoration does not make an unobscured Markdown heading unclickable', () => {
  let iterations = Infinity
  const element = { parentElement: null, getBoundingClientRect: () => ({width:100,height:20,top:10,bottom:30,left:10,right:110,x:10,y:10}),
    getAnimations: () => [{playState:'running',effect:{getTiming:()=>({iterations})}}], contains: () => true }
  const context = vm.createContext({document:{querySelector:()=>element,elementFromPoint:()=>element},innerHeight:800,innerWidth:1280,
    getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'})})
  assert.equal(vm.runInContext(visibleVersionSurfaceExpression('h2'), context), false)
  assert.equal(vm.runInContext(visibleVersionSurfaceExpression('h2', true), context), true)
  iterations = 1
  assert.equal(vm.runInContext(visibleVersionSurfaceExpression('h2', true), context), false)
})
