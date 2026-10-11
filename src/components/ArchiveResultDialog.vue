<template>
  <n-modal :show="show" :mask-closable="!checking" @update:show="value => { if (!value && !checking) emit('close') }">
    <section class="archive-result" role="dialog" aria-modal="true" aria-labelledby="archive-result-title">
      <h2 id="archive-result-title">{{ items.length && items.every(item => item.status === 'completed') ? '归档已完成' : '归档未全部完成' }}</h2>
      <p>目标：{{ targetDirectory }}</p>
      <article v-for="item in items" :key="item.sourcePath">
        <div><strong>{{ basename(item.sourcePath) }} · {{ label(item.status) }}</strong><p>{{ item.message }}</p><small>{{ item.status === 'completed' ? item.targetPath : item.sourcePath }}</small></div>
        <button v-if="item.status === 'completed' && item.targetPath" @click="emit('open', item.targetPath)">打开文件</button>
      </article>
      <p v-if="!items.length" role="alert">未取得处理结果，不能确认归档是否完成。请核对文件状态。</p>
      <p>已完成的文件不会再次移动。核对只读取状态，不自动覆盖或删除文件。</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <details><summary>查看处理记录</summary><div v-for="item in items" :key="item.sourcePath"><p>{{ item.sourcePath }} → {{ item.targetPath || '未确定目标' }}</p><small>{{ item.message }}</small></div></details>
      <footer><button :disabled="checking" @click="emit('close')">关闭并保留记录</button><button v-if="items.some(item => item.status !== 'completed')" :disabled="checking" class="primary" @click="emit('reconcile')">{{ checking ? '正在核对…' : '核对未完成项' }}</button></footer>
    </section>
  </n-modal>
</template>
<script setup lang="ts">
import { NModal } from 'naive-ui'
export interface ArchiveResultItem { sourcePath: string; targetPath?: string; status: 'completed' | 'not_executed' | 'needs_review'; message: string }
defineProps<{ show: boolean; targetDirectory: string; items: ArchiveResultItem[]; checking?: boolean; error?: string }>()
const emit = defineEmits<{ close: []; reconcile: []; open: [path: string] }>()
const basename = (path: string) => path.split(/[\\/]/).pop() || path
const label = (status: string) => ({ completed: '已完成', not_executed: '未执行', needs_review: '需要核对' }[status] || '需要核对')
</script>
<style scoped>
.archive-result { box-sizing: border-box; width: min(680px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; padding: 24px; border-radius: 10px; background: var(--theme-surface, #fff); color: var(--theme-text, #222); border: 1px solid var(--workspace-border-color, #8885); }
h2 { margin: 0 0 12px; font-size: 20px; } p, small { font-size: 13px; overflow-wrap: anywhere; } article { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; border-top: 1px solid var(--workspace-border-color, #8885); padding: 14px 0; } article div { min-width: 0; } article p { margin: 4px 0; } footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 20px; } button { flex-shrink: 0; font: inherit; color: inherit; background: transparent; border: 1px solid var(--workspace-border-color, #8885); border-radius: 4px; padding: 8px 12px; cursor: pointer; } button:disabled { opacity: .5; cursor: default; } .primary { background: var(--theme-primary, #27734f); color: #fff; } @media(max-width:480px) { article { flex-direction: column; } }
</style>
