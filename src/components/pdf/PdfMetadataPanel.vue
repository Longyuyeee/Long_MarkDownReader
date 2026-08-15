<template>
  <div class="metadata-panel" data-testid="p1b5c-pdf-metadata">
    <WorkspaceStateNotice kind="limited" tone="warning" title="文档属性，不是隐私清理">
      <p>这里只编辑标题、作者、主题和关键词四项描述属性。</p>
      <small>正文、批注、附件、表单和其他嵌入数据仍可能包含身份信息；系统只创建经过复读验证的新副本，绝不覆盖源 PDF。</small>
    </WorkspaceStateNotice>

    <WorkspaceStateNotice v-if="loading" kind="loading" tone="info" title="正在读取并审计文档属性" compact>
      <small>检查 Info、XMP、签名、附件和完整重写资格。</small>
    </WorkspaceStateNotice>

    <section v-else class="metadata-fields">
      <label>
        <span><strong>标题</strong><small>{{ modelValue.title.trim().length }}/256</small></span>
        <input :value="modelValue.title" maxlength="256" autocomplete="off" aria-label="PDF 文档标题" @input="updateField('title', $event)">
      </label>
      <label>
        <span><strong>作者</strong><small>{{ modelValue.author.trim().length }}/256</small></span>
        <input :value="modelValue.author" maxlength="256" autocomplete="off" aria-label="PDF 文档作者" @input="updateField('author', $event)">
      </label>
      <label>
        <span><strong>主题</strong><small>{{ modelValue.subject.trim().length }}/512</small></span>
        <textarea :value="modelValue.subject" maxlength="512" rows="3" aria-label="PDF 文档主题" @input="updateField('subject', $event)"></textarea>
      </label>
      <label>
        <span><strong>关键词</strong><small>{{ modelValue.keywords.trim().length }}/512</small></span>
        <textarea :value="modelValue.keywords" maxlength="512" rows="3" placeholder="例如：知识管理, PDF, 项目资料" aria-label="PDF 文档关键词" @input="updateField('keywords', $event)"></textarea>
      </label>
      <small>清空字段会从新副本中移除对应属性；Creator、Producer 和原始时间等保留属性不会被改写。</small>
    </section>

    <button class="metadata-preview" :disabled="loading || working || !dirty" @click="$emit('preview')">
      {{ working ? '正在生成并复读验证…' : dirty ? '验证属性新副本' : '修改属性后可以验证' }}
    </button>

    <WorkspaceStateNotice v-if="operationError" kind="error" tone="danger" title="属性副本验证失败"><p>{{ operationError }}</p></WorkspaceStateNotice>
    <WorkspaceStateNotice v-else-if="verification?.status === 'blocked'" kind="error" tone="danger" title="当前 PDF 不能安全编辑属性">
      <p>{{ verification.blockers.map(blockerLabel).join(' · ') }}</p>
    </WorkspaceStateNotice>

    <section v-else-if="verification?.status === 'isolated_verified'" class="metadata-verification">
      <WorkspaceStateNotice kind="saved" tone="success" title="属性新副本验证通过" compact>
        <span>{{ verification.sourcePages }} 页 · {{ formatBytes(verification.outputBytes) }}</span>
        <small>{{ changeSummary }}；页面、交互结构和保留属性已复读，源文件尚未写入。</small>
      </WorkspaceStateNotice>
      <label class="metadata-copy-name"><span>新副本文件名</span><input v-model="targetFileName" maxlength="180" aria-label="PDF 属性新副本文件名" @keydown.enter.prevent="save"></label>
      <label class="metadata-confirm"><input v-model="scopeConfirmed" type="checkbox"><span>我理解这只修改四项描述属性，不代表匿名化、取证擦除或完整隐私清理。</span></label>
      <button class="metadata-save" :disabled="!scopeConfirmed || saving || !targetFileName.trim()" @click="save">
        {{ saving ? '正在可靠另存并复读…' : '另存属性副本并打开' }}
      </button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import WorkspaceStateNotice from '../workspace/WorkspaceStateNotice.vue'
import type { PdfMetadataCopyReport, PdfMetadataValues } from '../../types/pdfMetadata'

const props = defineProps<{
  modelValue: PdfMetadataValues
  verification: PdfMetadataCopyReport | null
  loading: boolean
  working: boolean
  saving: boolean
  dirty: boolean
  operationError: string
  defaultCopyName: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: PdfMetadataValues]
  preview: []
  save: [targetFileName: string]
}>()

