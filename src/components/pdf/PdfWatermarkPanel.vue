<template>
  <div class="watermark-panel" data-testid="p1b4c-pdf-watermark">
    <WorkspaceStateNotice kind="limited" tone="warning" title="可见归属，不是内容保护">
      <p>文字会作为可搜索、可提取的矢量内容加入全部页面，熟练接收者仍可能移除或修改水印。</p>
      <small>系统只创建经过复读验证的新副本；源 PDF 不会被覆盖。水印不等同于永久脱敏、DRM 或防复制。</small>
    </WorkspaceStateNotice>

    <section class="watermark-controls">
      <label class="watermark-text">
        <span><strong>水印文字</strong><small>{{ modelValue.text.trim().length }}/64</small></span>
        <input
          :value="modelValue.text"
          maxlength="64"
          autocomplete="off"
          placeholder="例如：项目机密 L"
          aria-label="PDF 水印文字"
          @input="updateText"
          @keydown.enter.prevent="$emit('preview')"
        >
      </label>

      <label class="watermark-range">
        <span><strong>角度</strong><output>{{ Math.round(modelValue.angleDegrees) }}°</output></span>
        <input :value="modelValue.angleDegrees" type="range" min="-60" max="60" step="1" aria-label="PDF 水印角度" @input="updateNumber('angleDegrees', $event)">
      </label>

      <label class="watermark-range">
        <span><strong>透明度</strong><output>{{ Math.round(modelValue.opacity * 100) }}%</output></span>
        <input :value="modelValue.opacity" type="range" min="0.08" max="0.5" step="0.01" aria-label="PDF 水印透明度" @input="updateNumber('opacity', $event)">
      </label>

      <label class="watermark-range">
        <span><strong>灰度</strong><output>{{ Math.round(modelValue.gray * 100) }}%</output></span>
        <input :value="modelValue.gray" type="range" min="0" max="0.85" step="0.01" aria-label="PDF 水印灰度" @input="updateNumber('gray', $event)">
      </label>

      <div class="watermark-swatch" aria-hidden="true"><i :style="swatchStyle">{{ modelValue.text.trim() || '项目机密 L' }}</i></div>
      <small>首批安全子集固定为全部页面、单条居中斜向文字；字号会根据每页可用空间在 18～72 pt 内自动适配。</small>
    </section>

    <button class="watermark-preview" :disabled="!canPreview || working" @click="$emit('preview')">
      {{ working ? '正在生成并复读验证…' : '生成并验证水印副本' }}
    </button>

    <WorkspaceStateNotice v-if="operationError" kind="error" tone="danger" title="水印副本验证失败"><p>{{ operationError }}</p></WorkspaceStateNotice>
    <WorkspaceStateNotice v-else-if="verification?.status === 'blocked'" kind="error" tone="danger" title="当前 PDF 不能安全添加水印">
      <p>{{ verification.blockers.map(blockerLabel).join(' · ') }}</p>
    </WorkspaceStateNotice>

    <section v-else-if="verification?.status === 'isolated_verified'" class="watermark-verification">
      <WorkspaceStateNotice kind="saved" tone="success" title="矢量水印副本验证通过" compact>
        <span>{{ verification.watermarkedPages }} 页 · {{ formatBytes(verification.outputBytes) }}</span>
        <small>{{ fontSizeLabel }} · 页面几何与交互结构已复读，源文件尚未写入。</small>
      </WorkspaceStateNotice>
      <label class="watermark-copy-name"><span>新副本文件名</span><input v-model="targetFileName" maxlength="180" aria-label="PDF 水印新副本文件名" @keydown.enter.prevent="save"></label>
      <label class="watermark-confirm"><input v-model="tradeoffConfirmed" type="checkbox"><span>我理解水印文字可被搜索、提取、编辑或移除，也不能代替永久脱敏。</span></label>
      <button class="watermark-save" :disabled="!tradeoffConfirmed || saving || !targetFileName.trim()" @click="save">
        {{ saving ? '正在可靠另存并复读…' : '另存水印副本并打开' }}
      </button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import WorkspaceStateNotice from '../workspace/WorkspaceStateNotice.vue'
import type { PdfWatermarkCopyReport, PdfWatermarkSpec } from '../../types/pdfWatermark'

const props = defineProps<{
  modelValue: PdfWatermarkSpec
  verification: PdfWatermarkCopyReport | null
  working: boolean
  saving: boolean
  operationError: string
  defaultCopyName: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: PdfWatermarkSpec]
  preview: []
  save: [targetFileName: string]
}>()

