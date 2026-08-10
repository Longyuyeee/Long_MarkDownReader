# UX50T 外部打开与体验汇总收口审计

日期：2026-08-10
阶段：EA-5C 完成
状态：有界验收，可进入 `1.0.6` 无签名社区补丁打包

## 审计结论

- 共享格式注册表现有 43 类、91 个扩展名：29 类可直接编辑、8 类只读预览、6 类旧 Office/WPS 走显式转换或系统打开。
- 默认应用候选只覆盖 `edit` 与 `preview`，共 37 类、85 个扩展名；必须由用户在“格式能力”逐项触发，再到 Windows 页面确认。安装器仍只声明 Markdown，不会批量接管全部支持格式。
- v1.0.3 安装反馈形成的基础体验清单现完整编号为 UX-01 至 UX-41，共 41 项；代码、专项合同、真实 Tauri 证据和最新无签名安装态证据支持全部标记为“已完成”或“已完成（有界）”。
- UX-38 的 41 类历史格式、10 套体验配置和 12 个维度保持 `pending=0`；随后加入的图片与视频由独立媒体合同覆盖。
- EA-5B2B 托管运行 `31368123651` 的 22 项生命周期和 18 项安装工作区检查全部通过，原始文件及 SHA-256 清单已入库。

## 需求对齐

- 外部编辑继续遵守撤销/重做、内存草稿、显式保存、源签名冲突保护；不会因为成为默认应用候选而扩大写入白名单。
- 图片、视频、PDF、DOCX、ODS、ODP、PPTX、XLSX 只开放各自已验证的只读预览边界。
- DOCX、PPTX、XLSX 的有界能力不等于完整 Word、PowerPoint 或 Excel 等价；宏执行、复杂跨部件对象和未验证生产者结构继续阻断或只读。
- 旧 Office/WPS 六类保持显式转换或外部程序交接，不伪装成本地编辑器。
- 主题、缩放、标签、文件树、表格、图谱、脑图、代码编辑器和媒体工作区继续由既有实机证据与当前开发审计链覆盖。

## 本步实现

- 新增 `shared/ea5c-external-open-closure.json`，固定格式、候选、体验、安装证据、后续观察和版本决策。
- 新增 `check:ea5c-external-open-closure`，会重新计算格式与扩展名数量，校验 UX-01 至 UX-41 不存在未完成状态，并逐个复核 EA-5B2B 入库证据的 SHA-256。
- EA-5C 检查已接入 `check:current-development-audit`，以后格式策略、用户清单、安装证据或交接结论漂移都会让补丁质量门失败。
- `quality-gate.yml` 与 `u2-unsigned-lifecycle.yml` 升级到 `actions/setup-node@v6`；项目测试运行时仍固定 Node 22，只更新 Action 自身到 Node 24 运行时。

## 当前验证

- `check:ea5c-external-open-closure` 通过，41 项逐项证据、5 个安装证据文件哈希和格式/候选计数一致。
- 9 组从“待复测”迁移到 EA-5C 接受器的 Markdown、文本、JSON、LOG、HTML/代码和结构化编辑器合同独立通过。
- `check:current-development-audit` 通过，现行外部工作区、默认候选、格式体验和补充体验链保持成立。
- `ci:patch-release` 完整通过：Vue/Vite 生产构建处理 6225 个模块，Rust 锁定检查通过，生产依赖漏洞为 0。

## 非阻断观察

- 真实跨版本自动更新必须等 `1.0.6` Release 附件存在后，从已安装 `1.0.5` 执行一次发现、确认、校验、覆盖安装和资料保留回归；这是发布后可执行的观察，不是当前代码缺口。
- MOV、MKV、AVI、MPEG、MPG 是否应用内播放取决于 Windows/WebView2 系统解码器；合格降级是清楚提示并可交给外部播放器，不承诺所有编码都能播放。
- 安装包仍为 `NotSigned`。根据当前产品决策继续允许无签名社区补丁，但 `releaseCandidate=false`、`promotionEligible=false`，不宣称真实签名或企业候选成立。

## 下一步

进入 `1.0.6` 补丁打包阶段：统一提升 package/Cargo/Tauri/发布策略版本，全面更新 README 与 Release Notes，运行完整质量门和无签名 MSI/NSIS 构建，记录哈希后发布 GitHub Release；发布后执行 `1.0.5 -> 1.0.6` 自动更新观察。
