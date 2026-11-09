<template>
  <section ref="panel" aria-label="全树查找结果">
    <div v-if="!embedded" class="mobile-context-heading"><h2 tabindex="-1">查找整个 JSON</h2><MobileHelp topic="jsonFind" /></div>

    <form @submit.prevent="find"><label class="input-label" for="json-tree-query">在所有字段和值中查找</label><input id="json-tree-query" ref="input" v-model="query" type="search" maxlength="128" class="name-input" @input="invalidate" /><div class="inline-actions"><button class="button primary-button" :disabled="!query || busy">查找字段和值</button><button v-if="busy" type="button" class="button" @click="cancel">停止全树查找</button><button type="button" class="button" @click="emit('close')">结束全树查找</button></div></form>
    <p v-if="busy" role="status">正在查找所有层级…</p><p v-if="error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
    <template v-if="matches">
      <p role="status">找到 {{ matches.total }} 项<template v-if="matches.truncated">，仅列出前 {{ JSON_FIND_LIMIT }} 项，请缩小查找条件</template><template v-if="matches.ids.length"> · 第 {{ page + 1 }} / {{ pages }} 页</template></p>
      <ul class="json-find-list"><li v-for="id in visible" :key="id"><button class="button json-find-hit" :data-hit-id="id" @click="emit('select', id)"><strong>{{ jsonFieldLocation(fields, id) }}</strong><span>{{ jsonKindLabel(fields[id]!.kind) }} · {{ fields[id]!.preview }}</span></button></li></ul>
      <p v-if="!matches.total">没有匹配项，可换一个字段名或值。</p>
      <div v-if="pages > 1" class="inline-actions"><button class="button" :disabled="!page" @click="changePage(-1)">上一页结果</button><button class="button" :disabled="page + 1 >= pages" @click="changePage(1)">下一页结果</button></div>
    </template>
  </section>
</template>
<script setup lang="ts">
import MobileHelp from './MobileHelp.vue'
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
import { JSON_FIND_LIMIT, type JsonFieldMatches } from './jsonSearch'
import { JSON_STRUCTURE_BUDGET, jsonFieldLocation, jsonKindLabel, type JsonField } from './jsonStructure'
import { useJsonTask } from './useJsonTask'
const props = defineProps<{ content: string; identity: string; fields: JsonField[]; embedded?: boolean }>()
const emit = defineEmits<{ select: [id: number]; close: [] }>()
const query = ref(''), page = ref(0), message = ref(''), matches = shallowRef<JsonFieldMatches>(), input = ref<HTMLInputElement>(), panel = ref<HTMLElement>()
const { busy, error, run, stop } = useJsonTask(() => props)
const pages = computed(() => Math.max(1, Math.ceil((matches.value?.ids.length || 0) / JSON_STRUCTURE_BUDGET.page))), visible = computed(() => matches.value?.ids.slice(page.value * JSON_STRUCTURE_BUDGET.page, (page.value + 1) * JSON_STRUCTURE_BUDGET.page) || [])
function invalidate() { stop(); error.value = ''; matches.value = undefined; page.value = 0; message.value = '' }
function cancel() { invalidate(); message.value = '已停止全树查找，正文保持原样。' }
function find() { invalidate(); run({ query: query.value }, value => { matches.value = value.matches }) }
async function focusResult(id: number) { await nextTick(); const target = panel.value?.querySelector<HTMLElement>(`[data-hit-id="${id}"]`); if (target) { target.focus(); target.scrollIntoView({ block: 'nearest' }) } else input.value?.focus() }
async function changePage(direction: number) { page.value += direction; await nextTick(); panel.value?.querySelector<HTMLElement>('.json-find-hit')?.focus() }
watch(() => [props.content, props.identity], invalidate, { flush: 'sync' })
defineExpose({ focusResult, stop })
onMounted(() => input.value?.focus())
</script>
<style scoped>
h2 { font-size: 1.125rem; }
.json-find-list { list-style: none; padding: 0; display: grid; gap: 8px; }
.json-find-hit { width: 100%; display: flex; flex-direction: column; align-items: stretch; gap: 6px; text-align: start; white-space: normal; overflow-wrap: anywhere; }
.json-find-hit span { font-size: .875rem; color: var(--muted); }
</style>
