<template>
  <section class="display-preferences-editor" :data-document-style="preferences.documentStyle"
    :data-document-font="preferences.documentFont" :data-file-density="preferences.fileDensity"
    :data-file-row-style="preferences.fileRowStyle" :data-file-icon-style="preferences.fileIconStyle"
    :style="previewStyle" aria-label="文档与文件显示设置">
    <p class="display-help">界面风格决定整体质感；下面的选项可以单独调整文档和文件列表。</p>
    <div class="display-settings-grid">
      <div class="display-controls">
        <n-form-item label="文档显示">
          <n-radio-group :value="preferences.documentStyle" size="small" @update:value="change('documentStyle', $event)">
            <n-radio-button v-for="option in documentStyles" :key="option.value" :value="option.value">{{ option.label }}</n-radio-button>
          </n-radio-group>
        </n-form-item>
        <n-form-item label="正文字体">
          <n-select :value="preferences.documentFont" :options="fontOptions" aria-label="正文字体" @update:value="change('documentFont', $event)" />
        </n-form-item>
        <n-form-item v-if="preferences.documentFont === 'custom'" label="已安装字体名称">
          <n-input :value="preferences.documentCustomFont" :input-props="{ 'aria-label': '已安装字体名称' }" placeholder="例如：Microsoft YaHei" :maxlength="100" @update:value="change('documentCustomFont', $event)" />
        </n-form-item>
        <p class="display-help">字体需已安装在本机；缺失时自动回退，不会下载字体。</p>
        <div class="display-numbers">
          <n-form-item label="字号">
            <n-input-number :value="preferences.documentFontSize" :min="12" :max="28" :step="1" :input-props="{ role: 'spinbutton', 'aria-label': '正文字号', 'aria-valuemin': 12, 'aria-valuemax': 28, 'aria-valuenow': preferences.documentFontSize }" @update:value="change('documentFontSize', $event)" />
          </n-form-item>
          <n-form-item label="行距">
            <n-input-number :value="preferences.documentLineHeight" :min="1.3" :max="2.4" :step="0.05" :precision="2" :input-props="{ role: 'spinbutton', 'aria-label': '正文行距', 'aria-valuemin': 1.3, 'aria-valuemax': 2.4, 'aria-valuenow': preferences.documentLineHeight }" @update:value="change('documentLineHeight', $event)" />
          </n-form-item>
        </div>
        <details class="typography-details">
          <summary>更多排版选项</summary>
          <div class="display-numbers">
            <n-form-item label="字距（px）"><n-input-number :value="preferences.documentLetterSpacing" :min="0" :max="4" :step="0.25" :input-props="{ 'aria-label': '正文字距', role: 'spinbutton' }" @update:value="change('documentLetterSpacing', $event)" /></n-form-item>
            <n-form-item label="段后间距（em）"><n-input-number :value="preferences.documentParagraphSpacing" :min="0" :max="3" :step="0.25" :input-props="{ 'aria-label': '段后间距', role: 'spinbutton' }" @update:value="change('documentParagraphSpacing', $event)" /></n-form-item>
          </div>
          <n-form-item label="正文对齐"><n-radio-group :value="preferences.documentTextAlign" @update:value="change('documentTextAlign', $event)"><n-radio-button value="left">左对齐</n-radio-button><n-radio-button value="justify">两端对齐</n-radio-button></n-radio-group></n-form-item>
        </details>
        <n-form-item label="文件行密度">
          <n-radio-group :value="preferences.fileDensity" size="small" @update:value="change('fileDensity', $event)">
            <n-radio-button v-for="option in densities" :key="option.value" :value="option.value">{{ option.label }}</n-radio-button>
          </n-radio-group>
        </n-form-item>
        <n-form-item label="文件行样式">
          <n-radio-group :value="preferences.fileRowStyle" size="small" @update:value="change('fileRowStyle', $event)">
            <n-radio-button v-for="option in rowStyles" :key="option.value" :value="option.value">{{ option.label }}</n-radio-button>
          </n-radio-group>
        </n-form-item>
        <n-form-item label="文件图标">
          <n-radio-group :value="preferences.fileIconStyle" size="small" @update:value="change('fileIconStyle', $event)">
            <n-radio-button value="color">彩色</n-radio-button><n-radio-button value="muted">单色</n-radio-button>
          </n-radio-group>
        </n-form-item>
        <n-button size="small" @click="$emit('update:modelValue', { ...DEFAULT_DISPLAY_PREFERENCES })">恢复显示默认值</n-button>
        <p class="display-help">这些选项只改变显示。PDF 和 Office 保留原文档排版；文件右键中的单个文件显示样式继续保留。</p>
      </div>
      <div class="display-live-preview" aria-label="显示效果实时预览">
        <span class="display-preview-label">实时预览</span>
        <div class="display-document-preview">
          <h1>项目方案</h1>
          <p>把资料整理成可继续的工作。舒服的排版，让阅读和记录更顺手。</p>
          <blockquote>保留完整功能，也让常用操作容易找到。</blockquote>
          <table><thead><tr><th>任务</th><th>状态</th></tr></thead><tbody><tr><td>需求整理</td><td>进行中</td></tr><tr><td>界面设计</td><td>待完善</td></tr></tbody></table>
          <pre><code>const note = '让记录更顺手'</code></pre>
        </div>
        <div class="display-file-preview" aria-label="文件列表显示预览">
          <div class="display-file-row"><Folder :size="16" class="file-color-folder" /><span>项目资料</span></div>
          <div class="display-file-row child selected"><FileText :size="16" class="file-color-markdown" /><span>项目方案.md</span></div>
          <div class="display-file-row child"><FileText :size="16" class="file-color-pdf" /><span>调研报告.pdf</span></div>
          <div class="display-file-row child"><FileSpreadsheet :size="16" class="file-color-table" /><span>预算.xlsx</span></div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { FileText, FileSpreadsheet, Folder } from 'lucide-vue-next'
