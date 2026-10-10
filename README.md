<p align="center">
  <img src="design/brand/longedit-icon-v1.0.2.png" width="144" alt="Long编辑图标">
</p>

<h1 align="center">Long编辑</h1>

<p align="center">
  <strong>本地优先的 Windows 知识工作台</strong><br>
  在一个资料库里管理、阅读和编辑文本、表格、Office、PDF、图表、思维导图与媒体文件。
</p>

<p align="center">
  <a href="https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.25"><img src="https://img.shields.io/badge/Stable-v1.0.25-cca43b" alt="v1.0.25 stable"></a>
  <img src="https://img.shields.io/badge/Windows-10%20%7C%2011-2563eb" alt="Windows 10/11">
  <img src="https://img.shields.io/badge/Formats-43-0f766e" alt="43 registered formats">
  <img src="https://img.shields.io/badge/Local--first-Yes-16a34a" alt="Local-first">
  <img src="https://img.shields.io/badge/License-AGPL--3.0-7c3aed" alt="AGPL-3.0">
</p>

<p align="center">
  <a href="#下载">下载</a> ·
  <a href="#真实界面">真实界面</a> ·
  <a href="#核心能力">核心能力</a> ·
  <a href="#格式能力">格式能力</a> ·
  <a href="#开发与验证">开发与验证</a>
</p>

<p align="center">
  <img src="docs/images/readme/workspace-markdown-dark.png" width="100%" alt="Long编辑深色主题主工作区，包含资料库文件树、多文档标签和 Markdown 所见即所得编辑器">
</p>

> 截图来自真实安装版与多格式测试资料库。截图中的测试库名称、文件名和示例内容仅用于功能验证，不代表当前软件版本；当前公开版本以本页徽章与 Release 为准。

## 下载

当前公开稳定版为 **v1.0.25**，支持 Windows 10/11 x64。

