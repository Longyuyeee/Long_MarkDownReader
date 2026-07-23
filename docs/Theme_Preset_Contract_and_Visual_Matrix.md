# 主题预设契约与视觉回归矩阵

更新日期：2026-07-23

## 1. 目标

主题系统必须让一个新预设只注册一次，并自动进入设置页、命令面板、Naive UI、Markdown/Vditor、知识图谱、Canvas 嵌入图和表格图表。主题不得通过单一高饱和色铺满界面；颜色只用于操作、焦点、选择、关系和数据系列。

唯一注册入口为 `src/config/themePresets.ts`。其中：

- `themeTones` 定义主题身份、模式、界面核心色、编辑器背景、预览色和图表调色板。
- `themePresets` 组合色调、视觉风格、Vditor 内容主题和代码高亮主题。
- 每个预设同时声明发布层级、使用场景和动效节奏；设置页按正式发布与兼容组合分组，命令面板仍由同一注册表生成。
- `ThemeName`、`VisualStyle`、`resolveThemeName`、`isActiveThemeDark` 和 `getActiveThemeTone` 是所有工作面的公共契约。
- `validateThemeRegistry` 在模块加载时拒绝重复、不完整、发布层级数量漂移或正文对背景/表面低于 WCAG AA 4.5:1 的正式预设；`npm run check:theme-contract` 防止重复主题清单重新进入根页面、设置页和命令面板。

## 2. 内置专业预设

| 预设 | 模式 | 视觉风格 | 用途 |
|---|---|---|---|
| 专业浅色 `professional-light` | light | minimal | 高信息密度管理、数据和日间办公 |
| 专业深色 `professional-dark` | dark | minimal | 低眩光夜间工作和长时间编辑 |
| 高对比 `high-contrast` | high-contrast | sharp | 强焦点、强边界和高可辨识场景 |
| 云白纸张 `cloud-paper` | light | airy | 低干扰长文阅读与审阅 |
| 森林绿柔和 `forest-green` | light | soft | 护眼资料研读 |
| 暗夜绿光 `dark-neon` | dark | neo | 编码与技术资料专注 |
| 紫梦幻境 `purple-dream` | light | glass | 图谱、思维导图与创意整理 |

前三套为核心预设，后四套为 T8-1 首批场景预设。其余 12 套已有组合继续显示在“更多外观组合”，但不自动升级为发布视觉矩阵承诺。历史配置继续使用原有 `theme + visualStyle + codeTheme` 字段，不需要迁移；未知旧主题会安全回退到 `system`。命令面板应用预设时走 `store.applyThemePreset`，一次性更新并持久化色调、视觉风格、代码主题、编辑器背景与动效节奏。

## 3. 工作面消费规则

| 消费者 | 必须消费的契约 | 禁止行为 |
|---|---|---|
| App / Naive UI | resolved tone、mode、surface、primary | 根组件维护第二份颜色表 |
| 设置与命令面板 | tones/presets 注册数组 | 手写主题选项或命令 |
| Markdown / Vditor | dark mode、code theme、editor background | 仅判断 `theme === dark` |
| Graph / Canvas | mode、surface、text、primary、chart palette | 导出和画布固定蓝绿色 |
| Table / Dashboard | chart palette、semantic CSS tokens | 图表组件维护固定 palette |
| PDF / Workbook / Mermaid | `--theme-*` semantic tokens | 以页面私有主题覆盖全局契约 |

## 4. 桌面视觉回归矩阵

每个候选发布版本必须在真实 Tauri WebView 中执行以下矩阵。普通浏览器缺少 Tauri IPC/事件桥，不能作为截图证据。

| 工作面 | 1440×900 | 1024×768 | 760×900 | 重点检查 |
|---|---:|---:|---:|---|
| Library / Markdown | 七个发布预设 | 七个发布预设 | 七个发布预设 | 文件树、标签、工具栏、正文、代码、选区 |
| Knowledge Graph / Mindmap | 七个发布预设 | 七个发布预设 | 七个发布预设 | 节点/边、悬停、选中、检查器、导出 |
| Canvas | 七个发布预设 | 七个发布预设 | 七个发布预设 | 卡片、端口、连线、嵌入图、属性栏 |
| PDF | 七个发布预设 | 七个发布预设 | 七个发布预设 | 工具栏、缩略图、文本层、批注、搜索 |
| Open Table / Dashboard | 七个发布预设 | 七个发布预设 | 七个发布预设 | 单元格、图表系列、图例、筛选和看板 |
| Workbook | 七个发布预设 | 七个发布预设 | 七个发布预设 | 表头、选区、合并区域、公式栏、格式栏 |
| Mermaid Studio | 七个发布预设 | 七个发布预设 | 七个发布预设 | 源码、预览、结构面板、导出面板 |
| Settings / Command Palette | 七个发布预设 | 七个发布预设 | 七个发布预设 | 分组、预设卡、焦点、弹层、提示和滚动 |

每格通过条件：正文与控件无重叠或截断；焦点可见；禁用/悬停/选中状态可区分；图表相邻系列可辨；高对比模式不依赖阴影表达层级；横向溢出只出现在数据画布等明确可滚动区域。

## 5. 自动门禁与限制

- `npm run build`：TypeScript 契约和全部消费者编译。
- `npm run check:theme-contract`：唯一注册、3 个核心 + 4 个场景预设、WCAG AA 正文对比度、分组设置、动效持久化、核心消费者和重复清单检查。
- `npm run ci:check`：将主题契约加入现有完整质量门禁。
- Tauri Debug 构建：证明注册表和桌面运行时可集成。

当前自动化不伪造 Tauri bridge，也不把普通浏览器截图标记为桌面视觉回归。S8-4D4 已在真实 Tauri Debug WebView 中完成 Workbook 四类图表专业浅色矩阵、专业深色/高对比代表场景和保存重开验证。T8-1B 已通过 WebView2 调试协议完成四套新场景预设的设置页 1440×900、工作台 1024×768 和思维导图 760×900 共 12 张证据，并将文件大小与最终 `theme/style/motion` 状态接入主题门禁。详细过程见 `T8_1B_Theme_Desktop_Visual_Audit.md`。
