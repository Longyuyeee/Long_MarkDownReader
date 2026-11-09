import test from 'node:test'
import assert from 'node:assert/strict'
import {pdfPageSwipe} from '../src/mobile/pdfGestures.ts'
import {pdfThumbnailSize} from '../src/mobile/pdfNavigation.ts'
test('page swipe accepts deliberate horizontal moves and rejects scroll, long-press, taps and invalid geometry',()=>{assert.equal(pdfPageSwipe(-180,8,240),1);assert.equal(pdfPageSwipe(160,-20,180),-1);for(const args of [[-30,0,120],[-90,100,180],[-150,0,650],[-150,0,20],[NaN,0,150],[-150,Infinity,150]])assert.equal(pdfPageSwipe(...args),0)})
test('high density thumbnails are sharp but bounded to twice the existing bitmap budget',()=>{const a=pdfThumbnailSize(600,840),b=pdfThumbnailSize(600,840,2),c=pdfThumbnailSize(600,840,12);assert.equal(b.width,a.width*2);assert.equal(b.height,a.height*2);assert.deepEqual(c,b);assert.ok(b.width<=320&&b.height<=420);assert.deepEqual(pdfThumbnailSize(600,840,NaN),a)})
