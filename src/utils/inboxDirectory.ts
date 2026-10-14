import type { LibraryConfig } from '../store/app'
import { fileStylePathKey } from './fileDisplayStyles'

export const inboxRelativeDirectory = (root: string, libraries: LibraryConfig[]) =>
  libraries.find(item => fileStylePathKey(item.path) === fileStylePathKey(root))?.inboxDirectory || 'Inbox'

export const inboxDirectory = (root: string, libraries: LibraryConfig[]) => {
  const relative = inboxRelativeDirectory(root, libraries)
  const base = root.replace(/[\\/]$/, '')
  return relative === '.' ? base : base + '/' + relative
}

export const rememberedCaptureTarget = (root: string, inbox: string, remembered: string | null) =>
  !remembered ? root : remembered === '__inbox' || remembered === root.replace(/[\\/]$/, '') + '/Inbox'
    ? inbox : remembered
