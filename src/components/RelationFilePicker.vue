<template>
  <div class="relation-file-picker">
    <n-select :value="value || null" :aria-label="label" :input-props="{ 'aria-label': label }" filterable remote clearable :options="options" :render-label="renderLabel" :loading="loading" :disabled="disabled" :placeholder="placeholder || '输入文件名查找资料'" @search="search" @update:value="value => $emit('update:value', value || '')" />
    <small v-if="value" class="selected-path">{{ relativePath(value) }}</small>
    <small v-if="truncated">文件较多，请输入名称缩小范围。</small>
    <div v-if="error" class="picker-error" role="alert"><span>暂时没能读取文件列表。</span><button :disabled="disabled || loading" type="button" @click="load(query)">重试</button><details><summary>错误详情</summary>{{ error }}</details></div>
  </div>
</template>
<script setup lang="ts">
import { computed, h, onBeforeUnmount, ref, watch } from 'vue'
import { NSelect, type SelectOption } from 'naive-ui'
import { invoke } from '@tauri-apps/api/core'
import { findFileFormat } from '../config/fileFormats'
import { resolveFileTreeVisual } from '../config/fileTreeAppearance'
import { searchResultPath } from '../utils/searchResultPath'
import { sameWorkspacePath } from '../utils/savedCollections'
interface Target { name: string; path: string; relativePath: string }
const props = defineProps<{ value: string; libraryRoot: string; label: string; disabled?: boolean; placeholder?: string; exclude?: string }>()
defineEmits<{ 'update:value': [path: string] }>()
const files = ref<Target[]>([]), query = ref(''), loading = ref(false), truncated = ref(false), error = ref('')
let generation = 0, timer: ReturnType<typeof setTimeout> | undefined, disposed = false
const relativePath = (path: string) => searchResultPath(path, props.libraryRoot)
const options = computed(() => {
  const items = files.value.filter(file => !props.exclude || !sameWorkspacePath(props.exclude, file.path)).map(file => ({ label: file.name, value: file.path, relativePath: file.relativePath }))
  if (props.value && !items.some(item => sameWorkspacePath(String(item.value), props.value))) items.unshift({ value: props.value, label: props.value.split(/[\\/]/).pop() || props.value, relativePath: relativePath(props.value) })
  return items
})
const renderLabel = (option: SelectOption) => {
  const format = findFileFormat(String(option.value)), visual = resolveFileTreeVisual(format?.id || 'file')
  return h('span', { class: 'relation-picker-option' }, [h(visual.icon, { size: 16, color: visual.color }), h('span', { style: 'min-width:0;display:grid;gap:3px;' }, [h('strong', { style: 'font-size:12px;overflow:hidden;text-overflow:ellipsis;' }, String(option.label)), h('small', { style: 'font-size: var(--text-compact);opacity:.65;overflow:hidden;text-overflow:ellipsis;' }, String(option.relativePath || relativePath(String(option.value))))])])
}
async function load(text: string) {
  if (!props.libraryRoot) return
  const token = ++generation, root = props.libraryRoot
  loading.value = true; error.value = ''
  try {
    const response = await invoke<{ files: Target[]; truncated: boolean }>('list_relation_files', { libraryRoot: root, query: text })
    if (!disposed && token === generation && root === props.libraryRoot) { files.value = response.files; truncated.value = response.truncated }
  } catch (cause) { if (!disposed && token === generation) error.value = String(cause) }
  finally { if (token === generation) loading.value = false }
}
const search = (text: string) => { query.value = text; ++generation; if (timer) clearTimeout(timer); timer = setTimeout(() => load(text), 200) }
watch(() => props.libraryRoot, () => { files.value = []; query.value = ''; if (timer) clearTimeout(timer); void load('') }, { immediate: true })
onBeforeUnmount(() => { disposed = true; ++generation; if (timer) clearTimeout(timer) })
</script>
<style scoped>
.relation-file-picker { min-width: 0; display: grid; gap: 5px; }.relation-file-picker small { color: var(--theme-text-secondary); font-size: 11px; line-height: 1.5; overflow-wrap: anywhere; }.selected-path { padding: 0 2px; }.picker-error { font-size: 11px; line-height: 1.5; color: var(--theme-text-secondary); }.picker-error button { margin-left: 7px; border: 0; background: transparent; color: var(--theme-primary); cursor: pointer; }.picker-error details { overflow-wrap: anywhere; }:global(.relation-picker-option) { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 2px 0; }
</style>
