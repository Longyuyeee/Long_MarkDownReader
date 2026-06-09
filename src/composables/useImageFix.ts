import { invoke } from '@tauri-apps/api/core'

export function useImageFix(getVditor: () => any, getFilePath: () => string) {
  const fixEditorImages = async () => {
    const vditor = getVditor()
    const filePath = getFilePath()
    if (!vditor || !filePath) return

    const parentDir = filePath.substring(0, Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')) + 1).replace(/\\/g, '/')
    const contentEl = vditor.vditor?.wysiwyg?.element
    if (!contentEl) return

    const imgs = contentEl.querySelectorAll('img')
    const tasks = Array.from(imgs).map(async (img: any) => {
      if (img.dataset.fixed === 'true') return

      const rawSrc = img.getAttribute('src')
      if (!rawSrc || rawSrc.startsWith('http') || rawSrc.startsWith('misty-img:') || rawSrc.startsWith('data:')) {
        img.dataset.fixed = 'true'
        return
      }

      let absolutePath = ''
      if (rawSrc.startsWith('./')) absolutePath = parentDir + rawSrc.substring(2)
      else if (!rawSrc.includes(':') && !rawSrc.startsWith('/')) absolutePath = parentDir + rawSrc
      else absolutePath = rawSrc

      try {
        const b64 = await invoke<string>('get_image_base64', { path: absolutePath.replace(/\\/g, '/') })
        if (img.src !== b64) img.src = b64
        img.dataset.fixed = 'true'
      } catch (e) {
        const protocolUrl = `misty-img://${absolutePath.replace(/\\/g, '/')}`
        if (img.src !== protocolUrl) img.src = protocolUrl
        img.dataset.fixed = 'true'
      }
    })
    await Promise.all(tasks)
  }

  return { fixEditorImages }
}
