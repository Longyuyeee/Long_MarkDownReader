import test from 'node:test'
import assert from 'node:assert/strict'
import {boundedJsonPreview} from '../src/mobile/jsonPreview.ts'
test('short JSON preview retains all literal characters and original line endings',()=>{const value='\uFEFF{"x":9007199254740993,"x":-0}\r\n';assert.deepEqual(boundedJsonPreview(value),{text:value,truncated:false})})
test('head and tail display cuts never split a valid surrogate pair',()=>{const value='a'.repeat(1199)+'😎'+'b'.repeat(1000)+'😎'+'z'.repeat(399),preview=boundedJsonPreview(value);assert.equal(preview.truncated,true);assert.equal(preview.text,'a'.repeat(1199)+'\n…\n'+'z'.repeat(399));assert.equal(preview.text.isWellFormed(),true);assert.ok(value.includes('😎'))})
test('a long single physical line is bounded for display without mutating the source',()=>{const value='"'+'中'.repeat(17000)+'"',before=value,p=boundedJsonPreview(value);assert.ok(p.text.length<=1603);assert.equal(p.truncated,true);assert.equal(value,before);assert.ok(p.text.startsWith('"'));assert.ok(p.text.endsWith('"'))})
