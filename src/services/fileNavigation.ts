import type { LocationQueryRaw, RouteLocationRaw, Router } from 'vue-router'

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
