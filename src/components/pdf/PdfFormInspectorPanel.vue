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
            <span>{{ fieldTypeLabel(field) }}</span>
          </div>
          <p v-if="field.password" class="form-private-value">密码值已隐藏</p>
          <p v-else-if="field.value">{{ field.value }}</p>
          <p v-else class="form-empty-value">未填写</p>
          <label v-if="editableTextField(field)" class="form-text-edit">
            <span>副本中的文本</span>
            <input :value="draftValue(field)" maxlength="1024" @input="updateDraft(field.name, inputValue($event))">
          </label>
          <label v-else-if="editableCheckboxField(field)" class="form-checkbox-edit">
            <input type="checkbox" :checked="checkboxChecked(field)" @change="updateCheckboxDraft(field, checkboxCheckedEvent($event))">
            <span>在副本中{{ checkboxChecked(field) ? '保持勾选' : '设为勾选' }}（导出值 {{ field.buttonExportValues[0] }}）</span>
          </label>
          <fieldset v-else-if="editableRadioField(field)" class="form-radio-edit">
            <legend>副本中的单选项</legend>
            <label v-for="option in radioOptions(field)" :key="option">
              <input type="radio" :name="`pdf-form-${field.name}`" :value="option" :checked="draftValue(field) === option" @change="updateDraft(field.name, option)">
              <span>{{ option }}</span>
            </label>
          </fieldset>
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
      <section v-if="editableFieldCount" class="form-copy-actions" data-testid="p1b2b2-pdf-form-copy" data-capability="p1b2b4-checkbox-copy" data-stage-capability="p1b2b5-radio-copy">
        <strong>表单可靠副本</strong>
        <p>仅修改新副本；源 PDF 和已有文件不会覆盖。支持中文单行文本、具有唯一导出状态的复选框与互斥单选组。</p>
        <WorkspaceStateNotice v-if="operationError" kind="error" tone="danger" compact>{{ operationError }}</WorkspaceStateNotice>
        <WorkspaceStateNotice v-else-if="verification" :kind="verification.status === 'isolated_verified' ? 'saved' : 'limited'" :tone="verification.status === 'isolated_verified' ? 'success' : 'warning'" compact>
          {{ verification.status === 'isolated_verified' ? `已验证 ${verification.changedFields.length} 个字段、${verification.appearanceStreamsWritten} 个文本外观与 ${verification.widgetStatesWritten} 个按钮状态` : `已阻断：${verification.blockers.join('、')}` }}
        </WorkspaceStateNotice>
        <label class="form-copy-name"><span>副本文件名</span><input v-model="targetFileName" maxlength="180"></label>
        <div class="form-copy-buttons">
          <button :disabled="working || !changes.length" @click="$emit('preview-copy', changes)">{{ working ? '处理中…' : '验证副本' }}</button>
          <button class="primary" :disabled="working || verification?.status !== 'isolated_verified' || !targetFileName.trim()" @click="$emit('save-copy', { changes, targetFileName: targetFileName.trim() })">可靠另存</button>
        </div>
      </section>
      <p class="form-readonly-note">未支持的字段保持只读。源摘要 {{ report.sourceDigest.slice(0, 12) }}…</p>
    </template>
    <p v-else class="form-panel-empty">打开“表单”后开始只读检查</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import WorkspaceStateNotice from '../workspace/WorkspaceStateNotice.vue'
import type { PdfFormFieldSummary, PdfFormInspectionReport, PdfFormTextChange, PdfFormTextFillReport, PdfFormWidgetSummary } from '../../types/pdfForms'

const props = defineProps<{ report: PdfFormInspectionReport | null; loading: boolean; error: string; verification: PdfFormTextFillReport | null; working: boolean; operationError: string; defaultCopyName: string }>()
const emit = defineEmits<{ retry: []; 'go-page': [page: number]; 'preview-copy': [changes: PdfFormTextChange[]]; 'save-copy': [request: { changes: PdfFormTextChange[]; targetFileName: string }]; 'draft-change': [] }>()

const query = ref('')
const drafts = ref<Record<string, string>>({})
const targetFileName = ref(props.defaultCopyName)
const renderLimit = 300
const statusTitle = computed(() => props.report?.status === 'blocked' ? '表单结构存在风险' : props.report?.status === 'inspectable' ? '表单结构可检查' : '未检测到 AcroForm')
const statusDescription = computed(() => props.report?.status === 'blocked'
  ? '可以查看字段，但不能进入后续填写流程。'
  : props.report?.status === 'inspectable'
    ? '字段与页面控件关联清晰；可为安全文本、复选框与单选组子集创建可靠副本。'
    : '这份 PDF 没有标准 AcroForm 字段。')
