import { invoke } from '@tauri-apps/api/core'

interface ImageAccessContext {
  libraryRoot?: () => string
  external?: boolean
}

export function useImageFix(getVditor: () => any, getFilePath: () => string, access: ImageAccessContext = {}) {
  let observer: MutationObserver | null = null
  let refreshTimer: ReturnType<typeof setTimeout> | null = null

  const fixEditorImages = async () => {
    const vditor = getVditor()
    const filePath = getFilePath()
    if (!vditor || !filePath) return

    const parentDir = filePath.substring(0, Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')) + 1).replace(/\\/g, '/')
    const editor = vditor.vditor
    const contentElements = [editor?.wysiwyg?.element, editor?.ir?.element, editor?.sv?.element, editor?.preview?.element]
      .filter((element): element is HTMLElement => Boolean(element))
    if (contentElements.length === 0) return
    if (!observer) {
      const root = editor?.element || contentElements[0].parentElement
      if (root) {
        observer = new MutationObserver(() => {
          if (refreshTimer) clearTimeout(refreshTimer)
          refreshTimer = setTimeout(() => { void fixEditorImages() }, 80)
        })
        observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] })
      }
    }

    const imgs = new Set(contentElements.flatMap(element => Array.from(element.querySelectorAll('img'))))
    const tasks = Array.from(imgs).map(async (img: any) => {
      if (img.dataset.fixed === 'true') return

      const rawSrc = img.getAttribute('src')
      if (!rawSrc || rawSrc.startsWith('http') || rawSrc.startsWith('data:')) {
        img.dataset.fixed = 'true'
        return
      }

      let absolutePath = ''
      if (rawSrc.startsWith('misty-img:')) {
        const encodedPath = rawSrc.replace(/^misty-img:\/\/localhost/i, '').replace(/^misty-img:/i, '')
        absolutePath = decodeURIComponent(encodedPath)
        if (/^\/[a-zA-Z]:/.test(absolutePath)) absolutePath = absolutePath.substring(1)
      }
      else if (rawSrc.startsWith('./')) absolutePath = parentDir + rawSrc.substring(2)
      else if (!rawSrc.includes(':') && !rawSrc.startsWith('/')) absolutePath = parentDir + rawSrc
      else absolutePath = rawSrc

      try {
        const normalizedPath = absolutePath.replace(/\\/g, '/')
        const command = access.external ? 'get_external_image_base64' : 'get_image_base64'
        const b64 = await invoke<string>(command, {
          documentPath: filePath,
          path: normalizedPath,
          ...(!access.external ? { libraryRoot: access.libraryRoot?.() || '' } : {}),
        })
        if (img.src !== b64) img.src = b64
        img.dataset.fixed = 'true'
      } catch (e) {
        console.warn('Image authorization failed:', e)
      }
    })
    await Promise.all(tasks)
  }

  const destroyImageFix = () => {
    observer?.disconnect()
    observer = null
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = null
  }

  return { fixEditorImages, destroyImageFix }
}
