<p align="center">
  <img src="./bk.png" width="160" height="160" alt="Long编辑 Logo">
</p>

<h1 align="center">Long编辑 · 知识助手</h1>

<p align="center">
  <strong>一款基于 Tauri 2.0 构建的极致美学、极致性能、生产级 Markdown 知识库编辑器</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Release-v0.4.5-blue?style=flat-square" alt="Release">
  <img src="https://img.shields.io/badge/Tauri-2.0-orange?style=flat-square" alt="Tauri">
  <img src="https://img.shields.io/badge/Vue-3.0-green?style=flat-square" alt="Vue">
  <img src="https://img.shields.io/badge/License-MIT-purple?style=flat-square" alt="License">
</p>

---

## 📥 立即体验 (Download)

**智能资源管理，系统深度集成：**

*   [🚀 **Windows (.exe) 安装包**](https://github.com/Longyuyeee/Long_MarkDownReader/releases/download/v0.4.5/LongEdit_Setup_v0.4.5.exe) - **首选推荐**，极速安装。
*   [📦 **Windows (.msi) 安装包**](https://github.com/Longyuyeee/Long_MarkDownReader/releases/download/v0.4.5/LongEdit_v0.4.5_x64_zh-CN.msi) - 标准 MSI 安装。

---

## 🆕 最新版本更新 (v0.4.5)

### 🎨 品牌重塑
*   **更名**: 正式从“胧编辑”变更为 **“Long编辑”**。
*   **无感迁移**: 软件启动时自动检测并迁移旧版本的配置与历史记录。

### 🖱️ 穿透式拖拽系统 (Pro 级)
*   **精准位移**: 支持在同级文件夹内通过拖拽自由改变文件顺序，持久化保存。
*   **落点感应**: 25/50/25 区域识别，支持“前插入”、“后插入”与“移入文件夹”。
*   **弹性展开**: 拖拽文件悬停在文件夹上 600ms 自动展开，无需放手。
*   **边缘滚动**: 拖拽靠近侧边栏边缘时，列表自动平滑滚动。

### ⚙️ 静默自启与唤醒
*   **后台驻留**: 优化开机自启。现在自启后静默停留于托盘，仅手动启动时显示窗口。
*   **强力唤醒**: 软件已在后台运行时，双击桌面图标能瞬间呼出并聚焦已隐藏的窗口。

---

## ✨ 软件亮点 (Highlights)

### 🪐 极致美学设计 (Premium UI)
*   **深度图层转场**：模仿 macOS 的并行缩放浮现动效，让页面切换极具空间层次感。
*   **环境光晕背景**：动态彩色模糊光斑，随主题色调自动呼吸，营造深邃的编辑氛围。
*   **阶梯式加载**：内容项依次有序滑入，赋予软件丝滑的生命感。

### 🛡️ 数据安全与迁移 (Robust Data)
*   **自定义渲染协议**：引入 `misty-img://` 专有协议，完美解决本地/中文路径图片渲染问题。
*   **影子副本系统**：内置高频自动保存引擎，毫秒级捕捉编辑瞬间。

### 📂 多文件库管理 (Library Pro)
*   **逻辑多库支持**：支持关联无限数量的本地文件夹，并可自定义库别名。
*   **无感切换**：在设置中一键流转不同的知识库，自动处理标签页清理。

---

## 📦 智能资源管理约定 (Resource Management)

为了保持知识库的极致纯净，本软件引入了 **“物理匹配 + 视图过滤”** 的资源管理方案：

### 1. 视图过滤规则
在左侧文件树侧边栏中，以下文件夹将物理存在但自动隐藏：
*   **常用资源目录**: `public`, `assets`, `img`, `images`, `static`
*   **约定附件目录**: 任何以 `.assets` 结尾的文件夹
*   **系统隐藏目录**: 任何以 `.` 开头的文件夹

### 2. 精准导入与同步
*   **按需搬运**: 解析文档内容，仅拷贝引用的本地图片，拒绝冗余。
*   **自动收纳**: 粘贴图片默认存入文档同级的 `.assets` 隐藏目录。

### 3. 绿色卸载
*   **智能清理**: 物理删除文档时，自动识别并清理仅被该文件引用的本地图片资产。

---

## 🛠️ 技术底座 (Architecture)

*   **Core**: Rust + Tauri 2.0
*   **UI**: Vue 3 + TypeScript + Pinia
*   **Components**: Naive UI (Customized)
*   **Editor**: Vditor (Highly Personalized)

---

## 👤 开发作者

*   **longyuye** - *Project Architect & Lead Developer*
