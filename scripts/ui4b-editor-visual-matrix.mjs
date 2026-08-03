import {
  UI4_CORE_SCENARIOS,
  UI4_DISPLAY_SCALES,
  UI4_PHYSICAL_VIEWPORT,
  ui4LogicalViewport,
} from './ui4-visual-matrix.mjs'

export { UI4_CORE_SCENARIOS, UI4_DISPLAY_SCALES, UI4_PHYSICAL_VIEWPORT, ui4LogicalViewport }

export const UI4B_EDITOR_SURFACES = [
  { id: 'markdown', name: 'Markdown', sampleKey: 'markdown', selector: '.library-mode', readySelector: '#vditor-lib .vditor-content', identitySelector: '.workspace-tab.active', toolbarSelector: '.tabs-bar' },
  { id: 'txt', name: 'TXT', sampleKey: 'txt', selector: '.text-workspace', readySelector: '.text-workspace .cm-editor', identitySelector: '.document-title', toolbarSelector: '.text-toolbar', statusSelector: '.status-bar' },
  { id: 'json', name: 'JSON', sampleKey: 'json', selector: '.json-workspace', readySelector: '.json-workspace .cm-editor', identitySelector: '.document-title', toolbarSelector: '.json-toolbar', statusSelector: '.json-statusbar' },
  { id: 'pdf', name: 'PDF', sampleKey: 'pdf', selector: '.pdf-view', readySelector: '.pdf-view .page-shell canvas', identitySelector: '.document-title', toolbarSelector: '.pdf-toolbar' },
  { id: 'docx', name: 'DOCX', sampleKey: 'docx', selector: '.docx-workspace', readySelector: '.docx-workspace .docx-page', identitySelector: '.document-title', toolbarSelector: '.docx-toolbar', statusSelector: '.docx-status' },
  { id: 'pptx', name: 'PPTX', sampleKey: 'pptx', selector: '.pptx-workspace', readySelector: '.pptx-workspace .slide-canvas', identitySelector: '.document-identity', toolbarSelector: '.pptx-toolbar', statusSelector: '.pptx-status' },
  { id: 'csv', name: 'CSV', sampleKey: 'csv', selector: '.table-view', readySelector: '.table-view .table-scroll', identitySelector: '.table-title', toolbarSelector: '.table-toolbar' },
  { id: 'xlsx', name: 'XLSX', sampleKey: 'xlsx', selector: '.workbook-view', readySelector: '.workbook-view .formula-bar', identitySelector: '.workbook-title', toolbarSelector: '.workbook-toolbar', statusSelector: '.workbook-status' },
  { id: 'diagram', name: 'Mermaid 图表', sampleKey: 'diagram', selector: '.diagram-studio', readySelector: '.diagram-studio .svg-stage svg', identitySelector: '.studio-title', toolbarSelector: '.studio-toolbar' },
  { id: 'mindmap', name: 'OPML 脑图', sampleKey: 'mindmap', selector: '.mindmap-page', readySelector: '.mindmap-page .map-panel', identitySelector: '.mindmap-header', toolbarSelector: '.mindmap-header, .mindmap-toolbar', statusSelector: '.statusbar' },
  { id: 'canvas', name: 'JSON Canvas', sampleKey: 'canvas', selector: '.canvas-page', readySelector: '.canvas-page .canvas-node', identitySelector: '.canvas-header', toolbarSelector: '.canvas-header, .canvas-toolbar', statusSelector: '.canvas-statusbar' },
]

export const ui4bManagedFileHash = filePath => `#/library?path=${encodeURIComponent(filePath)}`
