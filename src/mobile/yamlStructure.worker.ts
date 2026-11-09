import { inspectYamlStructure, prepareYamlValuePatch } from './yamlStructure'
self.onmessage = (event: MessageEvent<{ content: string; id?: number; kind?: import('./yamlStructure').YamlScalarKind; input?: string }>) => {
  const { content, id, kind, input } = event.data
  try { self.postMessage(kind === undefined ? inspectYamlStructure(content) : { patch: prepareYamlValuePatch(content, id!, kind, input || '') }) }
  catch (error) { self.postMessage({ error: String(error).replace(/^Error: /, '') }) }
}
