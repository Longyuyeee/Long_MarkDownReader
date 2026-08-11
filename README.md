<p align="center">
  <img src="design/brand/longedit-icon-v1.0.2.png" width="168" alt="Long编辑图标：深蓝底、实心金色 L 与金色编辑笔尖">
</p>

<h1 align="center">Long编辑</h1>

<p align="center">本地优先的 Windows 知识工作台，在一个资料库里管理、阅读和编辑文本、表格、Office、PDF、图表、思维导图与媒体文件。</p>

<p align="center">
  <a href="https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.7"><img src="https://img.shields.io/badge/Release-v1.0.7-cca43b" alt="Release v1.0.7"></a>
  <img src="https://img.shields.io/badge/Next-v1.0.8%20preparing-0f766e" alt="v1.0.8 preparing">
  <img src="https://img.shields.io/badge/Windows-10%20%7C%2011-2563eb" alt="Windows 10/11">
  <img src="https://img.shields.io/badge/Formats-43-0f766e" alt="43 registered formats">
  <img src="https://img.shields.io/badge/License-AGPL--3.0-7c3aed" alt="AGPL-3.0">
</p>

## 下载

当前已发布版本是 Long编辑 v1.0.7，支持 Windows 10/11 x64：

- [NSIS 安装程序](https://github.com/Longyuyeee/Long_MarkDownReader/releases/download/v1.0.7/LongEdit_1.0.7_x64-setup.exe)（推荐）
- [MSI 安装程序](https://github.com/Longyuyeee/Long_MarkDownReader/releases/download/v1.0.7/LongEdit_1.0.7_x64_zh-CN.msi)
- [Release、更新说明与 SHA-256](https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.7)

社区版暂未使用 Authenticode 商业证书，Windows 可能显示“未知发布者”或 SmartScreen 提示。请只从本仓库的 GitHub Release 下载，并使用同一页面的 `SHA256SUMS.txt` 核对文件。

v1.0.5 是受控自动更新链的首个版本。v1.0.4 及更早版本无法自动迁移，需要手动安装 v1.0.5 或 v1.0.7 一次；从 v1.0.5 开始，应用会每 24 小时检查最新稳定 Release，也可以在设置中手动检查。安装前必须由用户确认，下载的 NSIS 会使用 GitHub 附件 SHA-256 校验。

v1.0.7 的 Tag、Release 和三项远端附件已经复核。v1.0.8 的冻结源码质量门、本地 MSI/NSIS 和一次性 Windows 安装生命周期现已通过，等待候选证据的第二轮门禁后发布；新附件尚未公开，因此这里继续提供有效的 v1.0.7 下载入口。候选范围与边界见 [v1.0.8 发布说明](docs/RELEASE_NOTES_v1.0.8.md)。

## v1.0.8 更新重点

- 新建菜单覆盖 JavaScript、TypeScript、Python、Rust、Go、Java/Kotlin、C/C++/C#、Shell/PowerShell、SQL 与 HTML/CSS/Vue，共 32 个注册后缀；文件先创建草稿，只有显式保存才写入内容。
- 从资源管理器、系统默认应用或 Long编辑内部打开外部文件时，会创建独立浮动窗口，不再占用主资料库窗口或增加内部标签页。
- 37 类允许外部打开的格式统一进入各自完整编辑或预览页面；外部窗口隐藏资料库标签栏和主窗口更新提示，源文件仍遵守显式保存与冲突保护。
- 自动更新在校验官方 NSIS 的 SHA-256 后由隐藏助手安装；助手等待安装完成并检查退出码，然后自动重新打开 Long编辑。
- 真实 Tauri WebView2 已验证主资料库、外部 TXT 和外部 JSON 三窗口同时存在，主窗口路由保持不变且运行时错误为 0。
- v1.0.7 的 XLSX 类型编辑、按工作表索引、外部格式能力、主题和安全边界全部保留。

## 这是什么

Long编辑把“文件编辑器”和“本地知识库”放在同一个工作区：左侧浏览资料库、搜索和保存视图，中间打开多个文件标签，右侧按需查看文件上下文。文档内容默认留在本机，编辑只在点击保存后写回；受限格式会明确显示只读、可靠副本或外部程序边界。

### 资料库与知识组织

- 文件树显示完整扩展名，并按格式使用不同图标和识别色。
- 文件可设置本机显示标记，包括背景、文字颜色和标记图标。
- 支持搜索、标签、保存视图、引用、反向链接、知识图谱、历史与管理备份。
- 文件标签保持可读宽度；标签栏、工具栏和横向集合支持滚轮横向导航。
- 从搜索、图谱、关系界面和 Canvas 返回时保留活动文件与工作区位置。

### 编辑体验

- Markdown 默认所见即所得，也可切换即时渲染和源码模式。
- TXT、LOG、代码和结构化源码使用统一的专业编辑器主题、光标对比度、撤销/重做和显式保存。
- JSON 提供源码、虚拟化树形查看、诊断和带引导的路径定位；YAML、XML、TOML 具有结构面板与校验。
- CSV、TSV 和开放 Table 支持网格编辑、冻结前 N 列、看板、导入导出以及有明确目标的格式转换。
- XLSX 工作区支持多工作表、公式、样式、图表、筛选、经典错误值、已有日期时间单元格和部分高级对象；复杂生产者结构按能力矩阵降级，不宣称完全等价 Microsoft Excel。

### 文档、图形与媒体

- PDF：阅读、搜索、批注、页面提取、合并和插入，写入保持 sidecar 或可靠新文件边界。
- DOCX/PPTX：阅读、受控草稿编辑和可靠副本；ODT/ODS/ODP 与旧 Office 按已验证能力预览或交给桌面程序。
- Mermaid、Draw.io、SVG、OPML、JSON Canvas 和知识图谱提供专业画布、拖动、缩放、右键操作与显式保存。
- 图片支持 PNG、JPEG、GIF、WebP、BMP、ICO、AVIF，可缩放、适应窗口、旋转和查看透明网格。
- 视频支持 MP4、WebM、OGV、M4V，并按系统解码器尝试 MOV、MKV、AVI、MPEG、MPG；提供按需流式读取、前后 10 秒、循环、静音、倍速、画中画和全屏。

## 格式能力

当前注册 43 类格式、91 个扩展名，映射到 11 套发布能力配置：30 类已验证、7 类有限能力、6 类依赖外部程序。

| 格式族 | 主要能力 | 明确边界 |
| --- | --- | --- |
| Markdown / TXT / LOG | 编辑、预览、搜索、撤销与显式保存 | LOG 大文件优先使用专业查看模式 |
| JSON / YAML / XML / TOML / 代码 | 语法高亮、结构查看、诊断、补全与保存 | HTML 预览经过净化和 sandbox，不执行危险脚本 |
| CSV / TSV / Table | 网格、冻结列、看板、转换、导入导出 | 不承诺复杂 Excel 对象语义 |
| XLSX / XLSM / XLSB | 工作表、公式、样式、图表、筛选、有界类型编辑和按工作表搜索 | 宏不执行；索引不计算公式；部分高级结构只读或可靠副本 |
| DOCX / PPTX | 阅读、受管草稿与可靠保存 | 不宣称完整等价 Office |
| PDF | 阅读、批注和页面管理 | 不是通用内容重排编辑器 |
| Mermaid / Draw.io / SVG | 查看、编辑、画布操作与安全保存 | 外部资源和危险协议会被阻断 |
| OPML / JSON Canvas | 思维导图、卡片与关系画布 | 修改需显式保存 |
| 图片 | 七种常见位图格式查看 | 只读，不修改源文件 |
| 视频 | 九种容器入口与专业播放工具 | MOV/MKV/AVI/MPEG/MPG 取决于系统解码器 |
| ODF / 旧 Office / WPS | 有界预览、转换或外部程序交接 | 能力依赖文件生产者与本机软件 |

完整事实源位于 [`shared/file-formats.json`](shared/file-formats.json) 和 [`shared/release-capability-matrix.json`](shared/release-capability-matrix.json)。

## 主题与界面

- 3 套核心预设：专业浅色、专业深色、高对比。
- 4 套场景预设：长文阅读、护眼研读、编码专注、创意图谱。
- 共 19 个主题与外观组合，编辑器、表格、图表和管理页面共享颜色、排版、动效与焦点语义。
- 左侧导航会根据宽度在“图标 + 文字”和纯图标之间切换；紧凑工具栏保持按钮尺寸并使用横向滚动，不挤压正文。

## 使用

1. 安装并启动 Long编辑。
2. 选择或创建一个本地目录作为知识库。
3. 从左侧文件树打开文件，或使用搜索、保存视图和知识图谱定位内容。
4. 在工作区编辑；只有点击保存或按 `Ctrl+S` 才会写回支持编辑的源文件。
5. 遇到只读、可靠副本或外部程序格式时，按界面的能力说明操作。

| 快捷键 | 操作 |
| --- | --- |
| `Ctrl+O` | 打开外部文件 |
| `Ctrl+S` | 保存当前草稿 |
| `Ctrl+Z` / `Ctrl+Shift+Z` | 撤销 / 重做 |
| `Ctrl+P` | 打开命令面板 |
| `Ctrl+F` | 搜索当前工作区 |
| `Ctrl+,` | 打开设置 |

## 本地与安全

- 文档、索引和知识关系默认保存在本机，不要求云端账号。
- 保存命令使用文件签名或内容身份检查，发现外部变化时由用户决定比较、保留草稿或重新加载。
- 删除、覆盖、格式降级、外部程序接管和自动安装均需要明确确认。
- 管理备份与隐私诊断会移除文档正文、完整路径、API Key、凭据和缓存正文。
- 更新安装器仅接受固定 GitHub 仓库、稳定 Release、严格文件名、大小上限和 SHA-256 匹配。

## 开发与验证

需要 Node.js 22、Rust stable、Windows WebView2 和 Tauri 2 所需的 Windows 构建工具。

```powershell
npm ci
npm run tauri dev
```

```powershell
npm run ci:patch-release
npm run build:ux39-unsigned
```

安装包使用 Tauri 生成 MSI 与 NSIS。社区发布上传两个安装器和 `SHA256SUMS.txt`；受控更新不依赖旧 Tauri 私钥，也不发布 `latest.json` 或 `.sig`。

```text
src/                 Vue 3 前端、编辑器与知识工作区
src-tauri/           Rust/Tauri 桌面端、文件与格式命令
shared/              格式、能力、主题与发布事实合同
scripts/             自动化检查、证据采集与发布工具
docs/                审计、发布说明和开发交接文档
design/brand/        品牌图标母版
```

开发状态见 [收口计划](docs/Development_Alignment_and_Closure_Plan_2026-08-02.md)，当前候选记录与能力边界见 [v1.0.8 发布说明](docs/RELEASE_NOTES_v1.0.8.md)。

## 许可证

[GNU Affero General Public License v3.0](LICENSE)
