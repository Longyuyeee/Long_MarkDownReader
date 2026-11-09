import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { parse } from '@vue/compiler-sfc'
import { baseParse } from '@vue/compiler-dom'

const directory = 'docs/evidence/mobile-copy-2026-10-26'
const baseline = JSON.parse(await readFile(`${directory}/source-before.json`, 'utf8'))
function inventory(source) {
  const template = parse(source).descriptor.template?.content || ''
  const paragraphs = [], copy = []
  function visit(node, conditions = []) {
    const guards = [...conditions, ...(node.props || []).filter(p => p.type === 7 && ['if', 'else-if', 'else', 'for'].includes(p.name)).map(p => `v-${p.name}=${p.exp?.content || ''}`)]
    if (node.type === 1 && node.tag === 'p') paragraphs.push({ source: node.loc.source, conditions: guards })
    if (node.type === 2 && node.content.trim().length >= 12) copy.push({ text: node.content.trim(), conditions: guards })
    for (const child of node.children || []) visit(child, guards)
  }
  visit(baseParse(template))
  return { paragraphs, copy }
}
const components = []
for (const item of baseline) {
  const source = await readFile(item.file, 'utf8')
  const sha256 = createHash('sha256').update(source).digest('hex')
  components.push({ file: item.file, beforeSha256: item.sha256, sha256, changed: sha256 !== item.sha256, before: inventory(item.template), after: inventory(source) })
}
const audit = { baselineCommit: 'ffdfad6f6', componentCount: components.length, changedComponents: components.filter(c => c.changed).length, interpretation: 'Source inventory for manual review. Conditional status, errors, consequences and user document content are retained; paragraph counts alone do not determine whether copy is meaningful.', components }
await writeFile(`${directory}/copy-audit.json`, JSON.stringify(audit, null, 2) + '\n')
console.log(JSON.stringify({ componentCount: audit.componentCount, changedComponents: audit.changedComponents }))
