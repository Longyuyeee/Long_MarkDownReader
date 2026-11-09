import { checkXmlSource } from './xmlSource'
self.onmessage = (event: MessageEvent<{ content: string }>) => self.postMessage(checkXmlSource(event.data.content))
