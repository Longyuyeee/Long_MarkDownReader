# 胧编辑 · MD助手 (MistyEdit MDHelper)

一款基于 Tauri 2.0 和 Vue 3 打造的轻量级、极致美学的本地 Markdown 知识库编辑器。

## 📥 下载安装 (Download)

**推荐使用 NSIS 安装包 (推荐):**
你可以直接在 `releases` 目录下找到打包好的可执行文件进行安装。
* [下载 MDReader_Setup.exe](./releases/MDReader_Setup.exe) (推荐)

> **注:** 由于环境依赖原因，MSI 安装包暂时无法生成，推荐使用上述 EXE 安装包。

## ✨ 核心特性 (Features)

- **极简美学设计**: 仿 Apple 风格的毛玻璃效果，极致的视觉体验。
- **双模式架构**: 
  - **知识库模式 (Library Mode)**: 类似 Obsidian 的本地物理文件夹 1:1 镜像同步。
  - **单文件模式 (Temp Mode)**: 快速打开和编辑独立的 `.md` 文件。
- **极致的写作体验**: 支持禅定模式 (F11)，药丸型悬浮工具栏。
- **本地化与安全**: Vditor 核心已完全本地化，数据全部保留在本地，支持快速保存和导出。
- **系统深度集成**: 单实例运行、系统托盘快速笔记、右键菜单集成等。

## 🛠️ 开发指南 (Development Setup)

### 环境要求
- Node.js (v18+)
- Rust & Cargo
- Visual Studio Build Tools (Windows)

### 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm run tauri dev

# 3. 构建发布版本
npm run tauri build --bundles nsis
```

## 📝 推荐 IDE 配置
- [VS Code](https://code.visualstudio.com/) 
- [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar)
- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) 
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
