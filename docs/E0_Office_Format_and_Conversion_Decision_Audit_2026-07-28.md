# E0 WPS、OpenDocument 与旧版 Office 格式/转换决策审计

> 审计日期：2026-07-28
> 产品基线：LongEdit `v0.7.0`
> 代码基线：`22d81eb feat: complete JSON creation workflow` + 本批 E0 契约
> 阶段状态：E0 已完成；E1A 后续已完成，当前开发入口为 E1B ODT 只读预览与索引

## 1. 结论

E0 已完成 `.odt/.ods/.odp/.wps/.et/.dps/.doc/.xls/.ppt` 九类目标格式的规范、容器、风险、转换器、许可证、包体积、真实生产者和实施顺序审计。机器事实源为 `shared/office-compatibility-audit.json`，`npm run check:office-compatibility-audit` 固定九格式覆盖与源文件保护策略。

本批不把九种扩展名加入 `shared/file-formats.json`，也不声明任何新格式已经受支持。审计结论是：

1. OpenDocument 采用原生、有界、只读解析路线，先做包验证，再做预览与索引。
2. 旧版 Office 先提供外部打开，再试点用户明确确认的隔离转换；源文件和已有目标永不覆盖。
3. WPS 原生格式先做真实 fixture 和外部打开。没有公开稳定转换契约前，不调用安装目录中的私有 CLI。
4. 所有转换都是可选能力探测，不依赖固定安装路径，不在扫描、索引或普通打开时自动触发。
5. 转换结果是新文件，不等同于原生或等价编辑；必须重开并显示可能的保真损失。

## 2. 格式决策矩阵

| 格式 | 已确认容器/规范 | E0 决策 | 首个产品等级 | 首批实现 |
|---|---|---|---|---|
| `.odt` | ODF 1.3 ZIP/XML 包 | 原生只读解析 | 预览 + 索引 | E1A/E1B |
| `.ods` | ODF 1.3 ZIP/XML 包 | 原生只读解析 | 预览 + 索引 | E1A/E1C |
| `.odp` | ODF 1.3 ZIP/XML 包 | 原生只读解析 | 预览 + 索引 | E1A/E1C |
| `.wps` | 版本相关的 WPS 私有格式 | 真实 fixture 前禁止转换承诺 | 外部打开 | E3 |
| `.et` | 版本相关的 WPS 私有格式 | 真实 fixture 前禁止转换承诺 | 外部打开 | E3 |
| `.dps` | 版本相关的 WPS 私有格式 | 真实 fixture 前禁止转换承诺 | 外部打开 | E3 |
| `.doc` | MS-DOC / OLE CFB | 外部打开 + 隔离转换试点 | 外部打开 | E2A/E2B |
| `.xls` | MS-XLS / OLE CFB | 外部打开 + 隔离转换 | 外部打开 | E2A/E2C |
| `.ppt` | MS-PPT / OLE CFB | 外部打开 + 隔离转换 | 外部打开 | E2A/E2C |

ODF 1.3 包规范明确使用 ZIP 包、`META-INF/manifest.xml` 和根媒体类型，并定义加密与签名结构。旧版 Word、Excel、PowerPoint 则使用复杂的二进制记录和 Compound Binary File 容器，可能携带 VBA、OLE 对象、外部关系及加密内容。因此两类格式不能共享“按扩展名直接解包或直接转换”的信任模型。

## 3. 转换器与分发审计

| 候选 | 本机证据 | 许可证/分发 | 决策 |
|---|---|---|---|
| LongEdit 原生 ODF 只读层 | 已有固定版本 `zip 7.2.0`、`quick-xml 0.41.0` | 两项均为 MIT；复用现有依赖 | 选中 E1 |
| LibreOffice 26.2.4.2 | 注册表可发现；本机安装约 662.8 MiB | MPL 2.0 及组件许可证 | 仅作为用户已安装的可选转换能力试点 |
| Microsoft Office 2021 | Word/Excel/PowerPoint 注册表可发现 | 专有软件 | 只作为真实生产者和复开验证器，不作为首个无人值守转换后端 |
| WPS Office 12.1.0.26895 | 存在 `wpscli.exe`、`kwpsconvert.exe`；本机安装约 1375.6 MiB | 专有软件，未找到稳定公开转换 CLI 契约 | 产品代码禁止直接调用，等待独立资格审计 |

LibreOffice 官方参数支持 `--headless`、`--convert-to`、`--outdir` 和隔离 `UserInstallation`。E2 仍须实现注册表/显式路径发现、版本探测、独立临时目录、超时、进程树终止、输出白名单和结构复读；不得硬编码本机路径。

