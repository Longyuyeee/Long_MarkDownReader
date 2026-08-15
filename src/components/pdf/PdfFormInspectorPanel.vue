<template>
  <section class="form-inspector" data-testid="p1b2a2-pdf-form-panel" aria-label="PDF 表单结构检查">
    <WorkspaceStateNotice v-if="loading" kind="loading" tone="info" title="正在检查表单结构" compact>
      只读取规范字段树与页面控件，不会修改 PDF。
    </WorkspaceStateNotice>
    <WorkspaceStateNotice v-else-if="error" kind="error" tone="danger" title="表单检查失败" compact>
      <span>{{ error }}</span>
      <template #action><button @click="$emit('retry')">重试</button></template>
    </WorkspaceStateNotice>
    <template v-else-if="report">
      <div class="form-summary" :class="`status-${report.status}`">
        <div class="form-summary-heading">
          <strong>{{ statusTitle }}</strong>
          <span>{{ report.fieldCount }} 字段 · {{ report.widgetCount }} 控件</span>
        </div>
        <p>{{ statusDescription }}</p>
        <dl>
          <div><dt>可填写候选</dt><dd>{{ report.fillableCandidateCount }}</dd></div>
          <div><dt>缺少外观</dt><dd>{{ report.missingAppearanceCount }}</dd></div>
          <div><dt>孤儿控件</dt><dd>{{ report.orphanWidgetCount }}</dd></div>
          <div><dt>源文件</dt><dd>{{ formatBytes(report.sourceBytes) }}</dd></div>
        </dl>
      </div>

      <div v-if="report.blockers.length" class="form-risk" role="alert">
        <strong>已阻断后续填写</strong>
        <ul><li v-for="item in report.blockers" :key="item">{{ blockerLabel(item) }}</li></ul>
      </div>
      <div v-else-if="report.diagnostics.length" class="form-risk diagnostic">
        <strong>结构诊断</strong>
        <ul><li v-for="item in report.diagnostics" :key="item">{{ diagnosticLabel(item) }}</li></ul>
      </div>

      <div v-if="report.status !== 'no_form'" class="form-field-tools">
        <input v-model="query" type="search" maxlength="256" aria-label="筛选 PDF 表单字段" placeholder="筛选字段名称或值">
        <span>{{ filteredFields.length }} 项</span>
      </div>
      <div v-if="visibleFields.length" class="form-field-list">
        <article v-for="(field, index) in visibleFields" :key="`${field.name}-${field.fieldType}-${index}`" class="form-field-card">
          <div class="form-field-heading">
            <strong :title="field.name">{{ field.name || '未命名字段' }}</strong>
            <span>{{ fieldTypeLabel(field.fieldType) }}</span>
          </div>
          <p v-if="field.password" class="form-private-value">密码值已隐藏</p>
          <p v-else-if="field.value">{{ field.value }}</p>
          <p v-else class="form-empty-value">未填写</p>
          <div class="form-field-flags">
            <i v-if="field.fillableCandidate">候选</i>
            <i v-if="field.required">必填</i>
            <i v-if="field.readOnly">只读</i>
            <i v-if="field.multiline">多行</i>
            <i v-if="field.optionCount">{{ field.optionCount }} 选项</i>
            <i>{{ field.widgetCount }} 控件</i>
          </div>
          <div v-if="fieldWidgets(field.name).length" class="form-widget-links">
            <button v-for="widget in fieldWidgets(field.name)" :key="widget.objectId || `${field.name}-${widget.page}`" @click="$emit('go-page', widget.page)">
              第 {{ widget.page }} 页<span v-if="!widget.hasNormalAppearance"> · 缺外观</span>
            </button>
          </div>
        </article>
      </div>
      <p v-else-if="report.status !== 'no_form'" class="form-panel-empty">没有匹配的字段</p>
      <p v-if="filteredFields.length > renderLimit" class="form-render-limit">为保持界面流畅，仅显示前 {{ renderLimit }} 项；继续输入名称可缩小范围。</p>
      <p class="form-readonly-note">结构检查只读；本阶段没有填写、保存或覆盖入口。摘要 {{ report.sourceDigest.slice(0, 12) }}…</p>
    </template>
    <p v-else class="form-panel-empty">打开“表单”后开始只读检查</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import WorkspaceStateNotice from '../workspace/WorkspaceStateNotice.vue'
import type { PdfFormInspectionReport, PdfFormWidgetSummary } from '../../types/pdfForms'

const props = defineProps<{ report: PdfFormInspectionReport | null; loading: boolean; error: string }>()
defineEmits<{ retry: []; 'go-page': [page: number] }>()

const query = ref('')
const renderLimit = 300
const statusTitle = computed(() => props.report?.status === 'blocked' ? '表单结构存在风险' : props.report?.status === 'inspectable' ? '表单结构可检查' : '未检测到 AcroForm')
const statusDescription = computed(() => props.report?.status === 'blocked'
  ? '可以查看字段，但不能进入后续填写流程。'
  : props.report?.status === 'inspectable'
    ? '字段与页面控件关联清晰；当前仍为只读检查。'
    : '这份 PDF 没有标准 AcroForm 字段。')
