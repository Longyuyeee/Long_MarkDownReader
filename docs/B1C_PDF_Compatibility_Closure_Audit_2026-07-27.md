# B1C PDF 兼容矩阵收口审计

> 审计日期：2026-07-27
> 阶段：PDF B1C
> 对齐目标：在统一管理器原有 PDF 工作面内提供可信的日常页面基础编辑，不把安全子集宣传成完整 Acrobat 等价能力

## 1. 结论

**B1C 已完成。PDF 页面基础编辑阶段现在具备“页面计划、隔离生成、兼容画像、结构/文本复读、原子无覆盖另存、应用内重开”的完整安全闭环。下一主线切换到 C0/C1：DOCX 兼容矩阵与只读工作面。**

已验证的安全子集为：

- 页面相对旋转；
- 页面改序；
- 页面排除后另存为新 PDF；
- 传统交叉引用表及交叉引用流；
- 对象流中的压缩对象；
- 非方形页面盒、CropBox 及页面树继承的 Resources/MediaBox/CropBox/Rotate；
- 图片型或扫描型无文本页面；
- PDF 1.4、1.7、2.0 和多种 Producer 标记；
- 同目录新副本、已有目标不覆盖、源 PDF 不修改。

加密、数字签名、AcroForm、Portfolio、附件以及需要迁移的目录、页码标签、Tagged PDF 和命名目标继续阻断。

## 2. 本轮发现并修复的问题

### 2.1 扫描页空文本误判

`pdf-extract` 对纯图片页可能返回缺少该页条目的数组，也可能返回空字符串。旧实现直接比较两个数组，会把结构正确的扫描型 PDF 误判为“文本页序不一致”。

新增 `normalized_pdf_page_text`，按权威页数补齐或截断文本数组。无文本页现在仍参与页序验证，同时在兼容画像中报告 `textlessPages`。

### 2.2 加密 PDF 的阻断顺序错误

未解密 PDF 可能无法枚举页面。旧流程先执行页数/计划校验，可能返回“页数必须大于零”，没有给出真实风险原因。

当前流程在页面计划校验前识别 `Document::is_encrypted()`，稳定返回：

```text
encrypted_pdf_unverified
```

不读取正文、不生成输出、不写入磁盘。

## 3. 兼容画像

`PdfPagePlanCompatibilityProfile` 随隔离验证报告返回：

| 字段 | 含义 |
| --- | --- |
| `pdfVersion` | 源 PDF 声明版本 |
| `producer` | Info 字典中的 Producer（存在时） |
| `xrefKind` | `table` 或 `stream` |
| `compressedObjects` | 来自对象流的压缩对象数 |
| `inheritedPageValues` | 页面从父页面树继承的关键属性数 |
| `textlessPages` | 无可提取文本的页面数；高风险提前阻断时为 `null` |

原 PDF 右侧“页面”面板在隔离验证通过后显示一行紧凑的“兼容矩阵”摘要。它复用原有字号、颜色和侧栏布局，不创建新窗口或另一套编辑界面。

## 4. 允许矩阵

| 场景 | 预期 | 证据 |
| --- | --- | --- |
| PDF 1.4、传统 xref、旧 Producer | 允许 | Rust 多生产者测试 |
| PDF 1.7、xref stream、object stream | 允许 | 压缩对象数大于零并完成改序/旋转/排除 |
| PDF 2.0 Producer 标记 | 允许 | 结构和文本复读 |
| 500×300 MediaBox、CropBox | 允许 | 输出页面显式物化盒属性 |
| Resources/MediaBox/CropBox/Rotate 从 Pages 继承 | 允许 | 8 项继承值被识别，输出旋转为 180° |
| 两页图片型扫描 PDF | 允许 | 两个无文本页被识别，另存和重开通过 |
| 带目录但仅做旋转 | 允许 | 页身份和顺序未变化 |

允许不代表任意高级对象保真。每次实际文件仍必须重新执行同一门禁。

## 5. 阻断矩阵

| 特性 | 阻断码 | 条件 |
| --- | --- | --- |
| 加密 | `encrypted_pdf_unverified` | 始终 |
| 数字签名或权限签名 | `digital_signature_unverified` | 始终 |
| AcroForm | `acroform_unverified` | 始终 |
| PDF Portfolio | `pdf_portfolio_unverified` | 始终 |
| EmbeddedFiles | `embedded_files_unverified` | 始终 |
| Outlines | `outline_migration_unverified` | 改序或排除 |
| PageLabels | `page_labels_migration_unverified` | 改序或排除 |
| StructTreeRoot | `tagged_structure_migration_unverified` | 改序或排除 |
| Names/Dests | `named_destinations_migration_unverified` | 改序或排除 |

自动化逐项构造真实 PDF 对象并确认：状态为 `blocked`、不产生输出、源文件字节不变。

## 6. 资源边界

- 隔离输入最大 128 MiB；
- 隔离输出最大 256 MiB；
- 页面计划最大 20,000 页；
- 应用普通 PDF 阅读仍采用 256 KiB 范围读取；
- 100 MiB 阅读基准继续要求低于 2 秒且不整文件读取；
- 可靠另存固定使用 `create_new` 与硬链接提交，不覆盖源文件或已有目标。

本轮用稀疏 128 MiB+1 文件验证输入在读取前即被阻断，并用 20,001 项计划验证页面上限。

## 7. 自动化与桌面证据

新增六组 B1C Rust 回归：

1. 现代对象流、xref stream 与多版本/多 Producer；
2. 页面树继承及非方形页面盒；
3. 扫描型无文本页的隔离生成、可靠另存和重开；
4. 八类高风险对象的稳定阻断矩阵；
5. 结构载体在“仅旋转”和“页面迁移”之间的分级；
6. 加密 PDF、128 MiB 输入和 20,000 页计划上限。

完整门禁为 **289/289 项 Rust 功能测试、1/1 项性能测试、32/32 项真实 Tauri 检查和 24 张截图**；100 MiB PDF 范围读取本轮为 59 ms、约 255.9 KiB 请求量。新增证据：

- `docs/evidence/a5-stage-a/b1c-pdf-compatibility-profile.jpg`
- `docs/evidence/a5-stage-a/audit-manifest.json`

截图确认兼容画像位于原 PDF 页面侧栏，并与页面草稿、验证和另存入口共用同一工作面。

## 8. 能力边界与阶段收口

产品可以准确声明：

> 支持安全子集内的 PDF 页面旋转、改序、排除和可靠另存，并对复杂 PDF 结构执行兼容画像与稳定风险阻断。

产品仍不能声明：

- PDF 正文排版或任意对象编辑；
- 表单填写、签名迁移、加密写回；
- 任意复杂 PDF 的全保真往返；
- Acrobat、Foxit 或专业印前工具等价。

合并、拆分、插页、页码水印和批注迁移进入 PDF 增强队列，不再阻塞用户更基础的 DOCX/PPTX 格式覆盖。

## 9. 下一开发入口

下一步按原始需求进入：

1. **C0 DOCX 兼容矩阵与 fixture 规范**：Microsoft Office、WPS Office、LibreOffice；
2. **C1 DOCX 只读工作面**：文档顺序、标题、段落、列表、表格、图片、基础样式、目录、搜索和定位；
3. **C2 DOCX 安全基础编辑**：只开放已证明可局部写回且未知部件不丢失的子集。

DOCX 仍使用“只读保真 → 基础编辑 → 高级对象阻断”的分级，不以重新生成整份文档冒充兼容。
