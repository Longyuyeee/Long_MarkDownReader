# E2C 旧版 XLS/PPT 隔离转换审计

日期：2026-07-30  
阶段：E2C  
结论：旧版 `.xls/.ppt` 已完成真实 CFB 样本、独立格式身份与风险预检、显式新目标隔离转换和现代格式结构复读；原生旧格式正文阅读、编辑、创建、索引和覆盖保存继续不支持。

## 1. 已交付

- 共享格式注册新增 `legacy-xls` 与 `legacy-ppt`，统一进入主窗口右侧 `LegacyOffice` 工作面。
- XLS 预检要求 `Workbook/Book` 身份流和有效 BIFF 记录序列，识别 `FILEPASS` 加密、公式记录、外部工作簿和 Sheet 数量。
- PPT 预检要求 `PowerPoint Document` 身份流和有效记录头；两种格式共同阻断加密、VBA/宏与 OLE 嵌入对象，并警告外链、公式、媒体和转换保真。
- 用户必须显式提供知识库内尚不存在的 `.xlsx/.pptx` 目标；源文件和已有目标永不覆盖。
- 转换复用 E2B 已审计的隔离工作区、独立 LibreOffice 用户配置、90 秒超时、Windows 进程树终止和单输出白名单。
- XLSX 输出由现有工作簿 OOXML 验证器复读，PPTX 输出由现有演示解析器复读；可靠落盘后再次复读，失败撤销新目标。
- 转换前、提交前和提交后均复核源 SHA-256，源摘要漂移会阻止或撤销输出。

## 2. 真实证据

| 项目 | 文件 | 大小 | SHA-256 |
| --- | --- | ---: | --- |
| CFB XLS 输入 | `longedit-e2c-spreadsheet.xls` | 5632 | `5ce66eab601c51be70227aa75595bdfb47027ebff477cf46cda71a368dcb50b6` |
| XLSX 转换输出 | `longedit-e2c-spreadsheet-output.xlsx` | 5702 | `4945e236580b4fc63a8e74b81c85745f6124ee362692f0b8fd817a5b6bb380a2` |
| CFB PPT 输入 | `longedit-e2c-presentation.ppt` | 459264 | `45bdbefcaa38e795a0a7d6875dcf312bcb0eceb1d0fe2a10b54f546f8917ef7c` |
| PPTX 转换输出 | `longedit-e2c-presentation-output.pptx` | 9053 | `d807ceba192b337cc5331b54f36f4a80878f89678a047a8ad628e398c5a5b1bb` |

样本由项目自有 FODS/FODP 种子经 LibreOffice Calc/Impress `26.2.4.2` 的独立配置导出为 Excel 97 和 PowerPoint 97 复合二进制。转换输入使用隔离副本和新配置，现代输出再由另一配置独立重开为 PDF。manifest 固定文件大小、摘要、容器签名、转换器版本、源文件不变和隐私边界。

## 3. 公开能力边界

- `userCapability.level = external-open`
- `saveMode = none`
- `read/edit/create/index = unsupported`
- `reader/writer/creator/indexer = null`

界面中的“生成 XLSX/PPTX 副本”是显式迁移通道，不是 XLS/PPT 原生编辑能力。公式结果、外部链接、媒体、动画和复杂版式可能受 LibreOffice 转换器限制。

## 4. 门禁结果

- `npm.cmd run check:e2c-legacy-binary-office-contract`：通过。
- `npm.cmd run build`：通过。
- E2C Rust 定向测试：`5 passed / 1 ignored`，覆盖真实 fixture、错格式/损坏身份流、加密/VBA/OLE 阻断、公式/外链信号和现代输出复读。
- 产品隔离转换路径：`1 passed`，实际连续转换 XLS 与 PPT 约 `110.06 s`；源文件字节未变化，临时目标已清理。
- 共享注册表测试：通过，大小写混合的 `.XLS/.PPT` 均路由到对应旧版格式。
- 完整门禁的前端、契约/证据检查和 Rust 功能测试通过：`401 passed / 2 ignored`。
- PDF 100 MiB 范围读取 `533 ms`，生产依赖漏洞 `0`。
- 既有 XLSX 性能门在当前共享高负载机器上失败；最佳一轮 inspect `414 ms`、page `6099 ms`、patch `6428 ms`、total `12942 ms`，失败项为 patch。没有终止其他项目进程或放宽阈值，推送后由隔离 GitHub Runner 复验。

跨层契约绑定格式注册、兼容审计状态、真实样本摘要/签名、隐私扫描、CFB/BIFF/PPT 风险预检、隔离配置、超时、单输出白名单、XLSX/PPTX 结构复读、可靠新文件写入、失败回滚和前端显式目标。

## 5. 下一阶段

下一代码阶段为 **E1C：`.ods/.odp` 原生只读结构预览、搜索与索引**：

1. 复用 E1A ODF 包验证器，分别验证 Spreadsheet/Presentation MIME 与结构身份。
2. ODS 提取工作表、单元格文本、公式显示值与基础样式；不实现计算或写回。
3. ODP 提取幻灯片顺序、文本、备注、图片与基础对象；不实现放映等价或写回。
4. 接入原 Library 右侧工作面、搜索段、索引生命周期、定位和源摘要不变证据。
5. 建立 LibreOffice 与其他可信生产者样本矩阵；E1B WPS ODT 2/3 继续作为独立外部门禁，不阻塞 E1C 本地开发。
