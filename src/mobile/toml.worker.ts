import { checkTomlSource } from './tomlSource'
self.onmessage = (event: MessageEvent<{ content: string }>) => self.postMessage(checkTomlSource(event.data.content))
