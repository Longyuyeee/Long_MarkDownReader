# C0-2A Microsoft Word 真实生产者夹具审计

> 审计日期：2026-07-27
> 阶段范围：C0-2 三类 DOCX 真实生产者矩阵的 Microsoft Word 切片
> 结论：C0-2A 已完成；C0-2 整体仍需 WPS 与 LibreOffice 两类真实生产者

## 1. 生产环境

- 应用：Microsoft Word
- COM 版本：`16.0`
- Build：`16.0.20131`
- 安装文件版本：`16.0.20131.20154`
- 应用路径：`C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE`
- OOXML 生产者声明：`Microsoft Office Word`

生成脚本：

- `scripts/generate-c0-word-docx-fixture.ps1`

版本化产物：

- `fixtures/docx/producers/microsoft-word-16.docx`
- `fixtures/docx/producers/microsoft-word-16.json`

清单保存 Word 版本、生成脚本、SHA-256、再分发说明、隐私处理记录、Word 重开结果和期望结构。

## 2. 夹具范围

夹具内容完全由项目脚本创建，不包含第三方文档或外部版权内容，覆盖：

- 一级标题和普通段落；
- 两项项目符号列表；
- 横向与纵向合并单元格；
- 显式分页与 Word 渲染分页位置；
- 横向纸张和双栏节；
- 默认页眉与页脚；
- 脚注、尾注和批注；
- 项目生成的 PNG 内嵌图片。

Word 保存后形成真实的 `styles.xml`、`numbering.xml`、批注扩展、人员、媒体和关系部件，而不是手工拼装的最小 ZIP。

## 3. 隐私与再分发

Word 默认会把本机账户显示名、批注作者、缩写和人员标识写入包内。生成脚本在 Word 完成保存后，仅对以下 XML 元数据做定向匿名化：

- `dc:creator` 与 `cp:lastModifiedBy`；
- 批注 `w:author` 与 `w:initials`；
- 人员 `w15:author` 与 `w15:userId`。

匿名化身份固定为 `LongEdit C0-2A Audit`。正文、表格、样式、编号、关系、版式、媒体和附属内容不重写。匿名化后由 Microsoft Word 再次以只读方式打开并核对标题，证明包仍可被原生产者读取。

## 4. 自动验证

Rust 回归：

- `reads_versioned_microsoft_word_producer_fixture`

验证项目：

- `Application = Microsoft Office Word`；
- 标题、列表、表格和两类合并语义；
- 显式/渲染分页、横向双栏节；
- 页眉页脚、脚注、尾注和批注；
- 图片关系与可预览媒体；
- 相关内容进入纯文本模型。

格式契约会重新计算夹具 SHA-256，并核对：

- manifest schema；
- 生产者和文件名；
- 哈希一致性；
- 隐私处理声明；
- Rust 真实生产者回归存在；
- 文件达到非空真实包体积门槛。

真实 Tauri Debug/WebView2 证据：

- 检查：`c0-word-producer-reading`
- 截图：`docs/evidence/a5-stage-a/c0-word-producer-reading.jpg`
- 总门禁：35 项检查、27 张截图

最终仓库门禁：

- `npm run ci:check`：通过，297 项功能测试与 1 项性能测试全部通过；
- `npm audit --omit=dev`：0 个生产依赖漏洞；
- `npm run tauri -- build --debug --no-bundle`：通过，Debug 桌面二进制构建成功。

## 5. 阶段判定与下一步

C0-2 当前进度为 **1/3**：

| 生产者 | 状态 |
| --- | --- |
| Microsoft Word | 已完成生成、匿名化、Word 重开、哈希和 LongEdit 解析回归 |
| WPS Writer | 当前机器未安装，待真实环境 |
| LibreOffice Writer | 当前机器未安装，待真实环境 |

下一步优先获取 WPS Writer 环境完成 C0-2B，再获取 LibreOffice Writer 环境完成 C0-2C。两类真实文件未完成前，不得宣布 C0-2 收口，也不得开放覆盖用户 DOCX 原件的写回。

若外部环境暂不可用，可以开始 C2A 的内存/临时副本 OOXML 补丁和包差异审计，但所有用户文件替换入口继续阻断。
