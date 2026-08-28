import type { LocationQueryRaw, RouteLocationRaw, Router } from 'vue-router'

export interface ManagedObjectLocator {
  kind?: string | null
  objectId?: string | null
  page?: number | null
}

export interface ManagedObjectTarget {
  path: string
  objectType: string
  locator?: ManagedObjectLocator | null
  page?: number | null
  annotationId?: string | null
  locationLabel?: string | null
  matchKind?: string | null
}

let managedLocatorSequence = 0
const nextManagedLocatorToken = () => `${Date.now()}-${++managedLocatorSequence}`

const stringValue = (value: string | null | undefined) => value || undefined
const pageValue = (target: ManagedObjectTarget) => target.locator?.page ?? target.page ?? undefined

export const managedObjectQuery = (
  target: ManagedObjectTarget,
  locatorToken = nextManagedLocatorToken(),
): LocationQueryRaw => {
  const kind = target.locator?.kind || ''
  const objectId = stringValue(target.locator?.objectId)
  const page = pageValue(target)

  if (target.objectType === 'pdf' || target.objectType === 'pdf_annotation' || kind === 'pdf_annotation') {
    return {
      ...(page ? { page: String(page) } : {}),
      ...(target.annotationId || ((target.objectType === 'pdf_annotation' || kind === 'pdf_annotation') && objectId)
        ? { annotation: target.annotationId || objectId }
        : {}),
    }
  }
  if (target.objectType === 'workbook' || kind === 'workbook-sheet') {
    return { ...(objectId ? { sheet: objectId } : {}), locatorToken }
  }
  if (kind === 'table-row') return { ...(objectId ? { row: objectId } : {}), locatorToken }
  if (target.objectType === 'table_view' || kind === 'table-view' || kind === 'table_view') {
    return { ...(objectId ? { view: objectId } : {}), locatorToken }
  }
  if (target.objectType === 'canvas_node' || kind === 'canvas-node' || kind === 'canvas_node') {
    return { ...(objectId ? { node: objectId } : {}), locatorToken }
  }
  if (target.objectType === 'opml_node' || kind === 'opml-node' || kind === 'opml_node') {
    return { ...(objectId ? { node: objectId } : {}), locatorToken }
  }
  if (target.objectType === 'pptx' || target.objectType === 'pptx_slide' || kind.startsWith('pptx-')) {
    return {
      ...(page ? { slide: String(page) } : {}),
      ...(kind ? { locatorKind: kind } : {}),
      ...(objectId ? { locator: objectId } : {}),
      ...(target.locationLabel ? { locationLabel: target.locationLabel } : {}),
      ...(target.matchKind ? { matchKind: target.matchKind } : {}),
      locatorToken,
    }
  }
  if (
    ['docx', 'odt', 'ods', 'odp'].includes(target.objectType)
    || /^(?:docx|odt|ods|odp)-/.test(kind)
  ) {
    return { ...(objectId ? { locator: objectId } : {}), locatorToken }
  }
  return {}
}

export const managedFileLocation = (path: string, query: LocationQueryRaw = {}): RouteLocationRaw => ({
  name: 'LibraryMode',
  query: { ...query, path },
})

export const openManagedFile = (
  router: Router,
  path: string,
  query: LocationQueryRaw = {},
  mode: 'push' | 'replace' = 'push',
) => router[mode](managedFileLocation(path, query))

export const managedObjectLocation = (target: ManagedObjectTarget): RouteLocationRaw => (
  managedFileLocation(target.path, managedObjectQuery(target))
)

export const openManagedObject = (
  router: Router,
  target: ManagedObjectTarget,
  mode: 'push' | 'replace' = 'push',
) => router[mode](managedObjectLocation(target))
