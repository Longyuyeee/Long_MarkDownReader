import { inspectJsonStructure } from './jsonStructure'
self.onmessage = (event: MessageEvent<{ content: string }>) => {
  try { self.postMessage(inspectJsonStructure(event.data.content)) }
  catch { self.postMessage({ message: '暂时无法浏览结构，请返回源码或重试。' }) }
}