const targetFileName = ref(props.defaultCopyName)
const tradeoffConfirmed = ref(false)
const canPreview = computed(() => props.modelValue.text.trim().length > 0)
const swatchStyle = computed(() => ({
  color: `rgba(${Math.round(props.modelValue.gray * 255)}, ${Math.round(props.modelValue.gray * 255)}, ${Math.round(props.modelValue.gray * 255)}, ${props.modelValue.opacity})`,
  transform: `rotate(${props.modelValue.angleDegrees}deg)`,
}))
const fontSizeLabel = computed(() => {
  const minimum = props.verification?.minimumFontSizePoints
  const maximum = props.verification?.maximumFontSizePoints
  if (minimum == null || maximum == null) return '自动字号已验证'
  return Math.abs(minimum - maximum) < 0.05
    ? `${minimum.toFixed(1)} pt 自动字号`
    : `${minimum.toFixed(1)}～${maximum.toFixed(1)} pt 自动字号`
})

const update = (patch: Partial<PdfWatermarkSpec>) => emit('update:modelValue', { ...props.modelValue, ...patch })
const updateText = (event: Event) => update({ text: (event.target as HTMLInputElement).value })
const updateNumber = (key: 'angleDegrees' | 'opacity' | 'gray', event: Event) => update({ [key]: Number((event.target as HTMLInputElement).value) })
const save = () => {
  if (!tradeoffConfirmed.value || !targetFileName.value.trim()) return
  emit('save', targetFileName.value.trim())
}
const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
const blockerLabels: Record<string, string> = {
  encrypted_pdf_unverified: '加密 PDF 暂不支持水印副本',
  digital_signature_or_certification_present: '数字签名或认证 PDF 禁止添加水印',
  missing_invalid_page_box_or_non_quarter_rotation: '页面框或旋转结构不受支持',
  unsupported_user_unit: '页面 UserUnit 不是受支持的标准值',
  pdfa_conformance_unverified: 'PDF/A 合规性无法可靠保持',
  invalid_or_cyclic_page_tree: '页面树无效或包含循环',
  source_digest_changed: '源 PDF 已发生变化',
  existing_target_path: '目标文件已存在',
}
const blockerLabel = (blocker: string) => blockerLabels[blocker] || blocker

watch(() => props.defaultCopyName, value => { targetFileName.value = value })
watch(() => props.verification, value => { if (!value) tradeoffConfirmed.value = false })
</script>

<style scoped>
.watermark-panel { min-height: 0; flex: 1; display: flex; flex-direction: column; gap: 9px; overflow: auto; padding: 10px; }
.watermark-panel :deep(.workspace-state-notice) { flex: none; }
.watermark-panel :deep(p),.watermark-panel :deep(small) { margin: 0; font-size: var(--text-compact); line-height: 1.5; }
.watermark-controls { display: grid; gap: 9px; padding: 10px; border: 1px solid var(--workspace-border-color); border-radius: 8px; background: var(--workspace-surface-raised); }
.watermark-controls label { display: grid; gap: 5px; }
.watermark-controls label > span { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--theme-text-secondary); font-size: var(--text-compact); }
.watermark-controls strong { color: var(--theme-text); font-size: var(--text-compact); }
.watermark-controls input[type="text"],.watermark-text input,.watermark-copy-name input { width: 100%; height: 30px; box-sizing: border-box; padding: 0 8px; border: 1px solid var(--workspace-border-color); border-radius: 6px; outline: 0; color: var(--theme-text); background: var(--theme-card); font: inherit; font-size: var(--text-compact); }
.watermark-controls input:focus,.watermark-copy-name input:focus { border-color: var(--theme-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-primary) 14%, transparent); }
.watermark-range input { width: 100%; margin: 0; accent-color: var(--theme-primary); }
.watermark-range output { color: var(--theme-text-secondary); font-size: var(--text-compact); font-variant-numeric: tabular-nums; }
.watermark-swatch { height: 72px; display: grid; place-items: center; overflow: hidden; border: 1px dashed var(--workspace-border-color); border-radius: 7px; background: var(--workspace-control-bg); }
.watermark-swatch i { max-width: 82%; overflow: hidden; font-size: 20px; font-style: normal; font-weight: 600; white-space: nowrap; text-overflow: ellipsis; transform-origin: center; }
.watermark-controls > small { color: var(--theme-text-secondary); }
.watermark-preview,.watermark-save { min-height: 32px; border: 1px solid color-mix(in srgb, var(--theme-primary) 42%, transparent); border-radius: 6px; color: var(--workspace-on-accent); background: var(--theme-primary); cursor: pointer; font-size: var(--text-compact); font-weight: 650; }
.watermark-preview:disabled,.watermark-save:disabled { cursor: default; opacity: .42; }
.watermark-verification { display: grid; gap: 8px; }
.watermark-copy-name { display: grid; gap: 4px; color: var(--theme-text-secondary); font-size: var(--text-compact); }
.watermark-confirm { display: grid; grid-template-columns: 16px minmax(0,1fr); align-items: start; gap: 6px; color: var(--theme-text); font-size: var(--text-compact); line-height: 1.45; }
.watermark-confirm input { margin: 2px 0 0; accent-color: var(--theme-primary); }
</style>
