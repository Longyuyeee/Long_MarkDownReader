<p align="center">
  <img src="./icon.png" width="160" height="160" alt="Long编辑 Logo">
</p>

<h1 align="center">Long编辑 · 知识助手</h1>

<p align="center">
  <strong>一款基于 Tauri 2.0 构建的极致美学、极致性能、生产级 Markdown 知识库编辑器</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Release-v0.4.9-blue?style=flat-square" alt="Release">
  <img src="https://img.shields.io/badge/Tauri-2.0-orange?style=flat-square" alt="Tauri">
  <img src="https://img.shields.io/badge/Vue-3.0-green?style=flat-square" alt="Vue">
  <img src="https://img.shields.io/badge/License-MIT-purple?style=flat-square" alt="License">
</p>

---

## 📥 立即体验 (Download)

**智能资源管理，系统深度集成：**

*   [🚀 **Windows (.exe) 安装包**](https://github.com/Longyuyeee/Long_MarkDownReader/releases/download/v0.4.9/LongEdit_Setup_v0.4.9.exe) - **首选推荐**，极速安装。
*   [📦 **Windows (.msi) 安装包**](https://github.com/Longyuyeee/Long_MarkDownReader/releases/download/v0.4.9/LongEdit_v0.4.9_x64_zh-CN.msi) - 标准 MSI 安装。

---

## 🆕 最新版本更新 (v0.4.9)

### 🔒 安全加固
*   **CSP 策略启用**: 设置 Content Security Policy 阻止 Markdown XSS 脚本注入。
*   **路径穿越修复**: 重命名操作增加非法字符校验，防止目录穿越。
*   **正则增强**: 图片引用解析预编译为 LazyLock，修正 HTML 属性误匹配。

### 🛡 数据保护
*   **切换库确认**: 切换知识库时弹出确认对话框，防止标签页意外丢失。
*   **临时编辑保护**: 离开/关闭临时编辑时提示未保存修改。
*   **标签页持久化**: 打开的文件标签页重启后自动恢复。
*   **自动保存日志**: 自动保存失败时输出错误日志而非静默吞错。

### ⚡ 性能优化
*   **按键性能**: 修复临时编辑模式每次按键都扫描图片的性能瓶颈。
*   **搜索去抖**: 命令面板文件搜索增加 200ms 去抖，避免频繁 IPC 调用。
*   **异步化**: `get_url_title` 从阻塞 HTTP 改为异步；`scan_directory` 改为异步。
*   **设置保存**: 设置页面保存增加 500ms 去抖，避免每次按键触发全量保存。

### ✨ 体验增强
*   **全屏适配**: 临时编辑模式支持 Zen 模式（F11）全屏沉浸体验。
*   **导出 HTML**: 命令面板导出 HTML 功能已接通，支持离线样式。
*   **对话框统一**: 删除文件、清空历史等操作统一使用 Naive UI 对话框。
*   **标签页指示**: 标签页增加蓝色圆点显示未保存修改状态。
*   **快捷键提示**: 命令面板显示键盘快捷键。
*   **外部变更检测**: 窗口获焦时自动检测文件是否被外部程序修改。

### 🏗 代码质量
*   **Composable 提取**: 大纲同步、图片修复、主题监听提取为公共 composable。
*   **内存泄漏修复**: Vditor 实例在组件卸载时正确销毁。
*   **全局错误边界**: Vue 异常不再导致白屏。
*   **Rust 零警告**: 消除所有 deprecation 和 dead_code 警告。

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

---

## 👤 开发作者

*   **longyuye** - *Project Architect & Lead Developer*