const targetFileName = ref(props.defaultCopyName)
const scopeConfirmed = ref(false)
const updateField = (key: keyof PdfMetadataValues, event: Event) => emit('update:modelValue', {
  ...props.modelValue,
  [key]: (event.target as HTMLInputElement | HTMLTextAreaElement).value,
})
const save = () => {
  if (!scopeConfirmed.value || !targetFileName.value.trim()) return
  emit('save', targetFileName.value.trim())
}
const changeSummary = computed(() => {
  const updated = props.verification?.updatedFields.length || 0
  const removed = props.verification?.removedFields.length || 0
  return [`更新 ${updated} 项`, removed ? `移除 ${removed} 项` : '未移除字段'].join(' · ')
})
const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
const blockerLabels: Record<string, string> = {
  encrypted_pdf_unverified: '加密 PDF 不支持属性写入',
  digital_signature_or_certification_present: '数字签名或认证 PDF 禁止修改',
  pdfa_conformance_unverified: 'PDF/A 合规性无法可靠保持',
  malformed_or_cyclic_info_dictionary: '文档属性结构无效或包含循环',
  info_dictionary_budget_exceeded: '文档属性数量或体积超过安全上限',
  custom_info_keys_present: '存在未支持的自定义属性，系统不会静默丢弃',
  xmp_packet_present_write_unverified: '存在 XMP 元数据，尚不能保证双通道同步',
  embedded_file_metadata_cleanup_unverified: '存在附件或嵌入文件属性，尚不能安全同步',
  invalid_text_encoding_or_forbidden_control: '现有属性编码或字符不受支持',
  missing_invalid_page_box_or_non_quarter_rotation: '页面框或旋转结构不受支持',
  source_digest_changed: '源 PDF 已发生变化',
  existing_target_path: '目标文件已存在',
}
const blockerLabel = (blocker: string) => blockerLabels[blocker] || blocker

watch(() => props.defaultCopyName, value => { targetFileName.value = value })
watch(() => props.verification, value => { if (!value) scopeConfirmed.value = false })
</script>

<style scoped>
.metadata-panel { min-height: 0; flex: 1; display: flex; flex-direction: column; gap: 9px; overflow: auto; padding: 10px; }
.metadata-panel :deep(.workspace-state-notice) { flex: none; }
.metadata-panel :deep(p),.metadata-panel :deep(small) { margin: 0; font-size: var(--text-compact); line-height: 1.5; }
.metadata-fields { display: grid; gap: 9px; padding: 10px; border: 1px solid var(--workspace-border-color); border-radius: 8px; background: var(--workspace-surface-raised); }
.metadata-fields label { display: grid; gap: 5px; }
.metadata-fields label > span { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--theme-text-secondary); font-size: var(--text-compact); }
.metadata-fields strong { color: var(--theme-text); font-size: var(--text-compact); }
.metadata-fields input,.metadata-fields textarea,.metadata-copy-name input { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid var(--workspace-border-color); border-radius: 6px; outline: 0; resize: vertical; color: var(--theme-text); background: var(--theme-card); font: inherit; font-size: var(--text-compact); line-height: 1.45; }
.metadata-fields input,.metadata-copy-name input { height: 30px; padding-top: 0; padding-bottom: 0; }
.metadata-fields textarea { min-height: 62px; max-height: 120px; }
.metadata-fields input:focus,.metadata-fields textarea:focus,.metadata-copy-name input:focus { border-color: var(--theme-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-primary) 14%, transparent); }
.metadata-fields > small { color: var(--theme-text-secondary); }
.metadata-preview,.metadata-save { min-height: 32px; border: 1px solid color-mix(in srgb, var(--theme-primary) 42%, transparent); border-radius: 6px; color: var(--workspace-on-accent); background: var(--theme-primary); cursor: pointer; font-size: var(--text-compact); font-weight: 650; }
.metadata-preview:disabled,.metadata-save:disabled { cursor: default; opacity: .42; }
.metadata-verification { display: grid; gap: 8px; }
.metadata-copy-name { display: grid; gap: 4px; color: var(--theme-text-secondary); font-size: var(--text-compact); }
.metadata-confirm { display: grid; grid-template-columns: 16px minmax(0,1fr); align-items: start; gap: 6px; color: var(--theme-text); font-size: var(--text-compact); line-height: 1.45; }
.metadata-confirm input { margin: 2px 0 0; accent-color: var(--theme-primary); }
</style>
