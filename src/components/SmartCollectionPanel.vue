<template>
  <section class="smart-collection" aria-label="智能集合条件">
    <details :open="expanded" @toggle="expanded = ($event.target as HTMLDetailsElement).open">
    <summary>{{ name || '新建智能集合' }} · 筛选条件</summary>
    <form @submit.prevent="run">
      <strong>{{ editingId ? '修改集合条件' : '新建智能集合' }}</strong>
      <label>名称<input v-model="name" maxlength="80" placeholder="例如：本周项目笔记" /></label>
      <label>关键词（可不填）<input v-model="query" maxlength="500" placeholder="搜索文件名和正文" /></label>
      <label>目录<input v-model="directory" placeholder="全部目录；或填写 项目/设计" /></label>
      <label>格式<n-select v-model:value="objectTypes" multiple clearable :options="formats" placeholder="全部格式" size="small" /></label>
      <label>文内标签（仅 Markdown）<input v-model="tag" maxlength="80" placeholder="不含 #，例如 项目" /></label>
      <label>修改时间<select v-model="days"><option :value="null">不限</option><option :value="7">最近 7 天</option><option :value="30">最近 30 天</option><option :value="90">最近 90 天</option></select></label>
      <div class="actions"><button type="submit" :disabled="running">{{ running ? '正在查找…' : '查看结果 / 刷新' }}</button><button type="button" :disabled="saving || !name.trim()" @click="save">{{ saving ? '正在保存…' : editingId ? '保存修改' : '保存为常用搜索' }}</button></div>
      <button v-if="editingId" type="button" @click="reset">新建其他集合</button>
    </form>
    </details>
    <button v-if="!expanded" type="button" :disabled="running" @click="run">{{ running ? '正在查找…' : '刷新结果' }}</button>
    <p role="status" v-if="notice">{{ notice }}</p><p role="alert" v-if="error">{{ error }}</p>
    <p v-if="searched && !running">{{ results.length ? `已显示 ${results.length} 条结果` : '没有符合条件的文件' }}{{ truncated ? '（最多 200 条，请缩小条件）' : '' }}</p>
    <div class="results"><button v-for="(result, i) in results" :key="`${result.path}-${i}`" type="button" @click="$emit('open', result)"><strong>{{ result.title }}</strong><small>{{ result.path }}</small><span>{{ result.context }}</span></button></div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { NSelect } from 'naive-ui'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore, type SavedSearchConfig } from '../store/app'
interface Result {
  title: string; path: string; objectType: string; matchKind: 'title' | 'body' | 'ocr' | 'annotation' | 'related' | 'tag' | 'slide-title' | 'object' | 'notes'
  context: string; page?: number; annotationId?: string; locatorKind?: string; locatorObjectId?: string; locationLabel?: string; score: number; extractionFailed: boolean
}
const props = defineProps<{ selected: SavedSearchConfig | null; formats: { label: string; value: string }[] }>()
defineEmits<{ open: [result: Result] }>()
const store = useAppStore()
const name = ref(''), query = ref(''), directory = ref(''), tag = ref(''), editingId = ref('')
const objectTypes = ref<string[]>([]), days = ref<number | null>(null)
const results = ref<Result[]>([]), running = ref(false), saving = ref(false), searched = ref(false), truncated = ref(false)
const error = ref(''), notice = ref('')
const expanded = ref(true)
let generation = 0
const invalidate = () => { generation++; results.value = []; searched.value = false; running.value = false; error.value = ''; notice.value = '' }
watch([query, directory, tag, days, objectTypes], invalidate, { deep: true, flush: 'sync' })
const reset = () => { invalidate(); expanded.value = true; editingId.value = ''; name.value = ''; query.value = ''; directory.value = ''; tag.value = ''; days.value = null; objectTypes.value = [] }
async function run() {
  invalidate()
  const token = generation, root = store.libraryPath
  running.value = true
  try {
    const response = await invoke<{ results: Result[]; truncated: boolean }>('search_smart_collection', {
      libraryRoot: root, query: query.value, objectTypes: [...objectTypes.value],
      filters: { directory: directory.value.trim(), tag: tag.value.trim(), modifiedWithinDays: days.value },
    })
    if (generation !== token || store.libraryPath !== root) return
    results.value = response.results; truncated.value = response.truncated; searched.value = true; expanded.value = false
  } catch (cause) { if (generation === token) error.value = `查找失败：${String(cause)}` }
  finally { if (generation === token) running.value = false }
}
async function save() {
  if (saving.value) return
  const root = store.libraryPath, token = generation
  saving.value = true; error.value = ''; notice.value = ''
  try {
    const entry = await store.saveSmartCollection({ id: editingId.value || undefined, name: name.value, query: query.value,
      objectTypes: [...objectTypes.value], filters: { directory: directory.value.trim(), tag: tag.value.trim(), modifiedWithinDays: days.value } })
    if (store.libraryPath === root && generation === token) { editingId.value = entry.id; notice.value = '条件已保存；每次打开会重新查找，不复制或移动文件。' }
  } catch (cause) { if (store.libraryPath === root && generation === token) error.value = `保存失败：${String(cause)}` }
  finally { saving.value = false }
}
watch(() => [props.selected, store.libraryPath] as const, ([selected]) => {
  reset()
  if (!selected || selected.libraryPath !== store.libraryPath || selected.graphRoot) return
  editingId.value = selected.id; name.value = selected.name; query.value = selected.query; objectTypes.value = [...selected.objectTypes]
  directory.value = selected.filters?.directory || ''; tag.value = selected.filters?.tag || ''; days.value = selected.filters?.modifiedWithinDays ?? null
  void run()
}, { immediate: true })
onBeforeUnmount(invalidate)
</script>

<style scoped>
.smart-collection { padding: 12px; border-bottom: var(--theme-border); font-size: 12px; }
summary { cursor: pointer; padding: 8px 0; overflow-wrap: anywhere; } details { margin-bottom: 8px; }
form, label, .results { display: grid; gap: 6px; min-width: 0; } form { gap: 10px; }
input, select, button { box-sizing: border-box; min-width: 0; max-width: 100%; color: var(--theme-text); background: var(--theme-bg); border: var(--theme-border); border-radius: 6px; padding: 7px; font: inherit; }
button { cursor: pointer; } button:disabled { cursor: default; opacity: .6; } input:focus, button:focus-visible, select:focus { outline: 2px solid var(--theme-primary); }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }.actions button { flex: 1 1 100px; }
.results button { display: grid; gap: 4px; text-align: left; overflow-wrap: anywhere; }.results small { opacity: .65; }.results span { white-space: pre-wrap; } p { overflow-wrap: anywhere; } [role=alert] { color: var(--theme-error, #d45959); }
</style>
