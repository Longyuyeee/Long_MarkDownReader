<template>
  <div class="temp-mode" :class="{ 'is-dark': store.theme === 'dark', 'zen-mode': store.isZen }">
    <div class="temp-header" v-if="!store.isZen">
      <div class="temp-info">
        <n-tag :bordered="false" type="error" size="small" class="mode-tag">临时编辑</n-tag>
        <span class="file-name" :title="filePath">{{ fileName }}</span>
        <div v-if="isDirty" class="dirty-dot"></div>
      </div>
      <div class="actions">
        <n-button-group size="small">
          <n-button secondary type="primary" @click="importToLibrary" :disabled="!store.libraryPath">
            <template #icon><n-icon :component="BookPlusIcon" /></template>
            存入知识库
          </n-button>
          <n-button secondary type="success" @click="saveFile">保存</n-button>
        </n-button-group>
      </div>
    </div>

    <div class="main-content">
      <!-- 侧边大纲栏 -->
      <div class="temp-sidebar" :style="{ width: sidebarWidth + 'px' }" v-if="showOutline && !store.isZen">
        <div class="sidebar-header">
          <n-icon :component="ListIcon" />
          <span>文章目录</span>
        </div>
        <div class="outline-container">
          <div v-if="outlineTreeData.length === 0" class="empty-outline">暂无大纲</div>
          <n-tree
            v-else
            block-line
            expand-on-click
            :data="outlineTreeData"
            :on-update:selected-keys="handleOutlineSelect"
            class="compact-outline-tree"
            default-expand-all
          />
        </div>
      </div>

      <!-- 分隔条 -->
      <div class="resizer" @mousedown="startResizing" v-if="showOutline && !store.isZen"></div>

      <!-- 编辑区 -->
      <div class="editor-container">
        <div id="vditor"></div>
      </div>
    </div>

    <!-- AI 操作选择弹窗 -->
    <n-modal v-model:show="aiState.showActionModal" preset="dialog" title="AI 辅助" positive-text="" negative-text="取消" @negative-click="aiState.showActionModal = false">
      <div class="ai-action-grid">
        <n-button block secondary @click="handleAIAction('polish')" class="ai-action-btn">✨ 润色</n-button>
        <n-button block secondary @click="handleAIAction('rewrite')" class="ai-action-btn">✏️ 重写</n-button>
        <n-button block secondary @click="handleAIAction('summarize')" class="ai-action-btn">📝 总结</n-button>
        <n-button block secondary @click="handleAIAction('translate')" class="ai-action-btn">🌐 翻译</n-button>
      </div>
    </n-modal>

    <!-- AI 结果弹窗 -->
    <n-modal v-model:show="aiState.showResultModal" preset="dialog" title="AI 处理结果" positive-text="替换原文" negative-text="取消" @positive-click="replaceAIResult" @negative-click="aiState.showResultModal = false">
      <div style="min-height: 80px;">
        <div v-if="aiState.loading" style="display:flex;align-items:center;justify-content:center;padding:24px;">
          <n-spin size="medium" />
        </div>
        <div v-else class="ai-result-content">{{ aiState.result }}</div>
      </div>
      <template #action>
        <n-button quaternary @click="copyAIResult">复制结果</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed, onUnmounted, watch, nextTick, reactive } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useMessage, NIcon } from 'naive-ui'
import { List as ListIcon, BookPlus as BookPlusIcon } from 'lucide-vue-next'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import { useAppStore } from '../store/app'
import { useOutline } from '../composables/useOutline'
import { useImageFix } from '../composables/useImageFix'
import { useVditorTheme } from '../composables/useVditorTheme'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const store = useAppStore()

const filePath = ref(route.query.path as string || '')
const fileName = computed(() => filePath.value ? filePath.value.split(/[\\/]/).pop() : '新文档.md')
const isDirty = ref(false)
watch(isDirty, (v) => { store.isTempDirty = v })

onBeforeRouteLeave((_to, _from, next) => {
  if (!isDirty.value) { store.isTempDirty = false; return next() }
  const answer = window.confirm('当前文档有未保存的修改，确定要离开吗？')
  if (answer) { store.isTempDirty = false; next() } else { next(false) }
})

const sidebarWidth = ref(240)
const showOutline = ref(true)
let vditor: Vditor | null = null

