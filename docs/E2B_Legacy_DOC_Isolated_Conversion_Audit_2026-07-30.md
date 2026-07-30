# E2B 旧版 DOC 隔离转换审计

日期：2026-07-30  
阶段：E2B  
结论：旧版 `.doc` 已完成真实 CFB 样本、只读风险预检、显式新目标 DOCX 隔离转换和结构复读；原生 DOC 正文阅读、编辑、创建、索引和覆盖保存继续不支持。

## 1. 已交付

- 共享格式注册新增 `legacy-doc`，统一进入主窗口右侧 `LegacyOffice` 工作面。
- 后端使用 `cfb 0.14.0` 有界解析 OLE Compound File，要求存在有效 `WordDocument` 流和 MS-DOC FIB 标识。
- 预检识别加密/混淆、VBA/宏、OLE 嵌入对象和外部链接；前三类阻断转换，外部链接只警告且不跟随。
- 用户必须显式提供知识库内尚不存在的 `.docx` 目标；源文件和已有目标永不覆盖。
- 转换使用 E2A 动态发现的 LibreOffice，输入副本、用户配置和输出目录均在独立临时目录；超时后终止进程树。
- 输出目录只允许一个固定 `source.docx`；提交前后均由 LongEdit DOCX 解析器结构复读，失败时不落盘或撤销新目标。
- 转换前、提交前和提交后复核源 SHA-256；任何漂移都会中止并删除已生成的新目标。

## 2. 真实证据

| 项目 | 文件 | 大小 | SHA-256 |
| --- | --- | ---: | --- |
| CFB DOC 输入 | `longedit-e2b-word-document.doc` | 9216 | `a1fd8332818683209e509afa14d30959526df8c807cd0a40eb43cc1c869a1c2f` |
| DOCX 转换输出 | `longedit-e2b-libreoffice-output.docx` | 5212 | `c98b9321725dba7c0d99a7f43f537dbb69781a0697f17a54a7f9a91accde92d6` |

样本由项目自有的最小 RTF 内容种子，经 LibreOffice Writer `26.2.4.2` 的独立配置导出为 `MS Word 97` 复合二进制。另一配置复开 DOC 并导出 PDF；转换使用第三配置，输出复开使用第四配置。manifest 固定文件大小、摘要、容器签名、转换器版本和源文件不变事实。

复杂 Word 16 DOCX 样本曾用于候选输入，但当前 LibreOffice 26.2 在其评论、脚注和合并表格组合转成 DOC 后复开崩溃，因此没有把该复杂样本伪装成 plain 发布基线。复杂样式、列表、表格、图片、外链、OLE、VBA 和加密样本仍属于后续兼容矩阵。

## 3. 公开能力边界

- `userCapability.level = external-open`
- `saveMode = none`
- `read/edit/create/index = unsupported`
- `reader/writer/creator/indexer = null`

界面中的“生成 DOCX 副本”是显式迁移通道，不是 DOC 原生编辑能力。转换后文件按现有 DOCX 基础编辑副本能力处理，格式和版式保真受 LibreOffice 转换器限制。

## 4. 门禁结果

- `npm.cmd run check:e2b-legacy-doc-contract`：通过。
- `npm.cmd run build`：通过。
- Rust 功能测试：`396 passed / 1 ignored`；E2B 覆盖真实 fixture、损坏/错容器、加密/VBA/OLE 阻断和 DOCX 结构正文复读。
- 产品隔离转换路径：通过，实际转换 `44.31 s`；源 DOC 字节未变化，临时目标已清理。
- PDF 100 MiB 范围读取 `953 ms`，生产依赖漏洞 `0`。
- 完整功能链通过后，既有 XLSX 性能测试在本机 CPU 平均 `99.5%`、峰值 `100%` 时失败；最佳一轮 inspect `382 ms`、page `7391 ms`、patch `6526 ms`、total `14299 ms`。没有终止其他项目进程，也没有放宽性能阈值；推送后以隔离 GitHub Runner 的 Quality Gate 作为最终判定。

跨层契约绑定格式注册、真实样本摘要/签名、隐私扫描、CFB/FIB 风险预检、动态应用发现、隔离配置、90 秒超时、Windows 进程树终止、单输出白名单、DOCX 结构复读、可靠新文件写入、失败回滚和前端显式目标。

## 5. 下一阶段

下一代码阶段为 **E2C：旧版 `.xls/.ppt` 预检与显式新副本转换试点**：

1. 分别验证 Workbook/PowerPoint Document 复合流身份，不能复用 DOC FIB 判断。
2. `.xls` 重点审计加密、VBA、公式、外链、OLE 和多 Sheet；只转换为新的 `.xlsx`。
3. `.ppt` 重点审计加密、VBA、外链、OLE、媒体和版式；只转换为新的 `.pptx`。
4. 每种格式建立独立真实 plain fixture、风险阻断 fixture、输出结构复读和源摘要不变证据。
5. E2C 收口后进入 E1C `.ods/.odp`，并行等待 E1B WPS ODT 与 X3-B6 外部生产者门禁。