import { DEFAULT_DISPLAY_PREFERENCES, normalizeDisplayPreferences, documentTypographyStyle, type DisplayPreferences } from '../config/displayPreferences'

const props = defineProps<{ modelValue: DisplayPreferences }>()
const emit = defineEmits<{ 'update:modelValue': [value: DisplayPreferences] }>()
const preferences = computed(() => normalizeDisplayPreferences(props.modelValue))
const change = (key: keyof DisplayPreferences, value: unknown) =>
  emit('update:modelValue', normalizeDisplayPreferences({ ...preferences.value, [key]: value }))
const documentStyles = [
  { label: '跟随风格', value: 'auto' }, { label: '简洁', value: 'plain' },
  { label: '纸张', value: 'paper' }, { label: '排版', value: 'editorial' },
]
const fontOptions = [
  { label: '跟随排版', value: 'auto' }, { label: '无衬线', value: 'sans' },
  { label: '衬线', value: 'serif' }, { label: '等宽', value: 'mono' },
  { label: '微软雅黑', value: 'yahei' }, { label: '宋体', value: 'simsun' },
  { label: '楷体', value: 'kaiti' }, { label: '仿宋', value: 'fangsong' },
  { label: '思源黑体 / Noto Sans SC', value: 'notoSans' }, { label: '思源宋体 / Noto Serif SC', value: 'notoSerif' },
  { label: 'Consolas · 等宽', value: 'consolas' }, { label: '自定义已安装字体…', value: 'custom' },
]
const densities = [
  { label: '跟随风格', value: 'auto' }, { label: '紧凑', value: 'compact' },
  { label: '舒适', value: 'comfortable' }, { label: '宽松', value: 'spacious' },
]
const rowStyles = [
  { label: '跟随风格', value: 'auto' }, { label: '平面', value: 'flat' }, { label: '卡片', value: 'cards' },
]
const previewStyle = computed(() => documentTypographyStyle(preferences.value))
</script>

<style scoped>
.display-preferences-editor { scroll-margin-top: 18px; }
.display-settings-grid { display: grid; grid-template-columns: minmax(270px, 1fr) minmax(280px, 1fr); gap: 24px; align-items: start; }
.display-controls { min-width: 0; }
.typography-details { margin: 0 0 20px; }
.typography-details summary { cursor: pointer; margin-bottom: 14px; }
.display-numbers { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.display-controls :deep(.n-radio-group) { display: flex; flex-wrap: wrap; gap: 3px; }
.display-controls :deep(.n-radio-button) { border-radius: var(--theme-radius-sm); }
.display-help { font-size: var(--text-sm); color: var(--theme-text-secondary); line-height: 1.65; }
.display-live-preview { min-width: 0; padding: 16px; border: var(--theme-border); border-radius: var(--theme-radius); background: var(--theme-bg); }
.display-preview-label { display: block; margin-bottom: 12px; font-size: var(--text-compact); color: var(--theme-text-secondary); }
.display-document-preview { padding: 20px; }
.display-file-preview { margin-top: 18px; }
.display-file-row { display: flex; align-items: center; gap: 8px; padding: 0 9px; color: var(--theme-text); }
.display-file-row.child { margin-left: 16px; }
.display-file-row.selected { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), .1); }
.file-color-folder { color: #d69a37; }.file-color-markdown { color: #2563eb; }.file-color-pdf { color: #df4a43; }.file-color-table { color: #16884b; }
@media (max-width: 920px) { .display-settings-grid { grid-template-columns: minmax(0, 1fr); } }
</style>

