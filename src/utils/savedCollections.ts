const normalizedPath = (path: string) => path.replace(/^\\\\\?\\/, '').replace(/\\/g, '/').replace(/\/+$/, '')

export const sameWorkspacePath = (left: string, right: string) =>
  normalizedPath(left).toLowerCase() === normalizedPath(right).toLowerCase()

export const toCollectionRelativePath = (libraryRoot: string, path: string) => {
  const root = normalizedPath(libraryRoot)
  const target = normalizedPath(path)
  const rootIdentity = root.toLowerCase()
  const targetIdentity = target.toLowerCase()
  if (!root || !target || (targetIdentity !== rootIdentity && !targetIdentity.startsWith(`${rootIdentity}/`))) {
    throw new Error('图谱中心对象必须位于当前知识库')
  }
  const relative = target.slice(root.length).replace(/^\/+/, '')
  if (!relative || relative.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('图谱中心对象相对路径无效')
  }
  return relative
}

export const resolveCollectionPath = (libraryRoot: string, relativePath: string) => {
  const root = normalizedPath(libraryRoot)
  const relative = normalizedPath(relativePath).replace(/^\/+/, '')
  if (!root || !relative || relative.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('图谱集合路径无效')
  }
  return `${root}/${relative}`
}
