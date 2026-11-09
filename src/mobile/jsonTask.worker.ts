import { inspectJsonStructure } from './jsonStructure'
import { findJsonFields } from './jsonSearch'
import { prepareJsonOperation, type JsonOperation } from './jsonOperations'
self.onmessage = (event: MessageEvent<{ content: string; query?: string; id?: number; operation?: JsonOperation }>) => {
  const { content, query, id, operation } = event.data
  try {
    if (operation && id !== undefined) self.postMessage({ patch: prepareJsonOperation(content, id, operation) })
    else {
      const analysis = inspectJsonStructure(content)
      if (!analysis.fields) throw new Error(analysis.message)
      self.postMessage({ matches: findJsonFields(content, analysis.fields, query || '') })
    }
  } catch (error) { self.postMessage({ error: String(error).replace(/^Error: /, '') }) }
}
