# E3 WPS 原生格式识别与外部打开审计

日期：2026-07-30
阶段：E3
结论：`.wps/.et/.dps` 的真实 fixture、只读容器识别、元数据工作面和统一外部打开已完成；内置正文解析、索引、转换、编辑、创建和保存继续阻断。

## 1. 本阶段交付

- 使用本机 WPS Office `12.1.0.26895` 的 `KWps.Application`、`KET.Application`、`KWPP.Application` 直接生成三份原生文件。
- fixture 在提交前完成作者、最后修改者、安装实例标识和本地用户名脱敏。
- 三份脱敏文件分别由新的 WPS 自动化实例只读复开并恢复固定文本、单元格和值、幻灯片标题。
- 共享格式注册表新增 `wps-document`、`wps-spreadsheet`、`wps-presentation`，统一进入主窗口右侧 `ExternalOffice` 工作面。
- 后端在工作区边界内验证扩展名和容器，显示大小、修改时间、SHA-256，并以识别前后字节一致证明没有写入源文件。
- E2A 的系统默认/指定应用外部打开入口直接复用；后端仍只接受应用 ID，不接受任意可执行路径。

## 2. 真实 fixture

| 格式 | 自动化身份 | 实际容器 | 大小 | SHA-256 |
| --- | --- | --- | ---: | --- |
| `.wps` | `KWps.Application` | WPS 文字 OOXML 包 | 9922 | `C7F83B162475BFD92E48AF666314F4F3550254C40F77C055BA13F35BD5883233` |
| `.et` | `KET.Application` | WPS 表格 OOXML 包 | 9329 | `5DC3AB1C721F9FCC5CCACA710A876B93AE3AD0726795699C2EA6D1137479B179` |
| `.dps` | `KWPP.Application` | WPS 演示复合二进制 | 126464 | `1C5E358ABB56B1AF8CCC14506A9CC83D75BE5C183D75C87579D23EFFE1EC6809` |

固定 manifest 位于 `src-tauri/tests/fixtures/wps-native/manifest.json`。生成器只允许写入该固定目录，并在生成、脱敏后执行独立 WPS 复开；fixture 不能用 OOXML 文件改扩展名替代。

## 3. 公开能力边界

三种格式均固定为：

- `userCapability.level = external-open`
- `saveMode = none`
- `read/edit/create/index = unsupported`
- `reader/writer/creator/indexer = null`

“识别”只表示 LongEdit 能确认当前已验证的 WPS 容器身份并显示文件元数据。它不表示能解析用户正文、工作表或幻灯片，也不表示已获得可靠转换资格。加密、宏、外链、嵌入对象和复杂内容仍由外部应用负责。

## 4. 安全与失败行为

- 路径必须由 `WorkspaceGuard` 证明位于当前知识库内。
- 扩展名必须由共享格式注册表证明为 `.wps/.et/.dps`。
- `.wps/.et` 必须是 ZIP/OOXML 包，并分别包含 `word/document.xml` 或 `xl/workbook.xml`。
- `.dps` 必须具有复合二进制签名。
- 扩展名和容器错配会被识别命令拒绝，但用户仍可从统一外部打开入口交给兼容应用自行处理。
- 识别不生成副本、不执行嵌入内容、不跟随外链、不修改源文件。

## 5. 自动化门禁

- `npm run check:e3-wps-native-contract`
- `npm run check:format-contract`
- Rust 真实 fixture 容器识别、错配拒绝、源字节不变和格式注册能力测试
- 生产前端构建与完整 `ci:check`

机器契约绑定格式注册、真实 fixture 文件名/大小/哈希/容器、三个 WPS COM 身份、直接 `SaveAs`、元数据脱敏、独立复开、后端命令注册和右侧能力工作面。任何能力升级必须另开阶段并补充复杂风险 fixture 与转换复开证据。

本地结果：

- E3 契约、统一格式契约和生产构建通过。
- Rust 功能测试 `391 passed`，包含 3 项 E3 针对性测试。
- PDF 100 MiB 范围读取 `144 ms`，生产依赖漏洞 `0`。
- 完整功能链通过后，既有 XLSX 性能测试在共享机器持续 `100%` CPU 时失败：两次总耗时约 `18.8 s`，页面阶段约 `8.4～8.8 s`。未终止其他项目进程，也未放宽性能阈值；提交后以隔离 GitHub Runner 的 Quality Gate 作为发布判定。

## 6. 下一阶段

下一代码阶段进入 **E2B：旧版 `.doc` 隔离转换试点**。先完成 OLE 复合二进制预检、宏/外链/嵌入对象风险报告、源 SHA-256 不变、显式新副本转换和目标 DOCX 结构复读；不覆盖原件或已有目标。E2B 证明流程可靠后再进入 E2C 的 `.xls/.ppt`，随后完成 E1C `.ods/.odp`。
