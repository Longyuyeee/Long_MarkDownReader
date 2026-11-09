import { inspectXmlStructure, prepareXmlAttribute } from './xmlStructure'
self.onmessage = (event: MessageEvent<{ content: string; id?: number; attribute?: number; input?: string }>) => {
  const { content, id, attribute, input } = event.data
  self.postMessage(id === undefined ? inspectXmlStructure(content) : prepareXmlAttribute(content, id, attribute!, input!))
}
