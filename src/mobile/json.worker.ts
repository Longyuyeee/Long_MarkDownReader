import { checkJsonSource } from './jsonSource'
self.onmessage = (event: MessageEvent<{ content: string; format: boolean }>) => {
  try { self.postMessage(checkJsonSource(event.data.content, event.data.format)) }
  catch { self.postMessage({ valid: false, message: '暂时无法完成 JSON 检查，源文仍可继续使用。' }) }
}
