# C0-2C LibreOffice Writer 生产者证据审计

> 审计日期：2026-07-27
>
> 阶段范围：LibreOffice Writer 真实生产者 DOCX、原生产者重开与解析回归
>
> 结论：C0-2C 已完成；C0-2 生产者矩阵达到 2/3，仅剩 WPS Writer

## 1. 真实环境

- 生产者：LibreOffice Writer
- 产品版本：`26.2.4.2`
- 文件版本：`26.2.4.2`
- 可执行程序：`C:\Program Files\LibreOffice\program\soffice.com`
- 运行方式：独立用户配置目录、headless 转换与重开

该版本由当前 Windows 开发机上的真实 LibreOffice 安装提供。仓库不提交安装包、用户配置或安装日志。

## 2. 可重复生成链

新增 `scripts/generate-c0-libreoffice-docx-fixture.ps1`：

1. 生成项目自有文字与确定性 PNG；
2. 生成 Flat ODF 源，包含标题、两项列表、表格、显式分页和内嵌图片；
3. 由 LibreOffice Writer 导出 `libreoffice-writer.docx`；
4. 只读扫描最终 OOXML，拒绝本机用户名、用户目录、临时路径和外部关系；
5. 由同一 LibreOffice 实例重新打开最终 DOCX 并导出 PDF；
6. 仅在重开 PDF 非空时生成版本、哈希、许可和结构清单。

最终 fixture 为项目自有内容，可随仓库再分发。生成器使用独立临时目录，结束后清理，不依赖生成机上的外部图片或用户配置。

## 3. 证据

- DOCX：`fixtures/docx/producers/libreoffice-writer.docx`
- 清单：`fixtures/docx/producers/libreoffice-writer.json`
- DOCX 大小：`81,767` 字节
- 原生产者重开 PDF：`65,606` 字节
- SHA-256：`a549705f8650065a1fbb7111b598b5ae509f0b387ec58db47547f7445e26dea3`
- 原生产者重开：`true`

隐私身份在 Flat ODF 源中直接设为 `LongEdit C0-2C Audit`。最终 OOXML 没有本机用户名、用户目录、临时路径或 `TargetMode="External"` 关系，因此没有对生产者输出包进行二次结构重写。

## 4. 解析与运行时判定

Rust 回归验证：

- 应用标识包含 `LibreOffice`；
- 生产者身份为 `LongEdit C0-2C Audit`；
- 标题、2 个列表项、1 个表格、显式分页和内嵌图片可恢复；
- 图片为内部可渲染部件；
- 三生产者矩阵固定为 Word/LibreOffice `verified`、WPS `pending`。

C2E0 运行时保存准备报告现在返回：

- `producerEvidence = ["microsoft-word-16", "libreoffice-writer"]`
- `missingProducerEvidence = ["wps"]`
- `producer_evidence_missing:wps`

C2E 仍保持 `blocked_readiness_only`，不返回可保存字节，不写目标文件，也不开放 UI 保存入口。

## 5. 下一步

C0-2 当前为 **2/3**。下一阶段优先完成 C0-2B WPS Writer：

1. 使用真实 WPS Writer 生成项目自有 DOCX；
2. 完成隐私扫描、WPS 原程序重开、SHA-256 和结构清单；
3. 将 `wps-writer` 从 `pending` 提升为 `verified`；
4. 完成三生产者读取与保存重开矩阵后，再进入 C2E 可靠另存闭环。

LibreOffice 证据不能替代 WPS 证据，也不代表 C2 DOCX 用户保存已经完成。

## 6. 最终仓库门禁

- DOCX 生产者矩阵：`2/3 verified`，仅 `wps-writer` pending；
- Rust 功能测试：`311/311`；
- Rust 性能测试：`1/1`；
- 真实 Tauri 桌面证据：`35/35`，27 张截图；
- 前端生产构建、Vue 类型检查、格式/主题/图谱/PDF/工作簿/XLSX 契约通过；
- 生产依赖审计：0 个漏洞；
- Tauri Debug 无打包构建成功。

构建仅保留既有的大分包体积警告，不影响本阶段验收。