const filteredFields = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase()
  if (!normalized) return props.report?.fields || []
  return (props.report?.fields || []).filter(field => `${field.name}\n${field.value || ''}\n${field.defaultValue || ''}`.toLocaleLowerCase().includes(normalized))
})
const visibleFields = computed(() => filteredFields.value.slice(0, renderLimit))
const widgetsByField = computed(() => {
  const result = new Map<string, PdfFormWidgetSummary[]>()
  for (const widget of props.report?.widgets || []) {
    const list = result.get(widget.fieldName) || []
    if (list.length < 20) list.push(widget)
    result.set(widget.fieldName, list)
  }
  return result
})
const fieldWidgets = (name: string) => widgetsByField.value.get(name) || []
const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
const fieldTypeLabel = (type: string) => ({ Tx: '文本', Btn: '按钮', Ch: '选项', Sig: '签名' }[type] || type || '未知')
const blockerLabel = (item: string) => ({
  encrypted_pdf_unverified: 'PDF 已加密，无法验证安全写入边界',
  digital_signature_unverified: '包含数字签名或权限签名',
  xfa_form_unverified: '包含不支持的 XFA 表单',
  pdf_javascript_unverified: '包含 PDF JavaScript',
  field_or_widget_actions_unverified: '字段或控件包含动作',
  duplicate_field_names_unverified: '存在重复完整字段名',
  orphan_widgets_unverified: '存在未关联规范字段的控件',
  signature_field_unverified: '包含签名字段',
  field_tree_ambiguity_unverified: '字段树存在结构歧义',
}[item] || item)
const diagnosticLabel = (item: string) => ({
  field_tree_cycle_or_reuse: '字段树循环或重复引用',
  invalid_field_reference: '字段引用无效',
  invalid_kid_reference: '子字段引用无效',
  direct_field_dictionary: '存在直接字段字典，无法稳定定位',
}[item] || item)
</script>

<style scoped>
.form-inspector { min-height: 0; flex: 1; overflow: auto; padding: 10px; font-size: var(--text-compact); }
.form-summary { padding: 10px; border: 1px solid rgba(var(--theme-primary-rgb),.2); border-radius: 8px; background: rgba(var(--theme-primary-rgb),.055); }
.form-summary.status-blocked { border-color: rgba(220,76,62,.24); background: rgba(220,76,62,.06); }
.form-summary-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }.form-summary-heading strong { font-size: 11px; }.form-summary-heading span { color: var(--theme-text-secondary); white-space: nowrap; }
.form-summary p { margin: 5px 0 8px; color: var(--theme-text-secondary); line-height: 1.45; }
.form-summary dl { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin: 0; }.form-summary dl div { padding: 6px; border-radius: 5px; background: var(--workspace-control-bg); }.form-summary dt { color: var(--theme-text-secondary); }.form-summary dd { margin: 2px 0 0; color: var(--theme-text); font-weight: 650; }
.form-risk { margin-top: 8px; padding: 8px; border-left: 2px solid var(--status-danger); color: var(--status-danger); background: rgba(220,76,62,.06); }.form-risk.diagnostic { border-left-color: var(--status-warning); color: var(--status-warning); }.form-risk strong { font-size: var(--text-compact); }.form-risk ul { margin: 5px 0 0; padding-left: 16px; }.form-risk li { margin: 2px 0; line-height: 1.4; }
.form-field-tools { position: sticky; top: 0; z-index: 1; display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 6px; margin: 9px -2px 7px; padding: 2px; background: var(--theme-card); }.form-field-tools input { min-width: 0; height: 29px; padding: 0 8px; border: 1px solid var(--workspace-border-color); border-radius: 6px; outline: 0; color: var(--theme-text); background: var(--workspace-control-bg); font: inherit; }.form-field-tools input:focus { border-color: rgba(var(--theme-primary-rgb),.5); }.form-field-tools span { color: var(--theme-text-secondary); }
.form-field-list { display: grid; gap: 7px; }.form-field-card { min-width: 0; padding: 8px; border: 1px solid var(--workspace-border-color); border-radius: 7px; background: var(--workspace-surface-raised); }.form-field-heading { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 7px; }.form-field-heading strong { overflow: hidden; color: var(--theme-text); font-size: var(--text-compact); text-overflow: ellipsis; white-space: nowrap; }.form-field-heading > span { padding: 2px 5px; border-radius: 999px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.09); }
.form-field-card > p { display: -webkit-box; margin: 6px 0; overflow: hidden; color: var(--theme-text-secondary); line-height: 1.45; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }.form-field-card > .form-private-value { color: var(--status-warning); }.form-field-card > .form-empty-value { opacity: .7; font-style: italic; }
.form-field-flags { display: flex; flex-wrap: wrap; gap: 4px; }.form-field-flags i { padding: 2px 5px; border: 1px solid var(--workspace-border-color); border-radius: 4px; color: var(--theme-text-secondary); font-style: normal; }
.form-widget-links { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 7px; padding-top: 6px; border-top: 1px solid var(--workspace-border-color); }.form-widget-links button { min-height: 24px; padding: 2px 6px; border: 1px solid rgba(var(--theme-primary-rgb),.24); border-radius: 5px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.06); cursor: pointer; font: inherit; }
.form-panel-empty,.form-render-limit,.form-readonly-note { margin: 10px 0 0; color: var(--theme-text-secondary); line-height: 1.5; text-align: center; }.form-render-limit { color: var(--status-warning); }.form-readonly-note { padding-top: 8px; border-top: 1px solid var(--workspace-border-color); overflow-wrap: anywhere; }
</style>
