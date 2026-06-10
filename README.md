<p align="center">
  <img src="./icon.png" width="160" height="160" alt="Long编辑 Logo">
</p>

<h1 align="center">Long编辑 · 知识助手</h1>

<p align="center">
  <strong>一款基于 Tauri 2.0 构建的极致美学、极致性能、生产级 Markdown 知识库编辑器</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Release-v0.5.5-blue?style=flat-square" alt="Release">
  <img src="https://img.shields.io/badge/Tauri-2.0-orange?style=flat-square" alt="Tauri">
  <img src="https://img.shields.io/badge/Vue-3.0-green?style=flat-square" alt="Vue">
  <img src="https://img.shields.io/badge/License-MIT-purple?style=flat-square" alt="License">
</p>

---

## 📥 立即体验 (Download)

**智能资源管理，系统深度集成：**

*   [🚀 **前往 GitHub 下载 v0.5.5**](https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v0.5.5) - 在发布页面选择 .exe 或 .msi 安装包。

---

## 🆕 最新版本更新 (v0.5.5)

### 🎨 界面重构
*   **图标 TAB 栏**：侧边栏切换改为图标模式，默认只显示图标，选中后文字滑出展开，极致节省空间。
*   **独立标签管理**：新增标签管理面板，支持筛选标签、一键搜索相关笔记、为当前文档添加标签。
*   **快捷入口独立**：收藏文件和最近打开记录移入独立"历史"面板。
*   **版本备份重命名**：原"历史"面板改名为"备份"，语义更清晰。

### 📋 功能增强
*   **标签搜索可用**：搜索框支持按 `#标签名` 搜索和全文关键词搜索，300ms 防抖。
*   **编辑器宽度持久化**：宽/中/窄三档宽度选择自动保存，下次启动恢复。
*   **知识图谱增强**：悬停节点高亮关联、显示文件全名；双击节点跳转文件；布局稳定后自动停止模拟，大幅减少卡顿。

### 🔧 问题修复
*   **修复打包白屏**：Vite 资源路径改为相对路径，解决 Tauri 生产模式加载失败。
*   **修复开发模式白屏**：补充 `<n-dialog-provider>`，修复 `useDialog()` 崩溃。
*   **修复文件夹点击无反应**：每日笔记创建后树状态损坏导致所有文件夹点击失效。
*   **修复 Vditor 初始化崩溃**：适配 Vditor 3.11.2 新增的 `customWysiwygToolbar` 配置。

---

## 🆕 历史版本更新 (v0.5.1)

### 🔗 知识网络
*   **双向链接 `[[wikilink]]`**：使用 `[[笔记名]]` 语法创建内部链接，自动发现反向链接。
*   **标签系统 `#tag`**：内联标签 + 标签云面板，一键筛选相关笔记。
*   **知识图谱**：交互式力导向图可视化笔记关联，支持拖拽缩放。

### ✨ 编辑器增强
*   **阅读时间估算**：底部状态栏显示字数 + 预估阅读时间。
*   **工具栏汉化**：Vditor 全部工具按钮中文提示。
*   **光标行列显示**：实时显示当前编辑位置（行:列）。
*   **宽度三档切换**：窄/中/宽三档编辑器宽度一键切换。
*   **打字机滚动**：Zen 模式下光标自动居中。
*   **主题适配**：编辑器背景色正确跟随所有配色主题。

### 📋 知识管理
*   **每日笔记**：一键创建/打开当天日期笔记。
*   **笔记模板**：会议纪要、周报、读书笔记模板。
*   **文件收藏**：右键收藏常用文件，侧边栏优先显示。
*   **最近文件**：侧边栏显示最近打开的文件列表。
*   **知识库统计**：文件总数 + 总字数实时统计。
*   **大纲自动高亮**：滚动时大纲树自动定位当前章节。

### 🔒 安全加固
*   **CSP 策略**：阻止 Markdown XSS 脚本注入。
*   **路径穿越修复**：重命名操作防目录穿越。
*   **符号链接保护**：递归目录遍历防死循环。

### ⚡ 性能优化
*   **按键性能**：TempMode 不再每次按键扫描图片。
*   **搜索去抖**：命令面板 + 文件搜索均增加防抖。
*   **异步化**：HTTP 请求、目录扫描全部异步。
*   **设置保存**：设置页面保存增加防抖。

### 🎨 体验优化
*   **标签页持久化**：重启后自动恢复打开的文件。
*   **外部变更检测**：窗口获焦时检测文件是否被其他程序修改。
*   **对话框统一**：删除/清空等操作使用 Naive UI 对话框。
*   **数据保护**：切换库/离开编辑时弹出未保存提示。
*   **命令面板升级**：模糊搜索 + 匹配高亮 + 最近文件快捷入口。

---

## ✨ 软件亮点 (Highlights)

### 🪐 极致美学设计 (Premium UI)
*   **深度图层转场**：模仿 macOS 的并行缩放浮现动效，让页面切换极具空间层次感。
*   **环境光晕背景**：动态彩色模糊光斑，随主题色调自动呼吸，营造深邃的编辑氛围。
*   **阶梯式加载**：内容项依次有序滑入，赋予软件丝滑的生命感。

---

## 🛠️ 技术底座 (Architecture)

*   **Core**: Rust + Tauri 2.0
*   **UI**: Vue 3 + TypeScript + Pinia
*   **Components**: Naive UI (Customized)
*   **Editor**: Vditor (Highly Personalized)
*   **Graph**: Canvas Force-Directed Layout

---

## 👤 开发作者

*   **longyuye** - *Project Architect & Lead Developer*
