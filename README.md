# 胧编辑 · MD助手 (MistyEdit MDHelper)

一款基于 **Tauri 2.0** 和 **Vue 3** 打造的轻量级、极致美学、响应式本地 Markdown 知识库编辑器。

![License](https://img.shields.io/badge/License-MIT-blue.svg)
![Tauri](https://img.shields.io/badge/Tauri-2.0-orange.svg)
![Vue](https://img.shields.io/badge/Vue-3.0-green.svg)

---

## 🌟 核心特性 (Core Features)

### 1. 双模式自由切换
- **文件库模式 (Library Mode)**：支持关联多个本地文件夹，1:1 镜像同步文件结构，通过侧边栏高效管理知识库。
- **单文件模式 (Temp Mode)**：快速打开并编辑任何独立的 `.md` 文档，无需导入。

### 2. 影子副本 (Shadow Copy) 历史回溯
- **自动备份**：根据设定的间隔（默认 3 分钟）自动保存文档快照。
- **版本回滚**：右侧面板提供可视化历史气泡，支持一键预览与内容恢复，彻底告别数据丢失。

### 3. 多文件库管理系统
- **自定义命名**：为不同的项目文件夹设置直观的别名。
- **动态切换**：在设置界面一键切换活跃库，切换后自动清空旧标签页，保持工作区纯净。

### 4. 极致视觉体验 (Premium UI)
- **深度图层转场**：模仿 macOS 的并行缩放浮现动效，让页面切换极具空间感。
- **阶梯式加载**：欢迎页图标、设置面板采用 Staggered 动画，呈现有序的揭幕感。
- **环境光晕背景**：动态彩色模糊光斑，营造柔和、深邃的编辑氛围。
- **全主题同步**：支持纯白、深色、护眼绿、清爽蓝、浪漫粉五种主题，属性深度同步至系统层级。

### 5. 系统深度集成
- **托盘常驻**：支持右键菜单、左键一键呼出，具备悬停气泡提示。
- **快速笔记 (Inbox)**：独立的悬浮小窗，随手记录灵感，保存后自动同步至主库文件树。
- **右键菜单集成**：支持通过右键关联直接使用“胧编辑”打开本地 Markdown 文件。
- **命令面板**：`Ctrl + P` 唤起全能搜索与命令执行，键盘流选手的福音。

---

## 🛠️ 技术栈 (Tech Stack)

- **前端**：Vue 3 (Composition API) + TypeScript + Pinia + Naive UI
- **后端**：Rust + Tauri 2.0 (多窗口管理、文件系统底层驱动、系统原生通知)
- **编辑器**：Vditor (高度定制化，支持所见即所得、分栏预览、禅定模式)
- **打包**：Vite + Cargo (支持 MSI 与 NSIS .exe 安装包)

---

## ⌨️ 常用快捷键 (Shortcuts)

| 快捷键 | 功能描述 |
| :--- | :--- |
| `Ctrl + P` | 唤起命令面板 / 搜索文档 |
| `Ctrl + S` | 立即手动保存 |
| `F11` | 进入/退出 禅定模式 (Zen Mode) |
| `F2` | 重命名选中的文件或文件夹 |
| `Delete` | 物理删除选中的项目 |

---

## 🚀 快速开始 (Getting Started)

### 开发环境配置
1. 确保已安装 [Node.js](https://nodejs.org/) 和 [Rust](https://www.rust-lang.org/)。
2. 安装项目依赖：
   ```bash
   npm install
   ```
3. 启动开发模式：
   ```bash
   npm run tauri dev
   ```

### 生产构建打包
生成安装包前，请确保已配置图标并运行：
```bash
npm run tauri build
```
生成的 `.exe` (NSIS) 或 `.msi` 将位于 `src-tauri/target/release/bundle` 目录下。

---

## 📅 开发计划 (Milestones)

- [x] 基于 Tauri 2.0 的跨平台窗口架构。
- [x] 多主题实时切换与 Body 变量同步。
- [x] 影子副本自动保存与历史回溯 UI。
- [x] 多文件库动态添加与管理。
- [x] 跨窗口全局事件刷新 (快速笔记联动)。
- [ ] 大纲点击定位偏差修正。
- [ ] 全文搜索结果高亮联动。

---

## 👤 作者 (Author)

- **longyuye** (Project Lead & Developer)

---

## 📄 开源协议 (License)

本项目遵循 [MIT License](./LICENSE) 开源。
