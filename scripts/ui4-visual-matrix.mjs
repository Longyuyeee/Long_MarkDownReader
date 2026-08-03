export const UI4_PHYSICAL_VIEWPORT = { width: 1280, height: 820 }

export const UI4_CORE_SCENARIOS = [
  { id: 'professional-light', name: '专业浅色', theme: 'white', style: 'minimal', codeTheme: 'github', motion: 'swift' },
  { id: 'professional-dark', name: '专业深色', theme: 'dark', style: 'minimal', codeTheme: 'tokyo-night-dark', motion: 'calm' },
  { id: 'high-contrast', name: '高对比', theme: 'contrast', style: 'sharp', codeTheme: 'github-dark', motion: 'reduced' },
]

export const UI4_DISPLAY_SCALES = [
  { id: '100', percent: 100, factor: 1 },
  { id: '125', percent: 125, factor: 1.25 },
  { id: '150', percent: 150, factor: 1.5 },
]

export const UI4_SHELL_SURFACES = [
  { id: 'library', name: '资料库', hash: '#/library', selector: '.library-mode' },
  { id: 'workspace', name: '工作台', hash: '#/workspace', selector: '.workspace-home' },
  { id: 'settings', name: '设置', hash: '#/settings', selector: '.settings-view' },
  { id: 'release-capabilities', name: '格式能力', hash: '#/release-capabilities', selector: '.release-capabilities' },
  { id: 'graph', name: '知识图谱', hash: '#/graph?mode=mindmap', selector: '.graph-container' },
]

export const ui4LogicalViewport = scale => ({
  width: Math.round(UI4_PHYSICAL_VIEWPORT.width / scale.factor),
  height: Math.round(UI4_PHYSICAL_VIEWPORT.height / scale.factor),
})
