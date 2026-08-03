import {
  UI4_CORE_SCENARIOS,
  UI4_DISPLAY_SCALES,
  UI4_PHYSICAL_VIEWPORT,
  ui4LogicalViewport,
} from './ui4-visual-matrix.mjs'

export { UI4_CORE_SCENARIOS, UI4_DISPLAY_SCALES, UI4_PHYSICAL_VIEWPORT, ui4LogicalViewport }

export const UI4B_EDITOR_SURFACES = [
  { id: 'markdown', name: 'Markdown', sampleKey: 'markdown', selector: '.library-mode', readySelector: '#vditor-lib .vditor-content' },
  { id: 'txt', name: 'TXT', sampleKey: 'txt', selector: '.text-workspace', readySelector: '.text-workspace .cm-editor' },
  { id: 'json', name: 'JSON', sampleKey: 'json', selector: '.json-workspace', readySelector: '.json-workspace .cm-editor' },
  { id: 'pdf', name: 'PDF', sampleKey: 'pdf', selector: '.pdf-view', readySelector: '.pdf-view .pdf-page' },
  { id: 'docx', name: 'DOCX', sampleKey: 'docx', selector: '.docx-workspace', readySelector: '.docx-workspace .docx-page' },
  { id: 'pptx', name: 'PPTX', sampleKey: 'pptx', selector: '.pptx-workspace', readySelector: '.pptx-workspace .slide-canvas' },
  { id: 'csv', name: 'CSV', sampleKey: 'csv', selector: '.table-view', readySelector: '.table-view .table-scroll' },
  { id: 'xlsx', name: 'XLSX', sampleKey: 'xlsx', selector: '.workbook-view', readySelector: '.workbook-view .formula-bar' },
  { id: 'diagram', name: 'Mermaid 图表', sampleKey: 'diagram', selector: '.diagram-studio', readySelector: '.diagram-studio .svg-stage svg' },
  { id: 'mindmap', name: 'OPML 脑图', sampleKey: 'mindmap', selector: '.mindmap-page', readySelector: '.mindmap-page .map-panel' },
  { id: 'canvas', name: 'JSON Canvas', sampleKey: 'canvas', selector: '.canvas-page', readySelector: '.canvas-page .canvas-node' },
]

export const ui4bManagedFileHash = filePath => `#/library?path=${encodeURIComponent(filePath)}`
