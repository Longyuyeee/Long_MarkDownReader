import type { LibraryConfig } from '../store/app'

export const inboxDirectory = (root: string, libraries: LibraryConfig[]) => {
  const relative = libraries.find(item => item.path === root)?.inboxDirectory || 'Inbox'
  const base = root.replace(/[\\/]$/, '')
  return relative === '.' ? base : base + '/' + relative
}

export const rememberedCaptureTarget = (root: string, inbox: string, remembered: string | null) =>
  !remembered ? root : remembered === '__inbox' || remembered === root.replace(/[\\/]$/, '') + '/Inbox'
    ? inbox : remembered