const filteredFields = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase()
  if (!normalized) return props.report?.fields || []
  return (props.report?.fields || []).filter(field => `${field.name}\n${field.value || ''}\n${field.defaultValue || ''}`.toLocaleLowerCase().includes(normalized))
})
const visibleFields = computed(() => filteredFields.value.slice(0, renderLimit))
const editableTextField = (field: PdfFormFieldSummary) => props.report?.status === 'inspectable' && field.fieldType === 'Tx' && field.fillableCandidate && !field.multiline && !field.password && !field.hasActions
const editableCheckboxField = (field: PdfFormFieldSummary) => props.report?.status === 'inspectable' && field.fieldType === 'Btn' && field.buttonKind === 'checkbox' && field.fillableCandidate && !field.hasActions && field.buttonExportValues.length === 1 && fieldWidgets(field.name).every(widget => widget.appearanceStates.includes('Off') && widget.appearanceStates.includes(field.buttonExportValues[0]))
const radioOptions = (field: PdfFormFieldSummary) => fieldWidgets(field.name).map(widget => widget.appearanceStates.filter(state => state !== 'Off')).filter(states => states.length === 1).map(states => states[0])
const editableRadioField = (field: PdfFormFieldSummary) => {
  if (props.report?.status !== 'inspectable' || field.fieldType !== 'Btn' || field.buttonKind !== 'radio' || !field.fillableCandidate || field.hasActions || field.buttonExportValues.length < 2) return false
  const widgets = fieldWidgets(field.name)
  const options = radioOptions(field)
  return widgets.length === field.widgetCount && options.length === widgets.length && new Set(options).size === options.length && options.every(option => field.buttonExportValues.includes(option)) && widgets.every(widget => widget.appearanceStates.includes('Off'))
}
const editableField = (field: PdfFormFieldSummary) => editableTextField(field) || editableCheckboxField(field) || editableRadioField(field)
const editableFieldCount = computed(() => (props.report?.fields || []).filter(editableField).length)
const draftValue = (field: PdfFormFieldSummary) => drafts.value[field.name] ?? field.value ?? ''
const changes = computed<PdfFormTextChange[]>(() => (props.report?.fields || []).filter(editableField).filter(field => draftValue(field) !== (field.value ?? '')).map(field => ({ fieldName: field.name, value: draftValue(field) })))
const updateDraft = (name: string, value: string) => { drafts.value = { ...drafts.value, [name]: value }; emit('draft-change') }
const checkboxChecked = (field: PdfFormFieldSummary) => draftValue(field) === field.buttonExportValues[0]
const checkboxCheckedEvent = (event: Event) => (event.target as HTMLInputElement).checked
const updateCheckboxDraft = (field: PdfFormFieldSummary, checked: boolean) => updateDraft(field.name, checked ? field.buttonExportValues[0] : 'Off')
const inputValue = (event: Event) => (event.target as HTMLInputElement).value
watch(() => props.report?.sourceDigest, () => { drafts.value = {}; targetFileName.value = props.defaultCopyName })
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
const fieldTypeLabel = (field: PdfFormFieldSummary) => field.buttonKind === 'checkbox' ? '复选框' : field.buttonKind === 'radio' ? '单选组' : field.buttonKind === 'pushbutton' ? '按钮' : ({ Tx: '文本', Btn: '按钮', Ch: '选项', Sig: '签名' }[field.fieldType] || field.fieldType || '未知')
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
.form-text-edit,.form-copy-name { display: grid; gap: 4px; margin-top: 7px; color: var(--theme-text-secondary); }.form-text-edit input,.form-copy-name input { min-width: 0; height: 30px; padding: 0 8px; border: 1px solid var(--workspace-border-color); border-radius: 6px; color: var(--theme-text); background: var(--workspace-control-bg); font: inherit; }
.form-checkbox-edit { display: flex; align-items: center; gap: 7px; margin-top: 7px; padding: 7px; border-radius: 6px; color: var(--theme-text-secondary); background: var(--workspace-control-bg); line-height: 1.35; }.form-checkbox-edit input { width: 16px; height: 16px; margin: 0; accent-color: var(--theme-primary); }
.form-radio-edit { display: grid; gap: 5px; margin: 7px 0 0; padding: 7px; border: 0; border-radius: 6px; color: var(--theme-text-secondary); background: var(--workspace-control-bg); }.form-radio-edit legend { padding: 0; color: var(--theme-text-secondary); }.form-radio-edit label { display: flex; align-items: center; gap: 7px; min-width: 0; line-height: 1.35; }.form-radio-edit input { width: 16px; height: 16px; margin: 0; accent-color: var(--theme-primary); }.form-radio-edit span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.form-field-flags { display: flex; flex-wrap: wrap; gap: 4px; }.form-field-flags i { padding: 2px 5px; border: 1px solid var(--workspace-border-color); border-radius: 4px; color: var(--theme-text-secondary); font-style: normal; }
.form-widget-links { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 7px; padding-top: 6px; border-top: 1px solid var(--workspace-border-color); }.form-widget-links button { min-height: 24px; padding: 2px 6px; border: 1px solid rgba(var(--theme-primary-rgb),.24); border-radius: 5px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.06); cursor: pointer; font: inherit; }
.form-panel-empty,.form-render-limit,.form-readonly-note { margin: 10px 0 0; color: var(--theme-text-secondary); line-height: 1.5; text-align: center; }.form-render-limit { color: var(--status-warning); }.form-readonly-note { padding-top: 8px; border-top: 1px solid var(--workspace-border-color); overflow-wrap: anywhere; }
.form-copy-actions { display: grid; gap: 7px; margin-top: 9px; padding: 9px; border: 1px solid rgba(var(--theme-primary-rgb),.24); border-radius: 8px; background: rgba(var(--theme-primary-rgb),.05); }.form-copy-actions > p { margin: 0; color: var(--theme-text-secondary); line-height: 1.45; }.form-copy-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }.form-copy-buttons button { min-height: 30px; border: 1px solid var(--workspace-border-color); border-radius: 6px; color: var(--theme-text); background: var(--workspace-control-bg); font: inherit; }.form-copy-buttons .primary { border-color: rgba(var(--theme-primary-rgb),.4); color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.1); }.form-copy-buttons button:disabled { opacity: .5; }
</style>
