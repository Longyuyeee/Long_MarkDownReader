<template>
  <section class="recovery-source" :aria-label="label">
    <div class="recovery-source-search" role="search" :aria-label="`${subject}内容查找`"><label>查找{{ subject }}内容<input ref="queryInput" v-model="query" placeholder="在此版本中查找文字" maxlength="128" /></label><span role="status">{{ !query ? '仅查看此版本' : matches.pending ? '查找中…' : matches.count ? `${matches.current} / ${matches.count}${matches.truncated ? '+' : ''}` : '未找到' }}</span><button class="text-button" :disabled="!matches.count || matches.pending" :aria-label="`${subject}内容上一处`" @click="source?.navigate(-1)">上一处</button><button class="text-button" :disabled="!matches.count || matches.pending" :aria-label="`${subject}内容下一处`" @click="source?.navigate(1)">下一处</button></div>
    <SourceReader v-if="fingerprint" ref="source" :identity="`recovery:${identity}`" :fingerprint="fingerprint" :content="content" :reason="`${subject}内容较长`" :query="query" :storage="storage" :query-input="queryInput" :title="label" @matches="matches = $event" @restore-query="restoreQuery" />
    <p v-else role="status">正在准备这份恢复内容…</p>
  </section>
</template>
<script setup lang="ts">
import { nextTick,onBeforeUnmount, onMounted, ref } from 'vue'
import type {Storage} from './storage'
import type {QuerySelection} from './sourceReadingState'
import SourceReader from './SourceReader.vue'
import type { DocumentMatches } from './documentBudget'
const props = withDefaults(defineProps<{ content: string; identity: string; label: string; subject?: string;storage?:Storage }>(), { subject: '恢复' })
const queryInput=ref<HTMLInputElement>()
async function restoreQuery(value:{query:string;selection:QuerySelection|null}){query.value=value.query;await nextTick();if(value.selection)queryInput.value?.setSelectionRange(value.selection.start,value.selection.end,value.selection.direction)}
const source = ref<InstanceType<typeof SourceReader>>(), query = ref(''), fingerprint = ref('')
const matches = ref<DocumentMatches>({ count: 0, current: 0, truncated: false })
let alive = true
onMounted(async () => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(props.content))
  if (alive) fingerprint.value = [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('')
})
onBeforeUnmount(() => { alive = false })
</script>
