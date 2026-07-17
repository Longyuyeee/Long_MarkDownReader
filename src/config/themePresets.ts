// 主题预设配置
// 每个预设组合了色调（theme）+ 风格（style）+ Vditor 渲染配置

export interface ThemePreset {
  id: string
  name: string
  description: string
  theme: string // 色调：white, green, blue, pink, cream, purple, amber, dark
  style: string // 风格：soft, neo, glass, airy, minimal, sharp
  vditorTheme: 'light' | 'dark' // Vditor 内容渲染主题
  vditorCodeTheme: string // 代码高亮主题
  icon?: string // 可选的图标 emoji
}

export const themePresets: ThemePreset[] = [
  {
    id: 'cloud-paper',
    name: '云白纸张',
    description: '轻盈呼吸感，适合长时间阅读',
    theme: 'white',
    style: 'airy',
    vditorTheme: 'light',
    vditorCodeTheme: 'github',
    icon: '☁️'
  },
  {
    id: 'tech-blue',
    name: '科技蓝霓虹',
    description: '未来感科技风，程序员最爱',
    theme: 'blue',
    style: 'neo',
    vditorTheme: 'light',
    vditorCodeTheme: 'atom-one-light',
    icon: '⚡'
  },
  {
    id: 'forest-green',
    name: '森林绿柔和',
    description: '护眼舒适，自然温暖',
    theme: 'green',
    style: 'soft',
    vditorTheme: 'light',
    vditorCodeTheme: 'github',
    icon: '🌿'
  },
  {
    id: 'sakura-glass',
    name: '樱粉玻璃',
    description: '现代晶透，优雅浪漫',
    theme: 'pink',
    style: 'glass',
    vditorTheme: 'light',
    vditorCodeTheme: 'github',
    icon: '🌸'
  },
  {
    id: 'minimal-bw',
    name: '极简黑白',
    description: '纯粹专注，无干扰',
    theme: 'white',
    style: 'minimal',
    vditorTheme: 'light',
    vditorCodeTheme: 'github',
    icon: '⬜'
  },
  {
    id: 'dark-neon',
    name: '暗夜绿光',
    description: '深色霓虹，编码利器',
    theme: 'dark',
    style: 'neo',
    vditorTheme: 'dark',
    vditorCodeTheme: 'native',
    icon: '🌙'
  },
  {
    id: 'sharp-business',
    name: '锐利商务',
    description: '专业严谨，商务场景',
    theme: 'white',
    style: 'sharp',
    vditorTheme: 'light',
    vditorCodeTheme: 'github',
    icon: '💼'
  },
  {
    id: 'cream-warmth',
    name: '奶油温暖',
    description: '温暖治愈，柔和舒适',
    theme: 'cream',
    style: 'soft',
    vditorTheme: 'light',
    vditorCodeTheme: 'github',
    icon: '🍦'
  },
  {
    id: 'purple-dream',
    name: '紫梦幻境',
    description: '梦幻神秘，创意灵感',
    theme: 'purple',
    style: 'glass',
    vditorTheme: 'light',
    vditorCodeTheme: 'github',
    icon: '💜'
  },
  {
    id: 'amber-vintage',
    name: '琥珀复古',
    description: '温暖复古，知识沉淀',
    theme: 'amber',
    style: 'soft',
    vditorTheme: 'light',
    vditorCodeTheme: 'github',
    icon: '📜'
  },
  {
    id: 'ocean-glass',
    name: '深海晶蓝',
    description: '清透蓝调，沉浸式整理思路',
    theme: 'blue',
    style: 'glass',
    vditorTheme: 'light',
    vditorCodeTheme: 'xcode',
    icon: '🌊'
  },
  {
    id: 'midnight-glass',
    name: '午夜星河',
    description: '深色晶透，夜间写作更专注',
    theme: 'dark',
    style: 'glass',
    vditorTheme: 'dark',
    vditorCodeTheme: 'tokyo-night-dark',
    icon: '🌌'
  },
  {
    id: 'jade-airy',
    name: '青岚留白',
    description: '自然青绿，大留白轻阅读',
    theme: 'green',
    style: 'airy',
    vditorTheme: 'light',
    vditorCodeTheme: 'github',
    icon: '🍃'
  },
  {
    id: 'rose-soft',
    name: '玫瑰晨雾',
    description: '低饱和粉调，柔和不甜腻',
    theme: 'pink',
    style: 'soft',
    vditorTheme: 'light',
    vditorCodeTheme: 'github',
    icon: '🌷'
  },
  {
    id: 'cream-airy',
    name: '燕麦纸笺',
    description: '温润纸张感，适合长文创作',
    theme: 'cream',
    style: 'airy',
    vditorTheme: 'light',
    vditorCodeTheme: 'xcode',
    icon: '🥐'
  },
  {
    id: 'violet-neon',
    name: '霓虹紫电',
    description: '高辨识紫调，灵感与科技感并存',
    theme: 'purple',
    style: 'neo',
    vditorTheme: 'light',
    vditorCodeTheme: 'atom-one-light',
    icon: '🔮'
  }
]

// 根据 theme + style 查找对应的预设
export function findPresetByThemeStyle(theme: string, style: string): ThemePreset | undefined {
  return themePresets.find(p => p.theme === theme && p.style === style)
}

// 获取预设的 Vditor 配置
export function getVditorConfigForPreset(presetId: string) {
  const preset = themePresets.find(p => p.id === presetId)
  if (!preset) return null

  return {
    theme: preset.vditorTheme,
    codeTheme: preset.vditorCodeTheme
  }
}