const { outlineTreeData, syncOutlineManual, scrollToHeading, setupOutlineObserver, destroyOutlineObserver } = useOutline(() => vditor)
const { fixEditorImages } = useImageFix(() => vditor, () => filePath.value)
useVditorTheme(() => vditor)

const handleOutlineSelect = (keys: string[]) => {
  if (keys.length > 0) scrollToHeading(keys[0])
}

// 核心修复：监听路径变化
watch(() => route.query.path, async (newPath) => {
  if (newPath && newPath !== filePath.value) {
    filePath.value = newPath as string
    await loadFileContent()
  }
})

const loadFileContent = async () => {
  if (!filePath.value) return
  try {
    const result = await invoke<{content: string}>('read_markdown_file', { path: filePath.value })
    if (vditor) {
      vditor.setValue(result.content)
      isDirty.value = false
      syncOutlineManual()
      nextTick(() => setTimeout(fixEditorImages, 300))
    }
  } catch (err: any) {
    message.error('读取文件失败: ' + filePath.value)
  }
}

const importToLibrary = async () => {
  if (!store.libraryPath || !filePath.value) return
  try {
    message.loading('正在存入知识库...')
    const newPath = await invoke<string>('import_to_library', {
      sourcePath: filePath.value,
      libraryRoot: store.libraryPath,
      targetDir: store.libraryPath
    })
    message.destroyAll()
    message.success('已成功存入知识库')
    const title = newPath.split(/[\\/]/).pop()?.replace(/\.md$/, '') || '笔记'
    store.addTab({ id: newPath, title, path: newPath, isDirty: false })
    router.push('/library')
  } catch (err) {
    message.destroyAll()
    message.error('存入失败: ' + err)
  }
}

const saveFile = async () => {
  if (!vditor || !filePath.value) return
  try {
    const content = vditor.getValue()
    await invoke('write_markdown_file', { path: filePath.value, content })
    isDirty.value = false
    message.success('已保存')
  } catch (err: any) { message.error('保存失败: ' + err) }
}

// --- AI Assistant ---
const aiState = reactive({ showActionModal: false, showResultModal: false, loading: false, result: '', selectedText: '' })

const systemPrompts: Record<string, string> = {
  polish: '请润色以下文本，使其更加通顺、优美，保持原意不变，只返回润色后的结果，不要添加任何额外说明：',
  rewrite: '请重写以下文本，保持核心意思不变，使用不同的表达方式，只返回重写后的结果，不要添加任何额外说明：',
  summarize: '请总结以下文本的核心要点，简洁明了，只返回总结结果，不要添加任何额外说明：',
  translate: '请将以下文本翻译为中文，只返回翻译结果，不要添加任何额外说明：',
}

const handleAIAssist = () => {
  if (!store.aiEnabled) { message.warning('请先在设置中启用 AI 并配置 API'); return }
  const sel = window.getSelection()?.toString().trim()
  if (!sel) { message.warning('请先选择要处理的文本'); return }
  aiState.selectedText = sel
  aiState.showActionModal = true
}

const handleAIAction = async (action: string) => {
  aiState.showActionModal = false
  aiState.loading = true; aiState.result = ''
  aiState.showResultModal = true
  try {
    aiState.result = await invoke<string>('ai_chat_completion', {
      apiKey: store.aiApiKey, endpoint: store.aiEndpoint, model: store.aiModel,
      systemPrompt: systemPrompts[action], userContent: aiState.selectedText,
    })
  } catch (e: any) {
    message.error('AI 请求失败: ' + (e?.toString() || '未知错误'))
    aiState.showResultModal = false
  }
  aiState.loading = false
}

