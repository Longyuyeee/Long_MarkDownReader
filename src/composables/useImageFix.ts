import { invoke } from '@tauri-apps/api/core'
import { resolveLocalImagePath } from '../utils/localImagePath'

interface ImageAccessContext {
  libraryRoot?: () => string
  external?: boolean
  draft?: () => string
}

export function useImageFix(getVditor: () => any, getFilePath: () => string, access: ImageAccessContext = {}) {
  let observer: MutationObserver | null = null
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  const rendered = new Map<HTMLImageElement, string>()
  const releaseImage = (img: HTMLImageElement) => {
    const url = rendered.get(img)
    if (url) { URL.revokeObjectURL(url); rendered.delete(img); img.removeAttribute('srcset') }
    delete img.dataset.fixedSource
  }

  const fixEditorImages = async () => {
    const vditor = getVditor()
    const filePath = getFilePath()
    if (!vditor || !filePath) return

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
    for (const img of rendered.keys()) if (!imgs.has(img) || !img.isConnected) releaseImage(img)
    const tasks = Array.from(imgs).map(async (img: any) => {
      const rawSrc = img.getAttribute('src')
      if (!rawSrc || rawSrc.startsWith('http') || rawSrc.startsWith('data:')) {
        releaseImage(img)
        img.dataset.fixed = 'true'
        return
      }
      const sourceKey = `${filePath}\n${rawSrc}`
      if (img.dataset.fixedSource === sourceKey) return
      const normalizedPath = resolveLocalImagePath(filePath, rawSrc)
      if (!normalizedPath) { releaseImage(img); return }

      try {
        const command = access.external ? 'get_external_image_base64' : 'get_image_base64'
        const args = {
          documentPath: filePath,
          path: normalizedPath,
          ...(!access.external ? { libraryRoot: access.libraryRoot?.() || '' } : {}),
        }
        let b64:string
        try {b64=await invoke<string>(command,args)}
        catch(cause){
          // New pasted/inserted references need not be on disk yet. Authorize
          // against the live draft without saving it or widening the vault.
          if(access.external||!access.draft)throw cause
          b64=await invoke<string>(command,{...args,draftContent:access.draft()})
        }
        if (getFilePath() !== filePath || img.getAttribute('src') !== rawSrc || !img.isConnected) return
        // src remains the Markdown destination. srcset changes only the rendered
        // resource, so displaying a local image never embeds it into the draft.
        const separator = b64.indexOf(','), mime = b64.slice(0, separator).match(/^data:([^;]+);base64$/)?.[1]
        if (!mime) throw new Error('图片数据格式无效')
        const bytes = Uint8Array.from(atob(b64.slice(separator + 1)), character => character.charCodeAt(0))
        const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
        const previous = rendered.get(img)
        img.srcset = url
        rendered.set(img, url)
        if (previous) URL.revokeObjectURL(previous)
        img.dataset.fixed = 'true'
        img.dataset.fixedSource = sourceKey
      } catch (e) {
        if (getFilePath() === filePath && img.getAttribute('src') === rawSrc) releaseImage(img)
        console.warn('Image authorization failed:', e)
      }
    })
    await Promise.all(tasks)
  }

  const destroyImageFix = () => {
    for (const img of rendered.keys()) releaseImage(img)
    observer?.disconnect()
    observer = null
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = null
  }

  return { fixEditorImages, destroyImageFix }
}
