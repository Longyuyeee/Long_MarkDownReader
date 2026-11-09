import { checkYamlSource } from './yamlSource'
self.onmessage = (event: MessageEvent<{ content: string }>) => self.postMessage(checkYamlSource(event.data.content))