| 安装方式 | 下载 | 适用场景 |
| --- | --- | --- |
| NSIS 安装程序 | [LongEdit_1.0.25_x64-setup.exe](https://github.com/Longyuyeee/Long_MarkDownReader/releases/download/v1.0.25/LongEdit_1.0.25_x64-setup.exe) | 推荐，大多数用户 |
| MSI 安装程序 | [LongEdit_1.0.25_x64_zh-CN.msi](https://github.com/Longyuyeee/Long_MarkDownReader/releases/download/v1.0.25/LongEdit_1.0.25_x64_zh-CN.msi) | 管理部署或 MSI 工作流 |
| 校验与说明 | [Release v1.0.25](https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.25) | Release Notes 与 SHA-256 |

社区版暂未使用 Authenticode 商业证书，Windows 可能显示“未知发布者”或 SmartScreen 提示。请只从本仓库的 GitHub Release 下载，并使用同页 `SHA256SUMS.txt` 核对文件。

```text
cc4e41d5d4bc1c2bc03dab92a1d8aaec1a1aee1fa646b5f9f3d073b5f29b4c4d  LongEdit_1.0.25_x64_zh-CN.msi
8a11ee4db407b502c9b7d2ec3837aa156b24f9c54b4d7ec3138fa79ec1fb6986  LongEdit_1.0.25_x64-setup.exe
```

应用可每 24 小时检查更新，也可在设置中手动检查；自动更新始终需要确认，并校验安装包大小与 SHA-256。v1.0.4 及更早版本需先手动安装当前版本。

## 搜索与参考

搜索资料 → 预览内容 → 固定为参考 → 选中文字并复制来源 → 粘贴到笔记。窄窗口自动改为上下布局，保持编辑区可操作。

参考展示磁盘上的部分文字，PDF 预览为提取文字；完整内容通过“打开文件”查看。返回状态和固定参考暂不跨重启保存，文件移动或改名后暂不自动修复来源链接。

## 真实界面

界面截图用于展示主要工作区；不同版本的细节可能有所差异。

### 专业编辑工作区

文件树保留完整扩展名并按类型使用不同图标；顶部标签支持多文档切换和横向滚轮导航。编辑器、状态栏与上下文工具共享一致的主题和保存状态。

<p align="center">
  <img src="docs/images/readme/json-editor-dark.png" width="100%" alt="Long编辑 JSON 专业编辑器，包含语法高亮、树形模式、解析状态和字段路径定位">
</p>

JSON、YAML、XML、TOML 与代码文件使用专业源码编辑体验。JSON 还提供虚拟化树形查看、结构诊断、字段路径定位和明确的安全编辑提示。

### 表格与工作簿

<p align="center">
  <img src="docs/images/readme/xlsx-workbook-dark.png" width="100%" alt="Long编辑 XLSX 工作簿编辑界面，包含多工作表、公式栏、页面工具和网格编辑区">
</p>

CSV、TSV 与开放 Table 提供网格、冻结前 N 列、看板、导入导出和显式转换；CSV/TSV 创建 Table 副本前会说明来源、候选目标、不覆盖策略与转换损失，完成后自动打开实际目标，源文件保持不变。XLSX 工作区提供多工作表、公式、样式、图表、筛选、页面设置、经典错误值和已有日期时间单元格的有界编辑。

### 知识图谱与思维导图

<p align="center">
  <img src="docs/images/readme/knowledge-graph-dark.png" width="100%" alt="Long编辑知识图谱，包含关系网络、节点详情、布局主题、导出和画布操作">
</p>

知识图谱把文件、标题、链接与 Canvas 节点组织成可交互网络。支持稳定后自动全图适配、搜索、筛选、多种布局与主题、框选和拖动、缩放、适应当前选择、有界且尊重减少动效设置的选择反馈、可点击/拖动/键盘操作的语义缩略导航、右键操作、中心节点、视图保存以及 SVG/PNG 导出；密集中景会主动降低普通箭头和状态环噪声，近景仍保留方向语义。

### 设置、主题与资料库

<table>
  <tr>
    <td width="50%"><img src="docs/images/readme/settings-appearance-light.png" alt="Long编辑外观设置，包含界面风格和动效节奏"></td>
    <td width="50%"><img src="docs/images/readme/settings-library-management.png" alt="Long编辑资料库管理，可切换、添加和移除资料库"></td>
  </tr>
  <tr>
    <td align="center"><sub>主题、界面风格与动效节奏</sub></td>
    <td align="center"><sub>多资料库管理与切换</sub></td>
  </tr>
</table>

设置按资料库、编辑与保存、外观、格式与文件、知识能力、系统与更新、隐私与诊断、AI 分类。主题不仅切换颜色，也统一编辑器、表格、画布、弹窗、选择器、光标和焦点状态。

## 核心能力

| 工作方向 | 已提供的体验 |
| --- | --- |
| 本地资料库 | 多资料库、文件树、全文搜索、标签、保存视图、历史、管理备份 |
| 专业编辑 | 多标签、撤销/重做、显式保存、外部修改冲突保护、语法诊断 |
| 知识组织 | 引用、反向链接、知识图谱、思维导图、JSON Canvas、关系定位 |
| 表格数据 | CSV/TSV/Table 网格与看板，XLSX/ODS 工作区和有界高级对象支持 |
| 文档与演示 | PDF 阅读与页面工具，DOCX/PPTX 阅读、受控草稿和可靠副本 |
| 图形与媒体 | Mermaid、Draw.io、SVG、图片基础编辑器，以及支持逐帧、截图、位置记忆和同名字幕的流式视频播放器 |
| 外部打开 | 支持格式使用独立顶层窗口，不占用主资料库窗口或增加内部标签 |
| 个性化 | 核心主题、场景预设、外观组合、文件颜色与图标标记 |

所有可编辑格式都遵守同一条原则：修改先保留在草稿中，只有点击保存或按 `Ctrl+S` 才写回源文件。只读、可靠副本、显式转换和外部程序交接会在界面中明确说明。

## 格式能力

当前注册 **43 类格式、91 个扩展名**，映射到 11 套发布能力配置：30 类已验证、7 类有限能力、6 类依赖外部程序。

| 格式族 | 主要能力 | 明确边界 |
| --- | --- | --- |
| Markdown / TXT / LOG | 所见即所得或源码、搜索、撤销与显式保存 | LOG 大文件优先使用专业查看模式 |
| JSON / YAML / XML / TOML / 代码 | 语法高亮、结构查看、诊断、补全与保存；大 JSON 渐进只读、分段导航和流式搜索 | HTML 预览经过净化和 sandbox；大 JSON 不构建全文树形也不写回 |
| CSV / TSV / Table | 网格、冻结列、看板、转换、导入导出 | 不承诺复杂 Excel 对象语义 |
| XLSX | 工作表、公式、样式、图表、筛选与有界类型编辑 | 仅正式注册 `.xlsx`；宏不执行，部分高级结构只读或保存可靠副本 |
| DOCX / PPTX | 阅读、受管草稿与可靠保存 | 不宣称完整等价 Microsoft Office |
| PDF | 阅读、搜索、批注和页面管理 | 不是通用内容重排编辑器 |
| Mermaid / Draw.io / SVG | 查看、编辑、画布操作与安全保存 | 外部资源和危险协议会被阻断 |
| OPML / JSON Canvas | 思维导图、卡片与关系画布；OPML 可在完整披露后生成独立 Canvas 投影 | 修改需显式保存；投影副本不与源文件自动同步 |
| 图片 | PNG、JPEG、GIF、WebP、BMP、ICO、AVIF | 查看支持光标锚定滚轮缩放、拖拽平移和双击 100%/适应窗口；PNG/JPEG/WebP/BMP 可旋转、翻转、精确裁剪、缩放、调整亮度/对比度/饱和度、转换并另存副本；GIF/ICO/AVIF 与外部图片只读 |
| 视频 | MP4、WebM、OGV、M4V 及五种系统解码入口；资料库视频支持逐帧、PNG 截图、位置记忆和同名 VTT/SRT 字幕 | MOV/MKV/AVI/MPEG/MPG 取决于系统解码器；不提供嵌入字幕拆封、字幕编辑或转码 |
| ODS / ODP / 旧 Office / WPS | ODS 支持简单值和已有命名样式的可靠副本，ODP 支持简单正文页的可靠副本；旧 Office 转换，WPS 原生格式交给外部程序 | ODS 公式与自定义样式只读；ODP 复杂对象整页阻断，备注、版式、动画及外部打开只读；`.wps/.et/.dps` 不在软件内编辑 |

格式事实源位于 [`shared/file-formats.json`](shared/file-formats.json)，发布边界位于 [`shared/release-capability-matrix.json`](shared/release-capability-matrix.json)。

## 设计原则

- **本地优先**：文档、索引和知识关系默认留在本机，不要求云端账号。
- **显式保存**：编辑不会在后台悄悄覆盖源文件，危险覆盖和格式降级需要确认。
- **能力诚实**：完整编辑、有限编辑、只读预览、可靠副本和外部依赖不会混为一谈。
- **恢复优先**：外部修改、路由错误和索引损坏提供比较、重载、隔离或重建路径。
- **用户控制**：默认应用、自动更新、外部程序接管和删除操作都由用户明确触发。
- **隐私可审计**：诊断和管理备份移除文档正文、完整路径、API Key、凭据与缓存正文。

## 主题与交互

- 3 套核心预设：专业浅色、专业深色、高对比。
- 4 套场景预设：长文阅读、护眼研读、编码专注、创意图谱。
- 19 个主题与外观组合，覆盖排版、色彩、控件形态与动效节奏。
- 紧凑工具栏保持按钮尺寸并支持横向滚轮导航，不通过挤压文字换取空间。
- 左侧导航根据可用宽度在“图标 + 文字”和纯图标之间自适应。

## 快速开始

1. 安装并启动 Long编辑。
2. 选择或创建一个本地目录作为资料库。
3. 从文件树打开文件，或通过搜索、保存视图和知识图谱定位内容。
4. 在工作区编辑；点击保存或按 `Ctrl+S` 后才写回支持编辑的源文件。
5. 在“设置 → 格式与文件 → 格式能力”中按格式管理外部打开候选。

| 快捷键 | 操作 |
| --- | --- |
| `Ctrl+O` | 打开外部文件 |
| `Ctrl+S` | 保存当前草稿 |
| `Ctrl+Z` / `Ctrl+Shift+Z` | 撤销 / 重做 |
| `Ctrl+P` | 打开命令面板 |
| `Ctrl+F` | 搜索当前工作区 |
| `Ctrl+,` | 打开设置 |

## 开发与验证

技术栈为 Vue 3、TypeScript、Tauri 2 与 Rust。开发环境需要 Node.js 22、Rust stable、Windows WebView2 和 Tauri 2 所需的 Windows 构建工具。

```powershell
npm ci
npm run tauri dev
```

发布前完整检查与无签名社区安装包构建：

```powershell
npm run ci:patch-release
npm run build:ux39-unsigned
```

```text
src/                 Vue 3 前端、编辑器与知识工作区
src-tauri/           Rust/Tauri 桌面端、文件与格式命令
shared/              格式、能力、主题与发布事实合同
scripts/             自动化检查、证据采集与发布工具
docs/                当前审计、发布说明、开发交接与历史归档
design/brand/        品牌图标母版
releases/            仍受合同引用的历史产物与旧安装包归档
```

安装包由 Tauri 生成 MSI 与 NSIS。社区发布包含两个安装器与 `SHA256SUMS.txt`；受控更新不依赖旧 Tauri 私钥，也不发布 `latest.json` 或 `.sig`。

开发状态见 [开发对齐与收口计划](docs/Development_Alignment_and_Closure_Plan_2026-08-02.md)，详细测试和历史审计保存在 `docs/`，不在首页逐项展开。

## 许可证

[GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html)

## 更新摘要

- **v1.0.25 · 已发布**：搜索定位、返回搜索恢复与带来源的参考摘录。[发布说明](docs/RELEASE_NOTES_v1.0.25.md)
- **v1.0.26 · 发布准备中**：主区打开、显式侧边参考、摘录直插与来源修复；安装包构建及验收完成前不切换下载版本。[发布进度](docs/V1_0_26_Unsigned_Community_Release_Audit_2026-10-10.md)

更多变更见 [GitHub Releases](https://github.com/Longyuyeee/Long_MarkDownReader/releases)；旧版过程记录见 [历史发布记录](docs/README_Release_History.md)。