const replaceAIResult = () => {
  if (!vditor || !aiState.result) return
  if (vditor.getCurrentMode() === 'wysiwyg') {
    vditor.insertValue(aiState.result)
  } else {
    const content = vditor.getValue()
    const sel = window.getSelection()
    const prevEl = vditor.vditor.sv?.element || vditor.vditor.ir?.element
    if (sel && sel.rangeCount > 0 && prevEl) {
      const pre = document.createRange(); pre.selectNodeContents(prevEl)
      pre.setEnd(sel.anchorNode!, sel.anchorOffset!)
      const start = pre.toString().length
      pre.setEnd(sel.focusNode!, sel.focusOffset!)
      const end = pre.toString().length
      const [s, e] = start < end ? [start, end] : [end, start]
      vditor.setValue(content.substring(0, s) + aiState.result + content.substring(e))
    } else {
      const idx = content.indexOf(aiState.selectedText)
      if (idx !== -1) vditor.setValue(content.substring(0, idx) + aiState.result + content.substring(idx + aiState.selectedText.length))
    }
  }
  aiState.showResultModal = false; aiState.result = ''
  message.success('已替换')
}

const copyAIResult = () => {
  navigator.clipboard.writeText(aiState.result)
  message.success('已复制到剪贴板')
}

const startResizing = () => {
  const onMouseMove = (moveEvent: MouseEvent) => { sidebarWidth.value = Math.max(150, Math.min(moveEvent.clientX, 400)) }
  const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp) }
  document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp)
}

let unlistenExport: any = null
let shadowSaveTimer: any = null

const startShadowSaveTimer = () => {
  if (shadowSaveTimer) clearInterval(shadowSaveTimer)
  const interval = store.autoSaveInterval * 60 * 1000
  shadowSaveTimer = setInterval(async () => {
    if (vditor && filePath.value) {
      const content = vditor.getValue()
      if (content && content.trim().length > 0) {
        await invoke('save_history_version', { path: filePath.value, content, maxCount: store.maxHistoryCount }).catch((e: any) => { console.error('Shadow save failed:', e) })
      }
    }
  }, interval)
}

