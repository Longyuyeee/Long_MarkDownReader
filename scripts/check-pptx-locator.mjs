import assert from 'node:assert/strict'
import { resolvePptxRouteLocator } from '../src/utils/pptxLocator.ts'

const slides = [
  { id: 'slide-a', objects: [{ id: 'shared-object' }, { id: 'object-a' }] },
  { id: 'slide-hidden', hidden: true, objects: [{ id: 'shared-object' }, { id: 'object-hidden' }] },
  { id: 'slide-c', objects: [{ id: 'object-c' }] },
]

assert.deepEqual(
  resolvePptxRouteLocator(slides, {
    slide: '1',
    locatorKind: 'pptx-slide',
    locator: 'slide-hidden',
  }),
  { slideIndex: 1, objectId: '' },
  'stable slide ID must take precedence and hidden slides must remain locatable',
)

assert.deepEqual(
  resolvePptxRouteLocator(slides, {
    slide: '2',
    locatorKind: 'pptx-object',
    locator: 'shared-object',
  }),
  { slideIndex: 1, objectId: 'shared-object' },
  'slide sequence must disambiguate repeated object IDs',
)

assert.deepEqual(
  resolvePptxRouteLocator(slides, {
    slide: '1',
    locatorKind: 'pptx-object',
    locator: 'object-c',
  }),
  { slideIndex: 2, objectId: 'object-c' },
  'stable object ID must recover when the page hint is stale',
)

assert.deepEqual(
  resolvePptxRouteLocator(slides, { slide: '3' }),
  { slideIndex: 2, objectId: '' },
  'valid slide sequence must remain a safe fallback',
)

assert.equal(
  resolvePptxRouteLocator(slides, {
    slide: '99',
    locatorKind: 'pptx-object',
    locator: 'missing',
  }),
  undefined,
  'invalid locator metadata must not select an unrelated slide',
)

console.log('PPTX locator gate passed: stable slides, hidden slides, duplicate object IDs, stale hints, and invalid targets.')
