# LongEdit 开发进度复审与后续计划

> 审计日期：2026-07-28
> 审计基线：`main` / `32866e6`，叠加本次 E1B 桌面证据批次
> 同步状态：开发前本地 `main` 与 `origin/main` 一致；本批通过门禁后提交推送
> 本文定位：本次恢复开发的最新权威摘要；详细能力边界继续以专项合同和兼容矩阵为准

## 1. 总体结论

LongEdit 已完成统一文件管理、文本与开发格式工作面、JSON/JSONC 创建和结构编辑、知识图谱与 Canvas/OPML 主干、PDF 日常页面操作、DOCX/PPTX 基础编辑，以及较强的渐进式 XLSX 编辑能力。项目当前不是重新搭架构，而是在关闭基础版本最后的格式广度和发布门禁。

当前准确状态是：

- **基础版本收口尚余 7 个门禁**：E1B、E1C、E2A、E2B、E2C、E3、R。
- **E1B 已接近完成**：ODT 解析、只读工作面、搜索索引和定位代码已完成；Word、LibreOffice 真实生产者通过，WPS 因当前环境缺少可信 ODF 组件仍阻断；`.odt` 因此尚未登记。
- **2026-07-29 已完成 WPS 环境门禁加固**：隔离预检固定了 WPS `12.1.0.26895` 的 0 转换器、0 ODF 组件和 OLE 错误输出证据；fixture 生成器现在会先验证 ZIP、失败后无残留。该进展提高了门禁可靠性，但没有把 2/3 误记为完成。
- **2026-07-29 已完成当前可执行的 E1B 桌面证据**：Word/LibreOffice 在真实 Tauri 中通过正常/紧凑、专业明/暗、文内搜索、`odt-block` 精确定位和源字节不变共 8 项检查、4 张截图。E1B 现在只剩 WPS 环境、WPS fixture/桌面补录和 3/3 后的只读注册。
- **2026-07-29 已完成 WPS 关闭候选自动接入**：桌面审计支持 `checkpoint` / `closure-candidate` 双状态；未来只有 WPS fixture 与 manifest 的原生保存、原生复开、隐私净化、大小和 SHA-256 全部通过，才自动加入三生产者矩阵并追加 WPS 搜索/定位证据。
- **完整 Excel 等价编辑器仍是长期必达主线**，没有取消；当前只能宣传“XLSX 渐进式编辑（以公开兼容性矩阵为准）”。
- **新的文件格式编辑器目标已形成连续交付**：OPML、JSON/JSONC、YAML/XML/TOML、配置和代码格式已进入统一工作面；当前剩余重点是 ODF、旧版 Office 和 WPS 原生格式的分级支持。
- **更多主题预设的当前承诺已完成**：正式发布范围为 3 套核心 + 4 套场景预设，并有 12 张真实 Tauri 视觉证据；后续主题扩充属于增强项，不阻断基础版本。

## 2. 最初三项重点需求对齐

| 重点需求 | 当前状态 | 审计结论 |
|---|---|---|
| 完整 Excel 等价编辑器 | 部分完成，长期主线保留 | 已完成工作表结构、Table、筛选、命名区域、验证、条件格式、基础图表、页面设置、37 个验证函数和 Pivot 隔离重建至 S8-7E2E；单轴/多度量完整 Pivot 包、用户副本安全写回、动态数组、复杂对象、外部数据和完整生产者往返仍未完成 |
| 新的文件格式编辑器 | 主体已交付，格式广度仍在收口 | OPML、JSON/JSONC 和多类文本/配置格式已有编辑闭环；ODT 正在关闭真实生产者门禁，ODS/ODP、旧版 Office 和 WPS 原生格式尚待分级预览、外部打开或安全转换 |
| 更多主题预设 | 当前阶段完成 | 唯一注册表已有 7 套正式发布预设、WCAG AA 门禁、设置页/工作台/思维导图三档真实视觉矩阵；兼容层还保留历史组合 |

