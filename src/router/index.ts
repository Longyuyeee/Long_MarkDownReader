import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/workspace'
  },
  {
    path: '/workspace',
    name: 'WorkspaceHome',
    component: () => import('../views/WorkspaceHome.vue')
  },
  {
    path: '/temp',
    name: 'TempMode',
    component: () => import('../views/TempMode.vue')
  },
  {
    path: '/library',
    name: 'LibraryMode',
    component: () => import('../views/LibraryMode.vue')
  },
  {
    path: '/text',
    name: 'TextEditor',
    component: () => import('../views/TextEditorView.vue')
  },
  {
    path: '/json',
    name: 'JsonEditor',
    component: () => import('../views/JsonEditorView.vue')
  },
  {
    path: '/yaml',
    name: 'YamlEditor',
    component: () => import('../views/YamlEditorView.vue')
  },
  {
    path: '/xml',
    name: 'XmlEditor',
    component: () => import('../views/XmlEditorView.vue')
  },
  {
    path: '/toml',
    name: 'TomlEditor',
    component: () => import('../views/TomlEditorView.vue')
  },
  {
    path: '/log',
    name: 'LogViewer',
    component: () => import('../views/LogViewerView.vue')
  },
  {
    path: '/docx',
    name: 'DocxEditor',
    component: () => import('../views/DocxReaderView.vue')
  },
  {
    path: '/pptx',
    name: 'PptxReader',
    component: () => import('../views/PptxReaderView.vue')
  },
  {
    path: '/quick-note',
    name: 'QuickNote',
    component: () => import('../views/QuickNote.vue')
  },
  {
    path: '/graph',
    name: 'Graph',
    component: () => import('../components/GraphView.vue')
  },
  {
    path: '/canvas',
    name: 'Canvas',
    component: () => import('../views/CanvasView.vue')
  },
  {
    path: '/pdf',
    name: 'Pdf',
    component: () => import('../views/PdfView.vue')
  },
  {
    path: '/table',
    name: 'Table',
    component: () => import('../views/TableView.vue')
  },
  {
    path: '/workbook',
    name: 'Workbook',
    component: () => import('../views/WorkbookView.vue')
  },
  {
    path: '/diagram',
    name: 'Diagram',
    component: () => import('../views/DiagramStudio.vue')
  },
  {
    path: '/mindmap',
    name: 'MindMap',
    component: () => import('../views/MindMapView.vue')
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/SettingsView.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
