<template>
  <n-button v-if="available" data-testid="structured-history" quaternary size="small" aria-label="历史与差异" :disabled="busy" @click="session.openHistory()"><template #icon><n-icon :component="History" /></template>历史</n-button>
  <TextHistoryDialog v-if="available && session.history.value && session.historyCurrent()" title="源码历史与差异" :key="session.history.value.path + session.history.value.generation"
    :library-root="session.history.value.root" :path="session.history.value.path" :draft="session.historyDraft.value" :max-count="store.maxHistoryCount"
    :initial-timestamp="session.history.value.historyTimestamp" :read-only="readOnly || busy" @replace="session.applyHistoryDraft" @copy="openCopy" @close="session.closeHistory()" />
</template>
<script setup lang="ts">
import { useContextCommands } from '../services/contextCommands'
import { NButton, NIcon } from 'naive-ui'
import { History } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { useAppStore } from '../store/app'
import type { useStructuredSession } from '../composables/useStructuredSession'
import { openManagedFile } from '../services/fileNavigation'
import TextHistoryDialog from './TextHistoryDialog.vue'
const props = defineProps<{ session: ReturnType<typeof useStructuredSession>; available: boolean; readOnly: boolean; busy: boolean }>()
const store = useAppStore(), router = useRouter()
const openCopy = (path: string) => { if (props.session.historyCurrent()) void openManagedFile(router, path) }
useContextCommands(() => {const owner=props.session.capture();return JSON.stringify([owner?.root,owner?.path,owner?.generation])}, () => props.available && !props.busy && props.session.hasDocument() ? [
  {id:'structured-history',title:'源码历史与差异…',description:'比较保存历史与当前草稿，按需恢复',keywords:'源码 历史 版本 差异 恢复 history diff',run:input=>props.session.openHistory(input?.historyTimestamp)},
] : [])
</script>