这三项需求没有互相替代。基础版本先关闭格式广度和发布可靠性，随后回到 Excel 专业等价主线；主题系统继续按实际场景扩充，但不重复立项建设第二套主题架构。

## 3. 基础版本剩余 7 个门禁

| 顺序 | 阶段 | 交付与退出条件 |
|---|---|---|
| 1 | E1B | Word/LibreOffice 桌面证据已完成；获得可信且版本匹配的 WPS ODF 组件，生成真实 ODT fixture，完成哈希、隐私、WPS 原生复开并把 WPS 补入桌面矩阵；3/3 后才登记 `.odt` 为 `preview-only` |
| 2 | E1C | 为 `.ods/.odp` 建立结构化只读预览、搜索、定位和 LibreOffice/WPS 生产者矩阵；保持原件只读 |
| 3 | E2A | 建立外部应用能力发现和统一外部打开，不依赖硬编码安装路径，并提供无可用程序时的稳定降级 |
| 4 | E2B | 先关闭 `.doc` 的用户确认隔离转换；只创建新副本，源哈希不变，转换结果通过应用内与目标程序复开 |
| 5 | E2C | 按同一安全合同分别关闭 `.xls` 与 `.ppt`；不得把转换宣传为原格式编辑或无损等价 |
| 6 | E3 | `.wps/.et/.dps` 完成真实 fixture、识别和外部打开；只有通过公开稳定转换契约时才开放转换 |
| 7 | R | 统一公开格式能力矩阵、正常/紧凑与明/暗桌面抽样、安装/关联/升级/卸载/恢复、多机器验证和 release candidate 审计 |

阶段计数按产品门禁计算。实施时 E1C、E2C、E3 可以继续拆成多个小批次，每批单独审计、提交、推送并等待 GitHub Quality Gate。

## 4. 完整 Excel 等价后续 5 个专业阶段

基础版本 R 关闭后，FR-DATA-009 继续按以下阶段推进，不把“长期目标”误写成“已完成”：

1. **X1 / S8-7E2F：Pivot 完整隔离包扩展**
   落实单轴、多度量的完整 OOXML 伪轴、标题、总计、样式和真实生产者 fixture；用户文件写回仍保持禁用。
2. **X2 / S8-7 后续：高级数据对象安全写回**
   为本地 Pivot 用户副本建立刷新、冲突、原子替换和未知扩展阻断合同；切片器、页面字段、多层轴和外部连接逐项验收。
3. **X3：计算与公式等价扩展**
   补齐动态数组、溢出、数组公式、`XMATCH`、易失重算时机、更多函数族和跨工作表依赖，并以真实工作簿验证，不只以解析成功计完成。
4. **X4：复杂对象与外部数据兼容**
   扩展高级图表/绘图、主题和轴格式、复杂条件格式、打印视觉、查询/连接和外部链接的离线安全策略及保真边界。
5. **X5 / S8-8：Excel 等价发布审计**
   使用 Excel、WPS、LibreOffice 的真实复杂工作簿矩阵验证读取、编辑、保存、重开、差异白名单、故障恢复和性能；只有公开矩阵达到目标后才重新评估“Excel 等价”表述。

“完整等价”必须由公开矩阵逐维证明，而不是由单一引擎、少量 fixture 或某个 Pivot 批次推导。

## 5. 当前立即执行项

下一开发批次只做 **E1B WPS 生产者门禁收口**：

1. 获取可信、版本匹配且可审计的 WPS ODF 组件；当前缺失组件时不得继续使用伪 OLE 输出。
2. 生成 WPS ODT fixture，记录版本、来源和 SHA-256，执行隐私扫描与 E1A/E1B 全部门禁。
3. Word/LibreOffice 的 LongEdit 真实桌面证据已完成；完成 WPS 原生复开并把 WPS 加入同一打开、搜索、定位和主题矩阵。
4. 三生产者 3/3 通过后，才更新 `shared/odt-read-contract.json` 和 `shared/file-formats.json`，登记 `.odt` 为只读预览且 `write=false`。
5. E1B 完成后进入 E1C，不提前实现 ODT 写回，也不绕过注册表直接暴露格式。

