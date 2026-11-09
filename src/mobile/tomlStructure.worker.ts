import { inspectTomlStructure, prepareTomlValuePatch, type TomlScalarKind } from './tomlStructure'
self.onmessage = (event: MessageEvent<{ content: string; id?: number; kind?: TomlScalarKind; input?: string }>) => {
  const { content, id, kind, input } = event.data
  try { self.postMessage(kind === undefined ? inspectTomlStructure(content) : { patch: prepareTomlValuePatch(content, id!, kind, input || '') }) }
  catch (error) { self.postMessage({ error: String(error).replace(/^Error: /, '') }) }
}