onMounted(async () => {
  let initialContent = ''
  if (filePath.value) {
    try {
      const result = await invoke<{content: string}>('read_markdown_file', { path: filePath.value })
      initialContent = result.content
    } catch (err: any) { message.error('读取失败') }
  }

  unlistenExport = await listen('command-export', async () => {
    if (!vditor || !filePath.value) { message.warning('无可导出的内容'); return }
    const html = vditor.getHTML()
    try { await invoke('export_to_html', { path: filePath.value, htmlContent: html }); message.success('HTML 已导出') } catch (e) { message.error('导出失败') }
  })

  vditor = new Vditor('vditor', {
    cdn: 'https://cdn.jsdelivr.net/npm/vditor@3.11.2',
    lang: 'zh_CN',
    height: '100%',
    mode: store.editorMode || 'wysiwyg',
    value: initialContent,
    customWysiwygToolbar: () => {},
    cache: { enable: false },
    theme: store.theme === 'dark' ? 'dark' : 'classic',
    preview: {
      theme: { current: store.theme === 'dark' ? 'dark' : 'light' },
      hljs: { enable: true, style: store.codeTheme || 'github' },
      math: { engine: 'KaTeX' } as any,
      markdown: { mermaid: true, footnotes: true, toc: true } as any,
      transform: ((html: string) => {
        if (!filePath.value) return html
        const parentDir = filePath.value.substring(0, Math.max(filePath.value.lastIndexOf('/'), filePath.value.lastIndexOf('\\')) + 1).replace(/\\/g, '/')
        return html.replace(/(<img [^>]*src=["'])(.*?)(["'][^>]*>)/g, (_m: string, prefix: string, url: string, suffix: string) => {
          if (url.startsWith('http') || url.startsWith('misty-img:') || url.startsWith('data:')) return _m
          let abs = url.startsWith('./') ? parentDir + url.substring(2) : parentDir + url
          return `${prefix}misty-img://${abs.replace(/\\/g, '/')}${suffix}`
        })
      }) as any,
    },
    toolbar: [
      { name: 'undo', tip: '撤销 Ctrl+Z' }, { name: 'redo', tip: '重做 Ctrl+Y' }, '|',
      { name: 'emoji', tip: '表情' }, { name: 'headings', tip: '标题' }, { name: 'bold', tip: '加粗 Ctrl+B' }, { name: 'italic', tip: '斜体 Ctrl+I' }, { name: 'strike', tip: '删除线' }, '|',
      { name: 'line', tip: '分割线' }, { name: 'quote', tip: '引用' }, { name: 'list', tip: '无序列表' }, { name: 'ordered-list', tip: '有序列表' }, { name: 'check', tip: '任务列表' }, '|',
      { name: 'code', tip: '代码块' }, { name: 'inline-code', tip: '行内代码' }, { name: 'link', tip: '插入链接' }, { name: 'table', tip: '插入表格' }, '|',
      { name: 'ai-assist', tip: 'AI 辅助 (Alt+A)', icon: '<svg viewBox="0 0 24 24" width="17" height="17" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>', click: () => handleAIAssist() },
      '|',
      { name: 'both', tip: '双栏预览' }, { name: 'preview', tip: '预览' }, { name: 'edit-mode', tip: '切换编辑模式' }
    ],
    input: () => {
      isDirty.value = true
      syncVditorMode()
    },
    after: () => {
      syncOutlineManual()
      setTimeout(fixEditorImages, 500)
      setupOutlineObserver()
      const contentEl = (vditor as any).vditor.wysiwyg?.element
      if (contentEl) {
        contentEl.addEventListener('click', (e: MouseEvent) => {
          if ((e.target as HTMLElement).closest('.vditor-toolbar__item')) setTimeout(syncVditorMode, 300)
        })
      }
      startShadowSaveTimer()
    }
  })
})

onUnmounted(() => { destroyOutlineObserver(); if (vditor) vditor.destroy(); if (unlistenExport) unlistenExport(); if (shadowSaveTimer) clearInterval(shadowSaveTimer) })

const syncVditorMode = () => {
  if (vditor) {
    const currentMode = vditor.getCurrentMode()
    if (currentMode && currentMode !== store.editorMode) store.updateConfig({ editorMode: currentMode as any })
  }
}

watch(() => store.autoSaveInterval, () => { startShadowSaveTimer() })
</script>

<style scoped>
.temp-mode { height: 100%; display: flex; flex-direction: column; background: var(--theme-bg); color: var(--theme-text); }
.temp-header { height: 48px; background: var(--theme-bg); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; border-bottom: 1px solid rgba(0, 0, 0, 0.05); z-index: 10; }
.is-dark .temp-header { background: rgba(255, 255, 255, 0.05); border-bottom-color: rgba(255, 255, 255, 0.1); }
.main-content { flex: 1; display: flex; overflow: hidden; }
.temp-sidebar { background: rgba(0, 0, 0, 0.02); border-right: 1px solid rgba(0, 0, 0, 0.05); display: flex; flex-direction: column; }
.sidebar-header { padding: 12px 16px; font-size: 12px; font-weight: 700; opacity: 0.5; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(0, 0, 0, 0.03); }
.outline-container { flex: 1; overflow-y: auto; padding: 8px; }
.empty-outline { padding: 40px 20px; text-align: center; opacity: 0.3; font-size: 13px; }
.resizer { width: 4px; cursor: col-resize; transition: background 0.2s; }
.resizer:hover { background: var(--theme-primary); }
.editor-container { flex: 1; min-width: 0; background: transparent; }
.temp-info { display: flex; align-items: center; gap: 8px; }
.file-name { font-size: 13px; font-weight: 600; opacity: 0.8; }
.dirty-dot { width: 6px; height: 6px; background: #ff4d4f; border-radius: 50%; }
:deep(.vditor) { border: none !important; background: transparent !important; }
:deep(.vditor-toolbar) { background: transparent !important; border-bottom: 1px solid rgba(0, 0, 0, 0.05) !important; }
:deep(.vditor-content) { background: transparent !important; }
:deep(.vditor-reset) { max-width: 800px !important; margin: 0 auto !important; color: inherit !important; }
.compact-outline-tree :deep(.n-tree-node-content) { font-size: 13px !important; padding: 4px 8px !important; overflow: hidden; }
.compact-outline-tree :deep(.n-tree-node-content__text) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }

/* Zen 模式全屏适配 */
.temp-mode.zen-mode .main-content {
  max-width: 900px;
  margin: 0 auto;
  width: 100%;
}
.temp-mode.zen-mode :deep(.vditor-reset) {
  max-width: 100% !important;
}
.ai-action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 8px 0; }
.ai-action-btn { height: 56px; font-size: 15px; font-weight: 600; }
.ai-result-content { white-space: pre-wrap; line-height: 1.7; font-size: 14px; color: var(--theme-text); max-height: 400px; overflow-y: auto; }
</style>