当前环境可先运行 `npm.cmd run audit:e1b-wps-odf-environment` 复核；详细证据见 [E1B WPS ODF 环境门禁加固审计](./E1B_WPS_ODF_Environment_Gate_Audit_2026-07-29.md)。

当前可执行的桌面子门禁已经关闭；证据见 [E1B ODT 桌面证据审计](./E1B_ODT_Desktop_Evidence_Audit_2026-07-29.md)。在 WPS 外部环境未变化时，不重复实现 E1B 解析、工作面或 Word/LibreOffice 证据，也不提前进入 E1C。

WPS fixture 到位后的桌面接入也已自动化，见 [E1B WPS 关闭自动化审计](./E1B_WPS_Closure_Automation_Audit_2026-07-29.md)。当前真正剩余的是外部 WPS ODF 能力本身、由该环境生成的真实 fixture，以及 3/3 证据完成后的注册审查。

## 6. 风险与审计纪律

- WPS 环境缺少可信 ODF 组件是外部环境阻断，不用伪造文件、改后缀或降低验证标准关闭门禁。
- 旧版 Office 和 WPS 原生格式优先外部打开；转换必须用户确认、写新副本、验证源摘要不变。
- `.claude/settings.local.json`、凭据、用户知识库、`dist/` 和 `src-tauri/target/` 不进入提交。
- 每个阶段结束必须同步机器契约、产品注册表、PRD、交接、专项审计和公开能力说明。
- 每次推送后等待 GitHub Quality Gate 通过，再进入下一批。

## 7. 事实证据

- [`shared/odt-read-contract.json`](../shared/odt-read-contract.json)
- [E1B ODT 生产者门禁 2/3 进展审计](./E1B_ODT_Producer_Gate_Progress_Audit_2026-07-28.md)
- [E1B WPS ODF 环境门禁加固审计](./E1B_WPS_ODF_Environment_Gate_Audit_2026-07-29.md)
- [E1B ODT 桌面证据审计](./E1B_ODT_Desktop_Evidence_Audit_2026-07-29.md)
- [E1B WPS 关闭自动化审计](./E1B_WPS_Closure_Automation_Audit_2026-07-29.md)
- [当前开发情况与后续收口计划审计](./Development_Status_and_Closure_Plan_Audit_2026-07-28.md)
- [XLSX 高级数据对象合同](./XLSX_Advanced_Data_Object_Contract.md)
- [XLSX 公开兼容性矩阵](./XLSX_Public_Compatibility_Matrix.md)
- [主题预设契约与视觉回归矩阵](./Theme_Preset_Contract_and_Visual_Matrix.md)
- [产品需求与开发路线图](./Product_Requirements_and_Development_Roadmap.md)

## 8. 2026-07-29 增量审计：E1B 发布状态机

E1B 的实现完成度和阶段计数不变，仍为生产者门禁 2/3、基础版本剩余 7 个门禁。本批完成最后一项可在 WPS 外部能力到位前预先建设的工程控制：

- 阶段合同显式声明 `releaseState=checkpoint`。
- CI 同时证明当前 2/3 检查点合法、未来 3/3 只读发布态合法。
- 提前登记 `.odt`、开放 writer、生产者/证据/合同不同步均被拒绝。
- 未来发布条目固定为 `preview-only`、`saveMode=none`、`edit/create=unsupported`、`write=false`。

下一步仍是获得可信 WPS ODT fixture 和关闭候选桌面证据；完成后原子切换到 `released-preview` 并进入 E1C。专项依据见 [`E1B_ODT_Release_State_Machine_Audit_2026-07-29.md`](./E1B_ODT_Release_State_Machine_Audit_2026-07-29.md)。
