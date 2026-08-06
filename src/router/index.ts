import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    // The library/editor shell is the product's primary surface. Management
    // dashboards remain reachable from the shell, but must not replace it at startup.
    redirect: '/library'
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
    path: '/drawio',
    name: 'DrawioEditor',
    component: () => import('../views/DrawioEditorView.vue')
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
    path: '/odt',
    name: 'OdtReader',
    component: () => import('../views/OdtReaderView.vue')
  },
  {
    path: '/odf-content',
    name: 'OdfReader',
    component: () => import('../views/OdfContentReaderView.vue')
  },
  {
    path: '/pptx',
    name: 'PptxReader',
    component: () => import('../views/PptxReaderView.vue')
  },
  {
    path: '/external-office',
    name: 'ExternalOffice',
    component: () => import('../views/ExternalOfficeView.vue')
  },
  {
    path: '/legacy-office',
    name: 'LegacyOffice',
    component: () => import('../views/LegacyOfficeView.vue')
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
    path: '/media',
    name: 'MediaViewer',
    component: () => import('../views/MediaViewerView.vue')
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/SettingsView.vue')
  },
  {
    path: '/release-capabilities',
    name: 'ReleaseCapabilities',
    component: () => import('../views/ReleaseCapabilitiesView.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
