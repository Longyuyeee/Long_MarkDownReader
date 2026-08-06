<p align="center">
  <img src="design/brand/longedit-icon-v1.0.2.png" width="184" alt="Long编辑图标：深蓝底、实心金色 L 与金色编辑笔尖">
</p>

<h1 align="center">Long编辑</h1>

<p align="center">本地优先的 Windows 知识工作台：统一管理、阅读和编辑 Markdown、Office、PDF、表格、图表、思维导图与 Canvas。</p>

<p align="center">
  <a href="https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.4"><img src="https://img.shields.io/badge/Release-v1.0.4-cca43b" alt="Release v1.0.4"></a>
  <img src="https://img.shields.io/badge/Windows-10%20%7C%2011-2563eb" alt="Windows 10/11">
  <img src="https://img.shields.io/badge/Formats-43-0f766e" alt="43 registered formats">
  <img src="https://img.shields.io/badge/License-AGPL--3.0-7c3aed" alt="AGPL-3.0">
</p>

## 下载与安装

当前社区版为 **v1.0.4**，支持 Windows 10/11 x64：

- [下载 NSIS 安装程序](https://github.com/Longyuyeee/Long_MarkDownReader/releases/download/v1.0.4/LongEdit_1.0.4_x64-setup.exe)
- [下载 MSI 安装程序](https://github.com/Longyuyeee/Long_MarkDownReader/releases/download/v1.0.4/LongEdit_1.0.4_x64_zh-CN.msi)
- [查看 GitHub Release 与 SHA-256](https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.4)

项目当前没有 Windows Authenticode 商业证书，安装时可能出现“未知发布者”或 SmartScreen 提示。请只从官方 GitHub Release 下载，并使用 `SHA256SUMS.txt` 核对 SHA-256。

已发布的 v1.0.4 仍采用**手动下载安装**。原 Tauri 自动更新私钥在当前发布环境不可用，因此该 Release 没有 `latest.json` 或 `.sig`，现有公钥保持不变，避免伪造历史更新链。

当前主分支已实现新的受控更新链：每天自动检查或手动检查官方 GitHub Release，用户确认后下载 Windows x64 NSIS 安装器，校验 GitHub 附件 SHA-256 并覆盖安装。此能力将在下一安装包中生效；现有 v1.0.4 用户需要先完成一次手动升级。详见 [UX-47 自动更新审计](docs/UX47_Managed_Automatic_Update_Audit_2026-08-06.md)。

## v1.0.4 更新重点

- 完成安装反馈形成的 39 项体验清单：设置分类、路由返回、对话框 ACL、文件树辨识、标签页滚动、资料库上下文恢复和外部修改误报均已纳入验收。
- 重构文本、日志、代码、JSON 与结构化源文件工作区；统一显式保存、撤销/重做、主题对比度、编辑器布局和大文件降级策略。
- 改善 CSV/TSV 与工作簿布局，支持冻结前 N 列，并明确“转换为表格”的目标、保存位置和覆盖确认。
- Markdown 默认进入所见即所得模式；代码块在浅色、深色和高对比主题下保持可读。
- 完成 PDF、DOCX/ODT、PPTX/ODP、Canvas、Draw.io、Mermaid、OPML 和外部 Office 交接的有界工作区验收。
- 当前注册 43 类格式：30 类已验证、7 类有限能力、6 类依赖外部程序；UX-38 的历史收口矩阵保持 41 类基线，新增图片与视频由独立媒体审计覆盖。
- 修复安装版控制台反复弹窗、动态样式偏差、后台路由加载挂起和发布能力页预发布版本冲突。
- 隔离 Windows 环境已通过 18/18 安装生命周期、15/15 安装态功能检查和 11/11 关键路由挂载检查。

详细变更见 [v1.0.4 发布说明](docs/RELEASE_NOTES_v1.0.4.md) 与 [无签名社区发布审计](docs/V1_0_4_Unsigned_Community_Release_Audit_2026-08-06.md)。

## 核心体验

### 本地知识资料库

- 选择本地目录作为知识库，文件默认留在用户设备中。
- 文件树、最近项目、搜索、标签、集合、历史与备份集中在统一资料库外壳。
- 从搜索、图谱、关系面板、命令面板和 Canvas 打开文件时保留资料库上下文。
- 通过引用、反向链接、标签和跨格式关系连接内容，并提供本地治理入口。

### 多格式工作区

| 类型 | 主要能力 | 边界 |
| --- | --- | --- |
| Markdown / TXT / LOG | 编辑、预览、搜索、引用、显式保存 | LOG 提供查看与编辑模式 |
| JSON / YAML / XML / TOML / 代码 | 结构化查看、源码编辑、校验与大文件降级 | 保存前执行格式校验 |
| CSV / TSV | 网格编辑、冻结前 N 列、转换与导入导出 | 不承诺复杂工作簿语义 |
| XLSX / XLSM / XLSB | 多工作表、公式、样式、图表、筛选及部分高级结构 | 宏不执行，复杂对象按能力提示处理 |
| DOCX / PPTX | 阅读、受管草稿编辑与可靠副本保存 | 不宣称完整等价于 Microsoft Office |
| PDF | 阅读、批注、页面提取、合并与插入 | 非通用内容重排编辑器 |
| Mermaid / Draw.io / SVG | 图表查看、编辑或安全降级 | 按格式与安全策略执行 |
| PNG / JPEG / GIF / WebP / BMP / ICO / AVIF | 缩放、适应窗口、旋转与透明背景查看 | 只读，不修改源文件 |
| MP4 / WebM / Ogg Video / M4V | 原生播放、倍速、全屏与媒体信息 | 只读；解码能力取决于系统 WebView2 |
| OPML / JSON Canvas | 思维导图与 Canvas 工作流 | 保持结构化显式保存边界 |
| ODT / ODS / ODP 与旧 Office | 读取、旁车数据、转换或外部程序打开 | 部分能力依赖兼容桌面程序 |

### 主题与可访问性

- 核心主题：专业浅色、专业深色、高对比。
- 场景预设：长文阅读、护眼研读、编码专注、创意图谱。
- 共 19 个主题与外观组合，由统一主题注册表驱动。
- 编辑器、图表、管理页面和导出流程共享字体、颜色、焦点与状态语义。

## 使用方式

1. 安装并启动 Long编辑。
2. 选择或创建一个本地目录作为知识库。
3. 在左侧资料库中浏览、搜索或组织文件。
4. 在右侧工作区阅读或编辑；修改只在点击保存后写回文件。
5. 使用标签、集合、引用、图谱和关系面板整理内容。

| 快捷键 | 操作 |
| --- | --- |
| `Ctrl+O` | 打开外部文件 |
| `Ctrl+S` | 保存当前内容 |
| `Ctrl+Z` / `Ctrl+Shift+Z` | 撤销 / 重做 |
| `Ctrl+P` | 打开命令面板 |
| `Ctrl+F` | 在当前工作面搜索 |
| `Ctrl+,` | 打开设置 |

## 数据与安全

- 文件和知识关系默认保存在本地，不要求云端账号。
- 破坏性操作、格式降级和外部程序接管均显示明确状态或确认步骤。
- 历史副本、备份和恢复用于降低误编辑风险；重要文件仍建议保留独立备份。
- 更新私钥、签名文件和本地发布凭证不进入 Git 历史。

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

桌面安装包由 Tauri 生成。v1.0.4 的社区发布构建关闭更新附件生成，仅上传 MSI、NSIS 和 `SHA256SUMS.txt`。

## 工程结构

```text
src/                 Vue 3 前端、编辑器与知识工作区
src-tauri/           Rust/Tauri 桌面端、文件与格式命令
shared/              格式、能力、主题与发布事实合同
scripts/             自动化检查、证据采集与发布工具
docs/                审计、发布说明和开发交接文档
design/brand/        品牌图标母版
```

当前状态与后续接手顺序见 [开发对齐与收口计划](docs/Development_Alignment_and_Closure_Plan_2026-08-02.md)。

## 许可证

[GNU Affero General Public License v3.0](LICENSE)
