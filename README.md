<p align="center">
  <img src="design/brand/longedit-icon-v1.0.2.png" width="184" alt="Long编辑图标：深蓝底、实心金色 L 与编辑笔尖">
</p>

<h1 align="center">Long编辑</h1>

<p align="center">本地优先的 Windows 知识工作台：统一管理、阅读和编辑 Markdown、Office、PDF、表格、图表、思维导图与 Canvas。</p>

<p align="center">
  <a href="https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.2"><img src="https://img.shields.io/badge/Release-v1.0.2-cca43b" alt="Release v1.0.2"></a>
  <img src="https://img.shields.io/badge/Windows-10%20%7C%2011-2563eb" alt="Windows 10/11">
  <img src="https://img.shields.io/badge/Formats-41-0f766e" alt="41 registered formats">
  <img src="https://img.shields.io/badge/License-AGPL--3.0-7c3aed" alt="AGPL-3.0">
</p>

## 下载与安装

当前社区版为 **v1.0.2**，支持 Windows 10/11 x64：

- [下载 NSIS 安装程序](https://github.com/Longyuyeee/Long_MarkDownReader/releases/download/v1.0.2/LongEdit_1.0.2_x64-setup.exe)
- [下载 MSI 安装程序](https://github.com/Longyuyeee/Long_MarkDownReader/releases/download/v1.0.2/LongEdit_1.0.2_x64_zh-CN.msi)
- [查看 GitHub Release 与 SHA-256](https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.2)

本项目当前没有 Windows Authenticode 商业证书，安装时可能出现“未知发布者”或 SmartScreen 提示。请只从官方 GitHub Release 下载，并使用 `SHA256SUMS.txt` 核对 SHA-256。

v1.0.2 采用**手动下载安装**。由于原 Tauri 自动更新私钥在当前发布环境不可用，本版本不发布 `latest.json` 和 `.sig`，已安装版本的自动更新检查不会分发这个补丁。项目保留原公钥，避免用新密钥伪造更新连续性。

## v1.0.2 更新重点

- 全面启用新的品牌图标：放大的实心金色 `L`、金色编辑笔尖与深蓝底，应用内、Windows、macOS、iOS、Android 和 README 使用同一母版。
- 完成 P0 与 UI-1 至 UI-4 收口：受管文件统一在资料库右侧工作区打开，管理页、图谱和编辑器使用一致的导航、状态与视觉语义。
- 完成 144 张真实 Tauri WebView2 视觉证据：45 张核心壳层和 99 张主要编辑器截图，覆盖三种核心主题与 100%/125%/150% 等效缩放。
- 主题系统由唯一注册表驱动：3 个核心主题、4 个已验证场景预设，以及 12 个兼容外观组合，共 19 个可选预设。
- 修复 PDF、表格、工作簿、思维导图和 Canvas 在嵌入工作区、窄宽度与缩放场景中的裁切、溢出和路由问题。
- 版本、能力矩阵、发布页面和文档统一到 v1.0.2，同时保持复杂格式的真实能力边界。

详细变更见 [v1.0.2 发布说明](docs/RELEASE_NOTES_v1.0.2.md) 与 [发布审计](docs/V1_0_2_Unsigned_Community_Release_Audit_2026-08-03.md)。

## 核心体验

### 本地知识资料库

- 选择本地目录作为知识库，文件默认留在用户设备中。
- 文件树、最近项目、搜索、标签、集合、历史与备份集中在同一资料库壳层。
- 从搜索、图谱、关系面板、命令面板和 Canvas 打开文件时，保留资料库上下文。
- 通过引用、反向链接、标签和跨格式关系连接内容，并提供本地治理与修复入口。

### 多格式工作区

| 类型 | 主要能力 | 边界 |
| --- | --- | --- |
| Markdown / TXT | 编辑、预览、搜索、引用、导出 | 原生工作流 |
| JSON / YAML / XML / TOML | 结构化查看与编辑 | 保存前执行格式校验 |
| CSV / TSV | 网格编辑、数据处理、导入导出 | 复杂工作簿语义不适用 |
| XLSX / XLSM / XLSB | 多工作表、公式、样式、图表、筛选、部分高级结构 | 宏不执行；复杂对象按能力提示处理 |
| DOCX / PPTX | 阅读、文本与部分结构编辑、可靠副本保存 | 不宣称完整等价于 Microsoft Office |
| PDF | 阅读、批注、页面提取/合并/插入 | 非通用内容重排编辑器 |
| Mermaid / Draw.io / SVG | 图表查看、编辑或安全降级 | 按格式与安全策略执行 |
| OPML / JSON Canvas | 思维导图和 Canvas 工作流 | 保持结构化保存边界 |
| ODT / ODS / ODP 与旧 Office | 读取、转换、旁车数据或外部程序打开 | 部分能力依赖兼容桌面程序 |

能力矩阵登记 41 类格式：29 类已验证、6 类为有限能力、6 类依赖外部程序。界面会区分覆盖保存、保存副本、旁车文件、只读和外部应用打开，不把“可识别”描述为“完整等价编辑”。

### 图谱与知识治理

- 展示文件、引用、标签、集合和跨格式关系。
- 支持筛选、定位、反向链接、孤立内容识别与关系健康检查。
- 修复建议和动作队列默认在本地执行，涉及真实资料库观察时保留明确授权与回执。

### 主题与可访问性

- 核心主题：专业浅色、专业深色、高对比。
- 场景预设：长文阅读、护眼研读、编码专注、创意图谱。
- 更多外观组合继续兼容；设置页、编辑器、图表和导出逻辑共享同一主题注册表。
- 核心界面遵循最小字号、焦点可见、状态语义和对比度合同。

## 使用方式

1. 安装并启动 Long编辑。
2. 选择或创建一个本地目录作为知识库。
3. 在左侧资料库中浏览、搜索或组织文件。
4. 在右侧受管工作区阅读或编辑；复杂格式会显示当前保存和降级方式。
5. 使用标签、集合、引用、图谱和关系面板持续整理内容。

常用快捷键：

| 快捷键 | 操作 |
| --- | --- |
| `Ctrl+O` | 打开外部文件 |
| `Ctrl+S` | 保存当前内容 |
| `Ctrl+P` | 打开命令面板 |
| `Ctrl+F` | 在当前工作面搜索 |
| `Ctrl+,` | 打开设置 |

## 数据与安全

- 文件和知识关系以本地存储为默认路径，不要求云端账户。
- 破坏性操作、格式降级和外部程序接管均通过明确状态或确认步骤呈现。
- 历史副本、备份和恢复能力用于降低误编辑风险；处理重要文件前仍建议保留独立备份。
- 更新私钥、签名文件和本地发布凭据不进入 Git 历史。

## 本地开发

环境要求：Node.js、Rust stable、Windows WebView2，以及 Tauri 2 所需的 Windows 构建工具。

```powershell
npm install
npm run tauri dev
```

生产构建与补丁发布门禁：

```powershell
npm run build
npm run ci:patch-release
```

桌面安装包由 Tauri 生成。v1.0.2 的手动发布构建会关闭更新产物生成，仅上传 MSI、NSIS 和 `SHA256SUMS.txt`。

## 工程结构

```text
src/                 Vue 3 前端、编辑器与知识工作区
src-tauri/           Rust/Tauri 桌面端、文件与格式命令
shared/              格式、能力、主题与发布事实合同
scripts/             自动化检查、证据采集与发布工具
docs/                审计、发布说明和开发交接文档
design/brand/        品牌图标母版
```

当前开发状态和后续接手顺序见 [开发对齐与收口计划](docs/Development_Alignment_and_Closure_Plan_2026-08-02.md)。

## 许可证

[GNU Affero General Public License v3.0](LICENSE)
