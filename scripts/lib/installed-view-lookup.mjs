const identity = path => String(path).replaceAll('\\', '/').replace(/^\/\/\?\/UNC\//i, '//').replace(/^\/\/\?\//, '').replace(/\/+$/, '').toLowerCase()

// Observe the exact document in the real renderer, including Windows namespace
// aliases. Different folders can legitimately contain the same filename/IDs.
export function installedViewLookupExpression(file, storageKey = 'longedit.view-state.v1') {
  return `(()=>{const identity=${identity.toString()};return Object.entries(JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)})||'{}')).find(([path])=>identity(path)===${JSON.stringify(identity(file))})?.[1]})()`
}
