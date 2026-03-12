<p align="center">
  <img src="./bk.png" width="160" height="160" alt="胧编辑 Logo">
</p>

<h1 align="center">胧编辑 · 知识助手</h1>

<p align="center">
  <strong>一款基于 Tauri 2.0 构建的极致美学、极致性能、生产级 Markdown 知识库编辑器</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Release-v0.4.4-blue?style=flat-square" alt="Release">
  <img src="https://img.shields.io/badge/Tauri-2.0-orange?style=flat-square" alt="Tauri">
  <img src="https://img.shields.io/badge/Vue-3.0-green?style=flat-square" alt="Vue">
  <img src="https://img.shields.io/badge/License-MIT-purple?style=flat-square" alt="License">
</p>

---

## 📥 立即体验 (Download)

**智能资源管理，系统深度集成：**

*   [🚀 **Windows (.exe) 安装包**](https://github.com/Longyuyeee/Long_MarkDownReader/releases/download/v0.4.4/MistyEdit_Setup_v0.4.4.exe) - **首选推荐**，极速安装。
*   [📦 **Windows (.msi) 安装包**](https://github.com/Longyuyeee/Long_MarkDownReader/releases/download/v0.4.4/MistyEdit_v0.4.4_x64_zh-CN.msi) - 企业级部署，标准安装。

---

## ✨ 软件亮点 (Highlights)

### 🪐 极致美学设计 (Premium UI)
*   **深度图层转场**：模仿 macOS 的并行缩放浮现动效，让页面切换极具空间层次感。
*   **环境光晕背景**：动态彩色模糊光斑，随主题色调自动呼吸，营造深邃的编辑氛围。
*   **阶梯式加载**：内容项依次有序滑入，赋予软件丝滑的生命感。

### 🛡️ 数据安全与迁移 (Robust Data)
*   **自定义渲染协议**：v0.4.4 引入 `misty-img://` 专有协议，完美解决中文路径、跨盘符图片渲染问题。
*   **镜像渲染代理**：采用非侵入式 DOM 拦截技术，编辑器显示的是安全路径，源码保存的是原始相对路径。
*   **影子副本系统**：内置高频自动保存引擎，毫秒级捕捉编辑瞬间。

### 📂 多文件库管理 (Library Pro)
*   **逻辑多库支持**：支持关联无限数量的本地文件夹，并可自定义库别名。
*   **无感切换**：在设置中一键流转不同的知识库，自动处理标签页清理，保持工作区纯净。

### ⚡ 系统级生产力 (Integration)
*   **智能关联唤醒**：优化单实例通信，右键打开外部文件时，程序自动从后台唤醒并夺取焦点。
*   **100% 静默执行**：所有系统调用（注册表、自启设置）均在后台静默运行，告白控制台黑框闪烁。
*   **快速笔记小窗**：`Tray` 菜单一键呼出独立小窗，灵感捕捉后自动存入 Inbox。

---

## 📦 智能资源管理约定 (Resource Management)

为了保持知识库的极致纯净，本软件引入了 **“物理匹配 + 视图过滤”** 的资源管理方案：

### 1. 视图过滤规则
在左侧文件树侧边栏中，以下文件夹将**物理存在但自动隐藏**（不会显示在树状图中）：
*   **常用资源目录**: `public`, `assets`, `img`, `images`, `static`
*   **约定附件目录**: 任何以 `.assets` 结尾的文件夹
*   **系统隐藏目录**: 任何以 `.` 开头的文件夹

### 2. 精准导入与同步
当您将外部 `.md` 文件拖入或点击“存入知识库”时：
*   **按需搬运**: 软件会解析文档内容，**仅拷贝**引用的本地图片，拒绝冗余。
*   **自动收纳**: 粘贴图片默认存入文档同级的 `.assets` 隐藏目录。
*   **路径保留**: 保持原始相对路径结构，确保文档在 Typora/Obsidian 中依然可用。

### 3. 绿色卸载
当您在软件内**物理删除**一个 Markdown 文档时：
*   **智能清理**: 软件会自动检测并删除该文档在库内引用的本地图片（仅限位于上述隐藏资源目录下），防止垃圾堆积。

---

## 📖 快速上手 (Quick Start)

### 1. 关联知识库
启动后，点击左下角的 **设置图标**，添加您电脑上存放 Markdown 的文件夹。

### 2. 快捷键
*   `Ctrl + P`：呼出命令面板，搜索文件或切换主题。
*   `F11`：进入/退出 禅定模式 (Zen Mode)。
*   `Ctrl + \`：展开/折叠侧边栏。

---

## 🛠️ 技术底座 (Architecture)

*   **Core**: Rust + Tauri 2.0
*   **UI**: Vue 3 + TypeScript + Pinia
*   **Components**: Naive UI (Customized)
*   **Editor**: Vditor (Highly Personalized)

---

## 👤 开发作者

*   **longyuye** - *Project Architect & Lead Developer*

---

## 📄 开源协议

本项目基于 **MIT License** 协议开源。
