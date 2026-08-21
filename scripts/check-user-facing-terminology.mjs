import fs from 'node:fs'

const files = [
  'src/components/GraphHealthPanel.vue',
  'src/components/LocalGraph.vue',
  'src/components/WorkspaceHealthQueue.vue',
  'src/views/WorkspaceHome.vue',
  'src/views/PptxReaderView.vue',
]
const templates = Object.fromEntries(files.map(file => {
  const source = fs.readFileSync(file, 'utf8')
  return [file, source.split('<script setup')[0]]
}))
const combined = Object.values(templates).join('\n')
const blocked = [
  'GRAPH HEALTH', 'LOCAL GRAPH', 'GOVERNANCE', 'ACTIVE WORKSPACE', 'ACTIVITY',
  'KNOWLEDGE HEALTH', 'OPEN TASKS', 'SAVED VIEWS',
  'C4A', 'C4B', 'C4C', 'C4D', 'C5A', 'C5B', 'C5C',
]
const required = [
  '关系健康', '局部图谱', '资料治理', '当前工作区', '最近活动', '关系概览',
  '未完成事项', '可视画布', '快捷视图', '文本编辑预览', '样式与替代文本',
  '图片替换', '基础形状', '幻灯片管理', '可靠另存副本',
]
const failures = []
for (const token of blocked) if (combined.includes(token)) failures.push(`blocked user-facing token remains: ${token}`)
for (const token of required) if (!combined.includes(token)) failures.push(`required plain-language token missing: ${token}`)

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`User-facing terminology passed: ${files.length} surfaces, ${blocked.length} internal tokens absent, ${required.length} plain-language labels present.`)