## 4. 安全与保真合同

### 4.1 所有格式

- 不在扫描、索引、缩略图或普通打开时自动转换。
- 转换前必须由用户选择输入、目标格式和新输出路径。
- 禁止覆盖源文件和已有目标；操作前后核对源 SHA-256。
- 不执行宏、脚本、OLE、嵌入程序或外部关系，不从文档拼接命令参数。
- 转换进程使用隔离临时副本、独立用户配置和时间/大小上限。
- 输出必须通过目标格式结构解析和 LongEdit 重开；失败产物不得进入最近记录或索引。
- 界面必须标注“转换副本”和保真风险，不得展示为原生编辑。

### 4.2 E1A ODF 包验证

- 扩展名、ZIP magic、未压缩首项 `mimetype`、根媒体类型和 manifest 必须一致。
- 限制压缩包输入大小、条目数、累计解压字节和压缩比。
- 拒绝路径穿越、绝对路径、重复标准化路径、DOCTYPE/实体声明和异常 XML 深度。
- 加密、签名、脚本/宏、外部关系和嵌入对象进入结构化风险报告，不执行或跟随。
- `content.xml` 只提取有界语义文本；预览图只能作为降级证据，不能代替内容验证。

### 4.3 E2 旧版 Office 转换

- `.doc/.xls/.ppt` 先做 OLE CFB 预检和资源预算，再允许转换。
- 首个试点选择 `.doc`，输出 `.docx` 或只读 PDF 新副本；宏、加密、OLE 和外链样本必须稳定阻断或警告。
- `.xls` 可在后续评估现有 Calamine 的只读能力，但不能由“依赖已存在”推导为产品支持。
- `.ppt` 转换需同时验证幻灯片顺序、文本、图片、备注和第三方复开。

## 5. 真实 fixture 与证据计划

每种格式至少覆盖：最小文件、日常复杂文件、外部链接、嵌入对象、加密文件；支持宏的格式增加宏样本，ODF 增加签名样本。每份 fixture 必须具有：

- 生产者、版本、生成步骤、再分发许可和隐私归一化记录。
- 固定 SHA-256、预期结构/语义和风险标签。
- LongEdit 打开/降级结果、转换前后源摘要不变。
- 产生转换副本时的 LongEdit 结构复读，以及至少一个目标第三方程序复开。

计划生产者为 LibreOffice、Microsoft Office 和 WPS。WPS 原生三格式必须由当前真实 WPS 安装直接生成，不能把 OOXML 改扩展名冒充。

## 6. 后续实施顺序

1. **E1A**：ODF 包验证器、风险报告、失败 fixture 和 Rust 契约测试；暂不登记为 `supported`。
2. **E1B**：`.odt` 段落/标题/列表/表格/图片只读预览、全文索引、定位和统一最近记录。
3. **E1C**：`.ods/.odp` 的工作表/幻灯片结构预览与索引，完成 LibreOffice/WPS 真实生产者矩阵。
4. **E2A**：外部应用能力发现与统一外部打开，不依赖固定路径。
5. **E2B**：`.doc` 隔离转换试点，验证源文件不变、输出重开和风险降级。
6. **E2C**：按试点结论扩展 `.xls/.ppt`，不默认开启。
7. **E3**：WPS 原生 fixture 门禁；先交付识别/外部打开，转换须另行通过资格审计。
8. **R**：统一发布格式矩阵与桌面抽样，关闭基础版本格式广度阻断项。

E1A 已在后续批次完成可信包边界，且没有引入 UI、索引或写回。当前唯一入口为 E1B ODT 只读预览与索引，详见 `E1A_ODF_Package_Verifier_Audit_2026-07-28.md`。

## 7. 规范与官方资料

- [OASIS OpenDocument 1.3 Part 2: Packages](https://docs.oasis-open.org/office/OpenDocument/v1.3/OpenDocument-v1.3-part2-packages.html)
- [Microsoft MS-DOC](https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-doc/ccd7b486-7881-484c-a137-51170af7cc22)
- [Microsoft MS-XLS](https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-xls/b0bd153a-9fad-456e-ac69-af652e6ef021)
- [Microsoft MS-PPT](https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-ppt/546cbcd8-473c-4425-be4e-ebbf7d4d7430)
- [Microsoft Compound Binary File](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-cfb/53989ce4-7b05-4f8d-829b-d08d6148375b)
- [LibreOffice command-line parameters](https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html)
- [LibreOffice licenses](https://www.libreoffice.org/licenses/)
- [WPS Office system requirements and compatibility](https://help.wps.com/articles/system-requirements-for-wps-office/)
