<template>
  <n-dropdown v-if="available" trigger="click" :options="[{ label: '历史与差异…', key: 'history', disabled: busy }]" @select="session.openHistory()">
    <n-button quaternary size="small" aria-label="文档操作" :disabled="busy"><template #icon><n-icon :component="MoreHorizontal" /></template>文档操作</n-button>
  </n-dropdown>
  <TextHistoryDialog v-if="available && session.history.value && session.historyCurrent()" title="源码历史与差异" :key="session.history.value.path + session.history.value.generation"
    :library-root="session.history.value.root" :path="session.history.value.path" :draft="session.historyDraft.value" :max-count="store.maxHistoryCount"
    :read-only="readOnly || busy" @replace="session.applyHistoryDraft" @copy="openCopy" @close="session.closeHistory()" />
</template>
<script setup lang="ts">
import { NButton, NDropdown, NIcon } from 'naive-ui'
import { MoreHorizontal } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { useAppStore } from '../store/app'
import type { useStructuredSession } from '../composables/useStructuredSession'
import { openManagedFile } from '../services/fileNavigation'
import TextHistoryDialog from './TextHistoryDialog.vue'
const props = defineProps<{ session: ReturnType<typeof useStructuredSession>; available: boolean; readOnly: boolean; busy: boolean }>()
const store = useAppStore(), router = useRouter()
const openCopy = (path: string) => { if (props.session.historyCurrent()) void openManagedFile(router, path) }
</script>
