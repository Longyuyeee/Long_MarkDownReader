# Long Markdown Reader 开发交接

> **2026-08-27 M1 总退出审计已通过：** 当前代码重新完成 XLSX 对象草稿、PPTX 统一草稿、ODS + LibreOffice、大 JSON、1080p/4K 逐帧截图和 VTT/SRT 字幕六条真实桌面复验；DOCX 继续以 Word/WPS/LibreOffice 3 个生产者、9 个来源组合、9/9 稳定复开为外部证据。复验发现 PPTX 脚本覆盖 E2E 二进制导致 ODS 60 秒无 CDP 的真实差异，已修正 `-SkipBuild` 和 E2E 配置传递后重跑通过。格式矩阵、README 和 `1.0.16` 开发说明已补齐，M1 在有界范围收口。下一步固定为 **M3 知识图谱 2.0 选择审计**；先测 100/1000/5000 节点语义、算法和性能基线，不直接堆视觉效果。详见 [`Post_v1.0.15_M1_Total_Exit_Criteria_Audit_2026-08-27.md`](./Post_v1.0.15_M1_Total_Exit_Criteria_Audit_2026-08-27.md)。

> **2026-08-27 M1D-C1 外置字幕播放已通过：** 资料库视频会发现同目录同名 VTT/SRT，经过 2 MiB / 10,000 cue 有界解析后以内存 `TextTrack` 播放；真实 1280×720 WebM 在 0.6s/1.6s 分别显示指定 VTT/SRT cue，关闭、跨 TXT 重开、损坏 VTT 拒绝、960×720 布局和全部源 SHA-256 均通过，运行时错误 0。真实测试淘汰了 WebView2 中 cue 始终为 0 的 Blob `<track>` 路径，最终使用 `addTextTrack()` / `VTTCue`。下一步只做 M1 总退出条件审计。详见 [`Post_v1.0.15_M1DC1_Subtitle_Sidecar_Playback_Audit_2026-08-27.md`](./Post_v1.0.15_M1DC1_Subtitle_Sidecar_Playback_Audit_2026-08-27.md)。

> **2026-08-27 M1D-C 字幕与 Schema 对象选择审计已通过：** 真实 1280×720 WebM 可正常解码，但同名有效 VTT/SRT 均未被发现，`textTracks=0` 且没有字幕入口；语法合法但违反同一业务类型约束的 YAML/XML/TOML 均显示有效、0 条诊断。全部临时源 SHA-256 不变，运行时错误和页面溢出均为 0。下一步只做 M1D-C1 资料库视频的 VTT/SRT sidecar 播放与轨道开关；嵌入字幕拆封、字幕编辑、转码和 Schema provider 映射继续关闭。详见 [`Post_v1.0.15_M1DC_Subtitle_and_Schema_Selection_Audit_2026-08-27.md`](./Post_v1.0.15_M1DC_Subtitle_and_Schema_Selection_Audit_2026-08-27.md)。

> **2026-08-27 M1D-B 视频逐帧、截图与位置记忆已通过：** 真实 WebView2 生成并打开 1080p/4K 视频，30 fps 前后逐帧误差均在门禁内；当前帧可靠另存为 1920×1080 / 3840×2160 PNG，已有目标拒绝覆盖，源 SHA-256 不变。两段视频均从 1.2 秒准确恢复，localStorage 不含路径，1280×720/960×720 横向溢出 0、运行时错误 0。真实测试还发现并修复 Tauri 资产视频 Canvas 跨源污染。下一步进入 M1D-C 字幕与结构化格式对象选择审计，版本仍保持运行时/公开 `1.0.15`、开发目标 `1.0.16`。详见 [`Post_v1.0.15_M1DB_Video_Frame_Tools_Audit_2026-08-27.md`](./Post_v1.0.15_M1DB_Video_Frame_Tools_Audit_2026-08-27.md)。

> **2026-08-27 M1D-A 大 JSON 渐进读取与流式搜索已通过：** 真实 10/50 MiB JSON 分别在 201/177 ms 显示 512 KiB 首段，尾部标记全文件搜索分别为 801/3,300 ms，双向分段导航为 121–124 ms；小 JSON 仍在 766 ms 完成完整分析并显示 9 个树形节点。1280×720/960×720 横向溢出 0，运行时错误 0，所有源 SHA-256 不变。大文件保存、完整树形和结构编辑保持关闭。下一步进入 M1D-B 视频逐帧、截图和播放位置记忆，版本仍保持运行时/公开 `1.0.15`、开发目标 `1.0.16`。详见 [`Post_v1.0.15_M1DA_Large_JSON_Progressive_Audit_2026-08-27.md`](./Post_v1.0.15_M1DA_Large_JSON_Progressive_Audit_2026-08-27.md)。

> **2026-08-27 M1C-D ODS 已有命名样式编辑已通过，M1C 收口：** 真实 ODS `Overview!A1` 可在文件已有安全命名样式间切换，具有即时预览、撤销/重做、离开保护和可靠新副本；保存前后源 SHA-256 完全相同。真实 Tauri 960x720 重开副本仍为 `Good`，运行时错误 0；LibreOffice Calc 独立确认浅绿填充 `FFCCFFCC` 和深绿文字 `FF006600`。公式、自定义样式、混合值/样式事务、源覆盖、外部 ODS 与 ODP 继续关闭。下一步进入 M1D 媒体与结构化文本对象选择审计，版本保持 `1.0.15`，`releaseCandidate=false`。详见 [`Post_v1.0.15_M1CD_ODS_Existing_Named_Style_Audit_2026-08-27.md`](./Post_v1.0.15_M1CD_ODS_Existing_Named_Style_Audit_2026-08-27.md)。

> **2026-08-27 M1C-C ODS 公式与样式可行性审计已通过：** Long编辑生产补丁把真实 ODS `Overview!A2` 改为 `84.5` 后，公式仍为 `of:=SUM([.A2];8)` 且内部缓存仍为 `50`；LibreOffice Calc 独立打开后重算为 `92.5`，因此公式编辑继续只读。真实样本含 19 个单元格样式，规范 Flat ODF 探针证明 `ce 自动样式 -> Good -> Status -> Default` 可由生产者保持，并导出浅绿 `FFCCFFCC` / 深绿 `FF006600`；但现有 ODS ZIP 事务尚未证明，公开能力不变。下一步 M1C-D 只研究已有命名样式的自动样式引用与可靠副本。版本保持 `1.0.15`，`releaseCandidate=false`。详见 [`Post_v1.0.15_M1CC_ODS_Formula_and_Style_Feasibility_Audit_2026-08-27.md`](./Post_v1.0.15_M1CC_ODS_Formula_and_Style_Feasibility_Audit_2026-08-27.md)。

> **2026-08-27 M1C-B ODS 有界单元格值可靠副本已通过：** 资料库内真实 ODS 的简单字符串/有限数值单元格现可双击编辑，具有内存草稿、撤销/重做、离开保护和显式另存；公式、合并、重复、富文本、风险包、外部 ODS 与全部 ODP 继续只读。真实 Tauri 将 `Overview!A1` 改为 `LongEdit M1C-B desktop value`，新副本由 Long编辑和 LibreOffice Calc 独立复读一致，960x720 无溢出、运行时错误 0；源 SHA-256 前后完全相同。公开能力仅更新为 ODS `basic-edit / saveMode:copy`，不宣称等价编辑。下一步 M1C-C 先审计公式命名空间、缓存值和样式继承，不直接开放写入。版本保持 `1.0.15`，`releaseCandidate=false`。详见 [`Post_v1.0.15_M1CB_ODS_Bounded_Cell_Value_Audit_2026-08-27.md`](./Post_v1.0.15_M1CB_ODS_Bounded_Cell_Value_Audit_2026-08-27.md)。

> **2026-08-27 M1C-A ODF 编辑可行性基线已通过：** 新增内存隔离 ODF 包审计，ODS/ODP 的全部 9/8 个 ZIP 成员可 raw copy 后逐成员保持，`content.xml` 为唯一候选，其余样式、媒体、manifest 和未知成员受保护；加密、签名、真实脚本、外链和嵌入对象直接阻断。真实测试修正旧 ODS 种子的 `of:=of:=SUM / 错误:510` 为 `of:=SUM([.A2];8) / 50`，并修复 LibreOffice 空 `<office:scripts/>` 被误报为宏。LibreOffice 26.2.4.2 独立复开 ODS/ODP 生成 21,586/19,403 B PDF，源摘要不变；ODP 备注未保留，WPS ODS 自动化 60 秒不返回，均未伪造通过。下一步只做 M1C-B ODS 简单单元格值可靠副本，ODP、ODS 公式/样式仍只读。版本保持 `1.0.15`，`releaseCandidate=false`。详见 [`Post_v1.0.15_M1CA_ODF_Edit_Feasibility_Audit_2026-08-27.md`](./Post_v1.0.15_M1CA_ODF_Edit_Feasibility_Audit_2026-08-27.md)。

> **2026-08-27 M1B2C DOCX 原生往返已通过，M1B 收口：** M1B2B 的三份 Long编辑真实输出分别经 Microsoft Word 16、WPS Writer 12.1.0.28043、LibreOffice Writer 26.2.4.2 原生保存、退出和独立复开，形成 3 个生产者、9 个来源组合，9/9 均稳定；Long编辑随后反读 9/9，文件摘要不变、960x720 无溢出、运行时错误 0。真实测试确认 LibreOffice 会把 Word/WPS 样式 ID `ab/1` 规范化为 `IntenseQuote/Normal`，语义没有丢失；同时修正了 COM 冷却、PowerShell 5.1 参数/UTF-8、固定 E2E 端口和空白 WebView 竞态。原始 Office 输出仅在临时目录，仓库只保留脱敏指标与截图。下一步进入 M1C ODS/ODP 基础编辑可行性审计，先审计后选最小安全子集。版本保持 `1.0.15`，`releaseCandidate=false`。详见 [`Post_v1.0.15_M1B2C_DOCX_Native_Roundtrip_Closure_Audit_2026-08-27.md`](./Post_v1.0.15_M1B2C_DOCX_Native_Roundtrip_Closure_Audit_2026-08-27.md)。

> **2026-08-26 M1B2B DOCX 已有段落样式编辑已通过：** Microsoft Word、WPS Writer、LibreOffice Writer 三份真实生产者 DOCX 均完成文件内已有样式切换、内存草稿、撤销/重做、隔离验证、确认覆盖及 Long编辑结构/语义复读；保存前源摘要不变，保存后摘要变化，`word/styles.xml` 与其余未改部件保持，960x720 无溢出、运行时错误 0。真实测试纠正了标题切换普通样式后对象类型会变化、E2E 初始化端口/导航竞态、全局工具提示移除 `title` 以及选择框历史入口不稳定等差异。下一步 M1B2C 只做 Word/WPS/LibreOffice 原生程序复开与 M1B2 收口，不增加编辑对象。版本保持 `1.0.15`，`releaseCandidate=false`。详见 [`Post_v1.0.15_M1B2B_DOCX_Paragraph_Style_Editing_Audit_2026-08-26.md`](./Post_v1.0.15_M1B2B_DOCX_Paragraph_Style_Editing_Audit_2026-08-26.md)。

> **2026-08-26 M1B2A DOCX 生产者对象选择审计已通过：** Rust 直接盘点 Microsoft Word、WPS Writer、LibreOffice Writer 的 3 份基础 DOCX 与 3 份超链接 DOCX。安全表格单元格目标为 `5/6/6`、字符样式为 `13/0/0`、图片替代文字为 `1/1/0`、超链接标签为 `2/0/2`；三份基础文件均包含段落样式定义与引用。由此纠正“常用对象普遍缺失”的宽泛预期，下一步 M1B2B 只做简单顶层段落在文件已有样式之间切换，页眉页脚、浮动图片、合并结构和域链接继续只读。六份摘要、实际对象库存及修正前后差异已进入机器门禁。本阶段未开放写回、不提升版本，`releaseCandidate=false`。详见 [`Post_v1.0.15_M1B2A_DOCX_Producer_Object_Selection_Audit_2026-08-26.md`](./Post_v1.0.15_M1B2A_DOCX_Producer_Object_Selection_Audit_2026-08-26.md)。

> **2026-08-26 10,000 文件索引性能阶段已通过：** 100 个目录、10,000 个真实 Markdown/TXT/JSON/YAML 文件的修正前后对照已完成。首次构建由 15,796 ms 降至 9,185 ms，已建查询由 4,229 ms 降至 105 ms，变化检测/过期查询/单文件刷新为 5/111/993 ms，取消确认 7 ms，重启查询 120 ms；720px 无横向溢出、运行时错误 0、fixture manifest SHA-256 不变。运行时现使用文件变化事件、快照缓存、有界单文件覆盖层和显式取消，关系变化与复杂格式仍安全回退全量重建。接手后直接进入 M1B2A DOCX 生产者对象选择审计，不提升版本，`releaseCandidate=false`。详见 [`Post_v1.0.15_Large_Library_Index_Search_Audit_2026-08-26.md`](./Post_v1.0.15_Large_Library_Index_Search_Audit_2026-08-26.md)。

> **2026-08-26 M2A3 工作台导航与待办筛选已通过：** 收藏、最近文件和项目 Canvas 已合并到“继续工作”并按规范化路径全局去重；待办支持状态、文件、优先级和日期筛选，已完成任务可恢复，元数据标记不污染标题。真实 Tauri Unicode 临时资料库验证同一 Canvas 从可能 3 处降为 1 处、3 个导航分组、5 条未完成和 2 条已完成任务、两个组合筛选、真实磁盘完成写入与逐字节恢复；1280/1000/720/480 无横向溢出，运行时错误 0。下一步仅执行 M2 工作台退出条件收口审计，再回到 M1B2A。当前不提升版本。详见 [`Post_v1.0.15_M2A3_Workspace_Navigation_and_Task_Filters_Audit_2026-08-26.md`](./Post_v1.0.15_M2A3_Workspace_Navigation_and_Task_Filters_Audit_2026-08-26.md)。

> **2026-08-26 M2A1 工作台待办行动闭环已通过：** 工作台 Markdown 待办现可在应用内确认后直接完成，专用后端命令校验资料库边界、扩展名、源签名、行号、状态和原文本，并通过可靠写入保持编码、BOM、换行和末尾换行；完成后可在工作台单步撤销，外部修改不会被旧操作覆盖。真实中文路径临时资料库的 UTF-8 BOM、CRLF 文件验证取消不写盘、完成摘要变化、撤销逐字节恢复；1280x820 与 760x680 无横向溢出，运行时错误 0。顶部格式计数已移除。M2 尚未完成，下一步 M2A2 合并知识健康、知识脉搏和治理队列，并让最近文件与待办不等待完整图谱分析。当前不提升版本。详见 [`Post_v1.0.15_M2A1_Workspace_Task_Action_Audit_2026-08-26.md`](./Post_v1.0.15_M2A1_Workspace_Task_Action_Audit_2026-08-26.md)。

> **2026-08-26 M1B1C PPTX 统一草稿与显式保存已通过：** 现有七类有界操作已进入统一内存草稿，共享撤销/重做、脏状态、离开保护和顶部显式保存。真实 Tauri 使用 WPS 生产者临时 PPTX 验证保存前、取消同路由文件切换后及撤销后源摘要不变，重做恢复、确认覆盖后摘要变化并重开目标文字；1280 与 960x720 人工复核无溢出，运行时错误 0。审计中修复了真实资料库路由测试、Vue Proxy 草稿克隆以及同组件文件切换绕过离开保护的问题。公开能力已从“只可靠副本”对齐为有界覆盖，单项可靠副本仍保留。M1B1 收口，下一步 M1B2A 对 Microsoft/WPS/LibreOffice 的 DOCX 页眉页脚、表格、图片布局、段落样式和超链接做选择审计。当前不提升版本。详见 [`Post_v1.0.15_M1B1C_PPTX_Unified_Drafts_Desktop_Audit_2026-08-26.md`](./Post_v1.0.15_M1B1C_PPTX_Unified_Drafts_Desktop_Audit_2026-08-26.md)。

> **2026-08-26 M1B1B PPTX 多操作事务基础已通过：** 新增 1–64 个有界操作的确定性事务预览与原文件保存命令，具备重复目标阻断、统一输出摘要、逐步语义验证和逐字节重放。Microsoft/WPS/LibreOffice 三份真实 PPTX 均完成“文本修改 + 幻灯片重排”事务，预览不写盘、保存输出一致、旧签名拒绝、无旁路文件；M1B1A 单操作回归通过。前端和公开能力仍未改变。下一步 M1B1C 接入统一草稿、撤销/重做、离开保护与显式保存 UI。当前不提升版本。详见 [`Post_v1.0.15_M1B1B_PPTX_Transaction_Foundation_Audit_2026-08-26.md`](./Post_v1.0.15_M1B1B_PPTX_Transaction_Foundation_Audit_2026-08-26.md)。

> **2026-08-26 M1B1A PPTX 原文件保存基础已通过：** 新增签名和隔离输出摘要保护的可靠原文件保存命令，包含中断恢复、写前二次复核、原子替换、写后结构/语义重放和失败回滚。Microsoft/WPS/LibreOffice 三份真实 PPTX 均完成原文件目标修改与重开，旧签名被拒绝且文件不再变化；既有可靠副本 3/3 与中断备份恢复回归通过。前端仍保持“源 PPTX 只读”，公开能力未更新。下一步 M1B1B 建立确定性多操作事务，再接统一草稿、撤销/重做和显式保存。当前不提升版本。详见 [`Post_v1.0.15_M1B1A_PPTX_Source_Save_Foundation_Audit_2026-08-26.md`](./Post_v1.0.15_M1B1A_PPTX_Source_Save_Foundation_Audit_2026-08-26.md)。

> **2026-08-26 M1B0 DOCX/PPTX 对象基线已通过：** 真实 Microsoft/WPS/LibreOffice 的 3 份 DOCX 与 3 份 PPTX 完成矩阵、解析和保存重开验证。审计纠正了“常用对象普遍缺失”的宽泛假设：DOCX 已有统一草稿、撤销/重做与显式原文件保存；PPTX 已有文本、备注、基础样式、图片、形状与幻灯片有界编辑及可靠副本。实际差距是 PPTX 仍为单操作、无统一历史、不能显式覆盖源文件。下一步 M1B1A 先实现签名保护、原子写入、写后语义复读和失败回滚的 PPTX 原文件保存基础，同时保留副本路径。当前不提升版本。详见 [`Post_v1.0.15_M1B0_DOCX_PPTX_Object_Baseline_Audit_2026-08-26.md`](./Post_v1.0.15_M1B0_DOCX_PPTX_Object_Baseline_Audit_2026-08-26.md)。

> **2026-08-26 M1A4B2 与 M1A XLSX 日常编辑增强已收口：** 条件格式与 Table 已进入统一对象草稿，纳入撤销/重做、脏状态、离开保护和顶部显式保存；单元格与对象最终通过 `write_workbook_draft` 一次原子写入。真实 `compatibility-baseline.xlsx` 验证两个对象草稿保存前摘要不变、撤销 `2→1`、重做 `1→2`、一次保存后重开仍为 `between 1000/2000 / 绿色通过` 与 `TableStyleMedium4`，运行时错误 0；纯对象事务 Rust 回归也通过。审计中修复 Vue Proxy 克隆失败和零单元格对象事务误拒绝。当前不提升版本，下一步 M1B0 审计 DOCX/PPTX 常用对象和包保持边界，再确定 M1B1。详见 [`Post_v1.0.15_M1A4B2_XLSX_Object_Drafts_Audit_2026-08-26.md`](./Post_v1.0.15_M1A4B2_XLSX_Object_Drafts_Audit_2026-08-26.md)。

> **2026-08-26 M1A4B1 XLSX 对象事务基础已通过：** 新增 `write_workbook_draft`，可在一次签名校验和一次可靠写入中组合单元格、格式、条件格式与 Table 变更。真实临时 XLSX 同一事务写入 `B2=88`、`greaterThan 80` 条件格式和 `ProgressTable` 后全部复读成功；旧签名重放被拒绝且文件字节不变。前端对象草稿尚未接入，现有对象按钮仍会立即写盘，下一步 M1A4B2 迁移到统一撤销/重做、脏状态和顶部显式保存。详见 [`Post_v1.0.15_M1A4B1_XLSX_Object_Transaction_Foundation_Audit_2026-08-26.md`](./Post_v1.0.15_M1A4B1_XLSX_Object_Transaction_Foundation_Audit_2026-08-26.md)。

> **2026-08-26 M1A4A XLSX 条件格式可视编辑已通过：** 基础 `cellIs/expression` 已从多轮内部值输入改为统一中文表单，提供八种比较方式、两个阈值、五种色板、停止规则和实时预览；高级色阶、数据条和图标集保留原入口。真实 `Summary!B2` 验证编辑中不写盘、应用后写盘、刷新复读一致、仓库样本不变；1280×800 与 560×720 人工复核通过，窄屏弹窗可内部滚动，运行时错误 0。审计中还修复数据工具入口遗漏、单格范围文案、Teleport 高度和 PowerShell UTF-8 证据读取。下一步 M1A4B 建立条件格式与 Table 的统一对象草稿、撤销/重做和显式保存。详见 [`Post_v1.0.15_M1A4A_XLSX_Conditional_Format_Editor_Audit_2026-08-26.md`](./Post_v1.0.15_M1A4A_XLSX_Conditional_Format_Editor_Audit_2026-08-26.md)。

> **2026-08-25 M1A4A 暂停交接：** 基础 XLSX 条件格式已实现中文可视表单，包含规则类型、比较方式、阈值、五种色板、停止规则和实时预览；高级规则保留原入口。真实 `compatibility-baseline.xlsx` 已验证 `Summary!B2` 编辑中不写盘、应用后写盘及刷新复读，并在过程中修复数据工具入口遗漏和单格范围文案。最后的 560×720 检查曾超出 23.5 px，Teleport 样式已改为全局限制，但修正后复验被暂停；因此 M1A4A 尚未宣告完成。新电脑应先执行生产构建和 `audit:post-v115-m1a4a-xlsx-conditional-editor`，通过后再进入 M1A4B 统一对象草稿、撤销和显式保存。详见 [`Post_v1.0.15_M1A4A_XLSX_Conditional_Format_Editor_Handoff_2026-08-25.md`](./Post_v1.0.15_M1A4A_XLSX_Conditional_Format_Editor_Handoff_2026-08-25.md)。

> **2026-08-25 M1A3 XLSX 大表分页缓存已通过：** 真实 Tauri 10k/50k/100k 的冷打开/末页为 `2500/256`、`5003/784`、`7929/2187 ms`，100k 末页较 M1A2 的 6595 ms 改善 66.8%，运行时错误 0。缓存只保留一个工作表并绑定路径、Sheet 和内容签名；真实文件写回后值与布局都会失效并读到新值。代价是 100k 冷打开接近 8 秒上限，不能宣传为全面性能提升。下一步 M1A4 重构条件格式可视编辑器，并把条件格式、Table 等对象操作纳入统一草稿、撤销和显式保存边界；OOXML 行索引作为后续独立优化。详见 [`Post_v1.0.15_M1A3_XLSX_Paging_Cache_Audit_2026-08-25.md`](./Post_v1.0.15_M1A3_XLSX_Paging_Cache_Audit_2026-08-25.md)。

> **2026-08-25 M1A2 XLSX 规模与对象基线已通过：** 真实 Tauri 桌面在 10k/50k/100k 单元格下完成打开、末页、编辑、显式保存和复开，耗时分别为 `1855/103/1403`、`2737/2392/4473`、`4313/6595/7708 ms`，运行时错误 0，临时源在保存前保持不变。条件格式签名写回和 Table 包结构测试通过。100k 末页和保存距离预算仅 405/292 ms，不能视为性能宽裕；条件格式多轮文字输入和对象立即写盘也未收口。下一步 M1A3 优化重复整表解析，将 100k 末页目标降到 4,500 ms 内，再进入条件格式可视编辑和显式保存边界。详见 [`Post_v1.0.15_M1A2_XLSX_Scale_and_Object_Baseline_Audit_2026-08-25.md`](./Post_v1.0.15_M1A2_XLSX_Scale_and_Object_Baseline_Audit_2026-08-25.md)。

> **2026-08-25 M1A1 XLSX 列表验证交互已通过：** 真实 `compatibility-baseline.xlsx` 的 `Details!B2` 已从“只能手输并在保存时校验”补强为可见的三项下拉选择。选择 `Closed` 后临时文件在保存前 SHA-256 不变，显式保存后变化，刷新真实 Tauri 应用并重开仍为 `Closed`；860×700 无弹层越界，运行时错误 0，仓库样本保持不变。当前不提升版本。下一步 M1A2 审计条件格式、表格对象与 10k/50k/100k 大表性能，再选择一个独立可验收子能力。详见 [`Post_v1.0.15_M1A1_XLSX_List_Validation_Audit_2026-08-25.md`](./Post_v1.0.15_M1A1_XLSX_List_Validation_Audit_2026-08-25.md)。

> **2026-08-25 M0 真实测试基线已通过：** 已冻结 13 类薄弱格式证据矩阵、统一预期/实际差异模板和固定工作台资料库。Rust 当前产品后端实际扫描得到 11 个注册文件、2 个待办、1 个 Canvas、1 组重复文件、1 条未引用批注、1 条断链和 1 条歧义链接；实际生成并解析 100/1,000/5,000 个 Markdown 节点，边数 99/999/4,999，最近构建耗时 105/773/4,853 ms。`audit:post-v115-m0-baseline` 2/2 Rust 测试与机器总账通过。下一步进入 M1A，先审计 XLSX 公式、数据验证、条件格式、表格、图表和高级对象的当前真实边界。详见 [`Post_v1.0.15_M0_Real_Baseline_Audit_2026-08-25.md`](./Post_v1.0.15_M0_Real_Baseline_Audit_2026-08-25.md)。

> **2026-08-25 v1.0.15 后专业能力增强路线已冻结：** 已基于 `main` / `4cd3aa0` / `v1.0.15` 审计薄弱格式、工作台和知识图谱现状，并形成 M0～M4 开发路线。后续依次执行事实与真实测试基线、高频格式深化、工作台 2.0、知识图谱 2.0、跨格式收口与版本候选；每个阶段都必须记录修正前实际结果、目标结果、修正后实际结果和可复核证据。下一步为 M0，不提前扩大任何格式能力声明。详见 [`Post_v1.0.15_Professional_Capability_Enhancement_Roadmap_2026-08-25.md`](./Post_v1.0.15_Professional_Capability_Enhancement_Roadmap_2026-08-25.md)。

> **2026-08-22 v1.0.15 无签名社区版已发布并复核：** 交互治理七张真实 Tauri 截图、冻结产品提交 `9aaa810f9a96bb3e741551b966091bd1b67f5b1e` 的无签名 NSIS/MSI、托管运行 `32518530525` 的 22/22 安装生命周期与 18/18 安装后工作区检查均通过。Release `374954902` 已公开，Tag `v1.0.15` 绑定合并提交 `317b667679fff4e8e29ce2a0ca94f8e480764d13`；三个公开附件重新下载后的大小与 SHA-256 全部匹配。下一步只执行独立的 `v1.0.14 -> v1.0.15` 官方应用内更新观察。详见 [`V1_0_15_Interaction_Polish_Audit_2026-08-21.md`](./V1_0_15_Interaction_Polish_Audit_2026-08-21.md) 与 [`V1_0_15_Unsigned_Community_Release_Audit_2026-08-22.md`](./V1_0_15_Unsigned_Community_Release_Audit_2026-08-22.md)。

> **2026-08-21 v1.0.13 发布前界面收口：** 更新提示已从未生效的 scoped 宽度约束改为 460 px 响应式信息卡，发布说明会清理 Markdown 并最多展示四条摘要；设置页桌面布局改为左侧分类固定、右侧独立滚动，分类切换回到内容顶部。隔离真实页面在 1280×800、1000×700、480×700 完成测量：导航纵坐标三次均为 114 px，弹窗最大 460×442 px，横向溢出与运行时错误均为 0。证据位于 `docs/evidence/v1013-update-settings-ui/`；下一步提交推送后恢复完整 Quality Gate、无签名打包与 Release。

> **2026-08-20 v1.0.12 已发布并远端复核：** GitHub Release `373565646` 已公开，Tag `v1.0.12` 绑定提交 `505d69d`。NSIS、MSI 与 `SHA256SUMS.txt` 重新下载后的大小和 SHA-256 全部匹配冻结清单；README、发布说明、策略和回执已同步。下一步单独执行官方 `v1.0.11 -> v1.0.12` 应用内更新、自动重启、最新版状态与合成资料保留观察。

> **2026-08-20 v1.0.12 候选证据通过：** 冻结提交 `e069947` 的 Quality Gate `32342006759` 与托管 U2 `32342021774` 均成功；U2 完成 22/22 生命周期、18/18 安装后工作区检查和 0 失败。三个本地候选二进制均为 1.0.12、`NotSigned`，SHA-256 已冻结；本机用户实例未被终止或安装覆盖。下一步提交候选证据，再发布 GitHub Release 并重新下载复核三个附件。

> **2026-08-20 v1.0.12 候选冻结：** P2-A 至 P2-C 已构成 PDF 能力声明纠偏、图片色彩调整和图片鼠标导航增强包，package/Cargo/Tauri 与发布事实源开始提升至 1.0.12。当前仍是质量门待验证状态，公开稳定版和 README 下载保持 v1.0.11；必须完成完整 Quality Gate、无签名 MSI/NSIS、托管安装生命周期、候选证据回写、GitHub Release 与远端附件复核后才能宣布发布。详见 [`V1_0_12_Unsigned_Community_Release_Audit_2026-08-20.md`](./V1_0_12_Unsigned_Community_Release_Audit_2026-08-20.md)。

> **2026-08-20 P2-C 图片导航真实收口：** 图片查看已增加光标锚定滚轮缩放、双轴拖拽平移、双击切换 100%/适应窗口和方向键平移。修正前静态基线确认滚轮、指针和导航处理均缺失；修正后真实 Tauri 鼠标输入在 1280×800 与 720×680 通过，锚点漂移约 1.6%/0.6%，拖拽双轴滚动变化 150/100 px，页面溢出和运行时错误均为 0。下一步执行综合门禁并审计是否达到 v1.0.12 候选阈值。详见 [`P2C_Image_Navigation_Real_Desktop_Audit_2026-08-20.md`](./P2C_Image_Navigation_Real_Desktop_Audit_2026-08-20.md)。

> **2026-08-20 P2-B 图片色彩调整真实收口：** 现有图片编辑侧栏已新增亮度、对比度、饱和度与恢复原色，PNG/JPEG/WebP/BMP 仍只可靠另存新副本。Rust 真实像素测试 6/6、生产构建、Tauri 1280×800/720×680、IPC 另存复开和独立 `System.Drawing` 验证均通过；实际灰度采样为 `134/134/134/255`，源 SHA-256 不变，运行时错误 0。下一步先做 P2-C 图片交互深化的可行性审计，再做 43 格式能力事实巡检；外部 Office 生产者证据没有对应环境时继续阻断。详见 [`P2B_Image_Color_Adjustments_Real_Desktop_Audit_2026-08-20.md`](./P2B_Image_Color_Adjustments_Real_Desktop_Audit_2026-08-20.md) 与 [`Post_v1.0.11_Enhancement_Audit_and_Plan_2026-08-20.md`](./Post_v1.0.11_Enhancement_Audit_and_Plan_2026-08-20.md)。

> **2026-08-20 P2-A PDF 能力登记重新对齐：** 已确认最领先成果均在 `main`，v1.0.11 发布与官方更新链已经收口。审计发现格式能力页仍错误停留在“表单只读”，现已对齐安全表单子集填写、永久脱敏、文字水印和文档属性可靠副本，并新增机器门禁防止声明再次漂移。修正前真实对比缺少四项能力并返回 `FAIL`，修正后合同检查通过。下一步 P2-B 补强图片基础编辑，并以真实像素、源摘要、目标复开和 Tauri 桌面证据验收。详见 [`P2A_PDF_Capability_Registry_Reconciliation_Audit_2026-08-20.md`](./P2A_PDF_Capability_Registry_Reconciliation_Audit_2026-08-20.md)。

> **2026-08-16 v1.0.11 发布流程完全收口：** 官方 `v1.0.10 -> v1.0.11` 应用内更新运行 `31933205654` 已通过 12/12、0 失败。发现更新、显式确认、官方 NSIS SHA-256、同目录覆盖、更新助手自动重启、最新版状态以及覆盖/卸载后的合成资料保留均通过；三张截图已人工复核，九份脱敏证据已导入并受 SHA-256 清单约束。至此版本发布、远端附件与官方更新链全部收口，后续进入独立增强迭代。

> **2026-08-16 v1.0.11 官方更新观察工具：** 已新增 `v111` 发布资产绑定、托管 Windows 工作流和机器检查，目标是只用公开 `v1.0.10`/`v1.0.11` NSIS 真实观察显式确认、SHA-256、同目录覆盖、自动重启、最新版状态与资料保留。当前状态必须保持 pending；只有合并后的工作流 12/12 通过、三张截图人工复核和九份脱敏证据导入后，才可关闭发布流程。

> **2026-08-16 v1.0.11 已发布并远端复核：** GitHub Release `371253676` 已公开，Tag `v1.0.11` 绑定候选证据提交 `4615cfe`。NSIS、MSI 和 `SHA256SUMS.txt` 已重新下载，大小与 SHA-256 全部匹配冻结清单；README、发布策略和回执已同步。下一步只执行官方 `1.0.10 -> 1.0.11` 应用内更新、自动重启、最新版状态及资料保留观察。

> **2026-08-16 v1.0.11 候选证据通过：** 冻结产品提交 `73932f3` 的 Quality Gate `31902257921`、本地隔离 EXE/MSI/NSIS 构建及托管 U2 安装生命周期 `31902477250` 均已通过。U2 完成 22/22 生命周期与 18/18 安装后工作区检查，0 失败；安装器无签名，证据不含用户内容。当前阶段为“待发布”，下一步发布 GitHub Release、远端下载复核三个附件，再执行官方 `1.0.10 -> 1.0.11` 应用内更新观察。

> **2026-08-16 v1.0.11 无签名打包纠偏：** 首次冻结构建已生成 EXE/MSI/NSIS，但 Tauri 因主配置仍要求旧式 updater `.sig` 而在产物完成后返回失败。当前社区更新实际使用 GitHub Release + 严格附件名 + SHA-256，且明确不发布 `.sig`/`latest.json`，因此主配置已改为 `createUpdaterArtifacts=false` 并加入发布门禁。必须等待本修复的新冻结提交和 Quality Gate 后重新构建，旧产物不得登记为候选。

> **2026-08-16 v1.0.11 发布准备：** package、Cargo、Tauri、Windows 生命周期、性能、能力矩阵和 P1 总收口事实源开始同步到 `1.0.11`；发布范围冻结为 v1.0.10 之后的图片基础编辑、PDF 表单/永久脱敏/水印/文档属性与能力对齐。当前 README 下载仍指向已验证 v1.0.10。下一步等待完整 Quality Gate，随后冻结产品提交、构建 MSI/NSIS、运行托管安装生命周期、回写候选证据、发布并复核远端附件，最后单独验证官方 `1.0.10 -> 1.0.11` 应用内更新。详见 [`V1_0_11_Unsigned_Community_Release_Audit_2026-08-16.md`](./V1_0_11_Unsigned_Community_Release_Audit_2026-08-16.md)。

> **2026-08-16 P1 总收口：** 最初“日常管理、基础编辑、成体系管理、左侧资料库 + 右侧工作区、知识图谱与思维导图/图形、开发文本、PDF/Office/表格”的需求已按有界能力通过。当前 43 类格式/91 个扩展名分为直接编辑、有界可靠副本、预览或外部依赖三层；知识图谱是派生关系探索，Canvas/OPML/Mermaid/Draw.io 承担思维导图与图形源编辑，不能混写为同一能力。P1 没有剩余补丁阻断型功能，下一步进入 `1.0.11` 无签名发布。合同见 [`p1-final-capability-closure.json`](../shared/p1-final-capability-closure.json)，审计见 [`P1_Final_Capability_Closure_Audit_2026-08-16.md`](./P1_Final_Capability_Closure_Audit_2026-08-16.md)。

> **2026-08-16 P1-B5D PDF 文档属性真实桌面与独立验证收口：** 真实 Tauri WebView2 已在原 `PdfView` 完成既有属性复读、中文四字段编辑、主题键删除、草稿离开拦截、隔离验证、非匿名化确认、可靠另存和目标复开。1280×800 与 720×680 保持左侧资料库和右侧编辑区，299 px 属性栏无页面级溢出、零运行时错误。独立 pypdf + Poppler + Pillow 确认源 SHA-256 不变、目标全量重写、Creator 等五类属性保持、正文/几何/链接批注不变，两页 144 DPI 渲染逐像素一致。P1-B5 至此收口，下一步只执行 P1 总收口后进入 `1.0.11` 发布。详见 [`P1B5D_PDF_Metadata_Desktop_Evidence_Audit_2026-08-16.md`](./P1B5D_PDF_Metadata_Desktop_Evidence_Audit_2026-08-16.md)。

> **2026-08-16 P1-B5A PDF 元数据安全副本审计：** 已冻结资料库内 PDF 标题、作者、主题、关键词四字段的可靠新副本合同；空值表示删除对应键，Creator/Producer/CreationDate/ModDate/Trapped 必须字节保持。此能力明确不是完整隐私清理：正文、批注、附件及其他对象仍可能识别人员。现有 XMP、自定义 Info 键、附件级元数据、签名/认证、加密、PDF/A、异常引用和预算超限均先阻断，避免只改 `/Info` 却留下冲突 XMP 或静默丢弃未知业务字段。本阶段没有命令、UI 或用户文件写入；下一步 P1-B5B 实现完整克隆、规范 Info、摘要锁定、可靠另存和复读后端。详见 [`P1B5A_PDF_Metadata_Copy_Safety_Audit_2026-08-16.md`](./P1B5A_PDF_Metadata_Copy_Safety_Audit_2026-08-16.md)。

> **2026-08-16 P1-B4D PDF 文字水印真实桌面与独立渲染收口：** 真实 Tauri WebView2 已完成资料库源 PDF 打开、原 `PdfView` 水印侧栏、中文“项目机密 P1B4D”、-33°/24%/35% 参数、草稿离开拦截、预验证、风险确认、可靠另存和目标两页复开；1280×800 与 720×680 下侧栏均为 299 px、无文档级溢出、零运行时错误。独立 pypdf + Poppler + Pillow 验证确认源 SHA-256 不变、纵向/横向页面几何保持、原文/链接批注/元数据保持、每页中文水印可提取、trailer 无增量 `/Prev` 且 144 DPI 水印可见无裁切。P1-B4 至此收口，下一步 P1-B5A 元数据安全审计。详见 [`P1B4D_PDF_Watermark_Desktop_Evidence_Audit_2026-08-16.md`](./P1B4D_PDF_Watermark_Desktop_Evidence_Audit_2026-08-16.md)。

> **2026-08-16 P1-B4C PDF 文字水印原右侧工作区：** 已在原 `PdfView` 工具栏与侧栏加入“文字水印”，没有新增路由、独立窗口或另一套视觉体系。资料库内 PDF 可填写 1～64 字符文字，调整 -60～60 度、8%～50% 透明度和受限灰度，并查看轻量样式预览；“生成并验证”调用 B4B 后端，只有结构、几何、交互清单、水印流、Unicode 文字和全量重写全部通过后才显示可靠另存。保存前必须确认水印可搜索、提取、编辑或移除且不等于脱敏，落盘复读通过后在同一管理工作流打开目标副本。水印文字草稿进入标题脏标记、路由离开与关闭保护；外部 PDF 不显示入口。下一步 P1-B4D 采集真实 Tauri 宽窄屏、草稿保护、保存复开和独立 Poppler/pypdf 证据。详见 [`P1B4C_PDF_Watermark_Workspace_Audit_2026-08-16.md`](./P1B4C_PDF_Watermark_Workspace_Audit_2026-08-16.md)。

> **2026-08-15 P1-B4B PDF 隔离矢量水印后端：** 已新增独立 `pdf_watermark` 引擎和 `preview_pdf_watermark_copy` / `save_pdf_watermark_copy` 命令。资料库内 1～512 页、128 MiB 以内 PDF 可生成全部页面单条居中斜向文字水印预览，文字使用 Noto Sans CJK SC 2.004 内嵌子集与 ToUnicode；每页复制继承资源为私有字典，追加带 `q/Q`、Artifact BDC/EMC 和私有 ExtGState 的最后内容流。保存绑定源/输出 SHA-256，只创建新目标，并复读页面几何、表单/链接/批注/书签/附件/标签/元数据清单、水印流、可提取中文和无 `Prev` 全量重写。加密、签名/PDF-A、异常页框/旋转/UserUnit、复杂塑形与已有目标保持阻断。Poppler 144 DPI 复核发现并修正首版边缘裁切，当前宽窄轴包围盒自动字号无裁切。命令虽已注册，原 `PdfView` 尚无入口，公开能力仍关闭。下一步 P1-B4C 接入原右侧工作区。详见 [`P1B4B_PDF_Watermark_Backend_Audit_2026-08-15.md`](./P1B4B_PDF_Watermark_Backend_Audit_2026-08-15.md)。

> **2026-08-15 P1-B4A PDF 文字水印安全审计：** 已明确水印只是可见归属标识，不是脱敏、DRM 或防复制。首个安全子集限定资料库内全部页面、单条居中斜向文字、Noto Sans CJK SC 内嵌子集、受限字号/角度/透明度和可靠新副本；批准架构为完整克隆源文档、非增量全量重写、按继承 CropBox/MediaBox/Rotate 定位，并以私有 Font/ExtGState、`q/Q` 和 Artifact 边界追加最后内容流。签名/加密/PDF-A/异常页框与已有目标保持阻断，当前没有命令或 UI。下一步 P1-B4B 只实现隔离后端和攻击面测试。详见 [`P1B4A_PDF_Watermark_Copy_Safety_Audit_2026-08-15.md`](./P1B4A_PDF_Watermark_Copy_Safety_Audit_2026-08-15.md)。

> **2026-08-15 P1-B3D PDF 永久脱敏最终收口：** 真实 custom-protocol Tauri WebView2 已在 1280×800 与 720×680 完成原右侧工作区框选、草稿离开保护、全页预验证、取舍确认、可靠另存和目标自动复开，外层横向溢出为 0、运行时错误为 0、源摘要不变。Poppler 144 DPI 与 pypdf/Pillow 独立验证目标两页、可提取文字为空、秘密标记不存在、批注/表单/书签/元数据移除、黑框像素 100% 不透明且公开内容可读。P1-B3 已收口，下一步 P1-B4 先做水印副本安全审计。详见 [`P1B3D_PDF_Permanent_Redaction_Desktop_Evidence_Audit_2026-08-15.md`](./P1B3D_PDF_Permanent_Redaction_Desktop_Evidence_Audit_2026-08-15.md)。

> **2026-08-15 P1-B3C PDF 永久脱敏右侧工作区：** 原 `PdfView` 工具栏和侧栏已增加“永久脱敏”，用户可在右侧 PDF.js 页面直接框选黑/白区域、管理草稿、渲染全部页面、预验证并在确认图片型副本损失后可靠另存；没有新增路由或独立界面。全页渲染遵守 64 页、4096 单边、1.2 亿像素和 256 区域预算，矩形按 Rust 同一 `ceil/floor` 边界在 PNG 编码前烧入。IPC 改用严格 Base64 并在 Rust 端限制 256 MB，源/输出摘要、已有目标拒绝、落盘复读、文字为空、源对象隔离和源不变继续生效。下一步 P1-B3D 补真实 Tauri 宽窄屏、自动打开、Poppler 独立渲染与文字清除证据。详见 [`P1B3C_PDF_Permanent_Redaction_Workspace_Audit_2026-08-15.md`](./P1B3C_PDF_Permanent_Redaction_Workspace_Audit_2026-08-15.md)。

> **2026-08-15 P1-B3B PDF 永久脱敏栅格后端：** 新后端要求提交全部页面的不透明 PNG，验证页序、继承页面几何、4096 像素单边/1.2 亿总像素/256 矩形预算，并逐像素确认黑/白矩形已烧入；随后去元数据重编码 JPEG，从空 PDF 创建每页唯一 Image XObject 的白名单对象图。预览绑定源/输出 SHA-256；可靠另存使用同目录新建、目标字节一致、文本提取为空、对象图重开和源摘要不变门禁。缺页、透明、未烧入、签名、已有目标和源覆盖测试均通过；Poppler 合成输出清晰。命令虽已注册，但原 `PdfView` 尚无入口，公开能力仍关闭。下一步 P1-B3C 接入原右侧工作区和 PDF.js 全页渲染。详见 [`P1B3B_PDF_Permanent_Redaction_Backend_Audit_2026-08-15.md`](./P1B3B_PDF_Permanent_Redaction_Backend_Audit_2026-08-15.md)。

> **2026-08-15 P1-B3A PDF 永久脱敏安全审计：** 已拒绝黑框覆盖、增量更新、按绘制操作符猜测删除、只重建局部页面和复用源 OCR；批准的唯一实现路线是把整份 PDF 全部页面离线渲染为不透明位图，在编码前烧入黑/白矩形，再从空文档构建只含页面、内容流和图片 XObject 的新 PDF。这样源文本、图片、矢量、隐藏对象、表单、批注、附件、图层、书签、标签和元数据都不进入输出。代价是目标成为图片型 PDF，失去文本搜索和交互能力，后续 UI 必须明确提示。目前仍为审计态，没有提前增加命令或按钮；下一步 P1-B3B 实现白名单后端与复读门禁。详见 [`P1B3A_PDF_Permanent_Redaction_Safety_Audit_2026-08-15.md`](./P1B3A_PDF_Permanent_Redaction_Safety_Audit_2026-08-15.md)。

> **2026-08-15 P1-B2B6 PDF 单选 Choice 可靠副本：** 原 PDF 右侧表单工作区现支持有界单选下拉框与列表框。只有非自由输入、非多选、无动作、2～512 个已完整解析选项且导出值非空唯一时才开放编辑；`/Opt` 的导出/展示映射被完整保留，副本把 `/V` 写为导出值、`/I` 写为单项索引，Widget `/AP /N` 则显示展示值。真实 Tauri 宽窄屏、目标重开与 Poppler 源/目标渲染确认 `region-east`/`East` 一致，源摘要不变。至此文本、复选框、单选组和单选 Choice 的 AcroForm 安全标准字段子集收口；自由输入/多选 Choice、签名/加密 PDF 和正文重排继续阻断。下一步 P1-B3 审计永久脱敏是否能证明内容真正移除。详见 [`P1B2B6_PDF_Choice_Copy_Audit_2026-08-15.md`](./P1B2B6_PDF_Choice_Copy_Audit_2026-08-15.md)。

> **2026-08-15 P1-B2B5 PDF 单选组可靠副本：** 原 PDF 右侧表单工作区现支持标准 radio group 的有界填写。只有父字段与至少两个 Widget 关系清晰、每个 Widget 同时具备非空 `Off` 和唯一导出外观、且组内导出值互异时才开放编辑。副本把父字段 `/V` 写成选中值，对应 Widget `/AS` 写同名状态，其余 Widget 全部写 `Off`；保存后逐控件复读互斥关系。真实 Tauri 宽窄屏、源摘要、目标重开及 Poppler 源/目标渲染都确认选中项从 `Standard` 移到 `Professional`。Choice 字段、复杂按钮、签名/加密 PDF 和正文重排继续阻断。下一步 P1-B2B6 先审计 Choice 下拉/列表值映射。详见 [`P1B2B5_PDF_Radio_Copy_Audit_2026-08-15.md`](./P1B2B5_PDF_Radio_Copy_Audit_2026-08-15.md)。

> **2026-08-15 P1-B2B4 PDF 复选框可靠副本：** 原 PDF 右侧表单工作区现支持标准 checkbox 的有界填写。检查器会识别按钮类型、真实导出值以及每个 Widget 的 `/AP /N` 状态；只有唯一导出值且所有 Widget 都具备 `Off` 与该导出外观时才开放编辑。副本同时写入字段 `/V` 和 Widget `/AS`，保存后强制复读；真实 Tauri 宽窄屏、源摘要、目标重开及 Poppler 源/目标独立渲染对比全部通过。单选组、选择字段、复杂按钮、签名/加密 PDF 和任意正文重排继续阻断。下一步 P1-B2B5 单独处理单选组。详见 [`P1B2B4_PDF_Checkbox_Copy_Audit_2026-08-15.md`](./P1B2B4_PDF_Checkbox_Copy_Audit_2026-08-15.md)。

> **2026-08-15 P1-B2B3 PDF 中文文本表单可靠副本：** 原 PDF 右侧表单工作区现支持中文及 Noto Sans CJK SC 覆盖的非复杂字形；规范 `/V` 使用 UTF-16BE，Widget 外观使用 Type0/CIDFontType0、Identity-H、ToUnicode 和按需字形子集。字体来自官方 Noto CJK 2.004，SIL OFL 1.1 许可随仓库保留。真实 Tauri 宽窄屏、结构复读和 Poppler 像素渲染均通过，源文件不变。复杂塑形文字、复选框、单选和选择字段继续阻断。详见 [`P1B2B3_PDF_Unicode_Text_Form_Copy_Audit_2026-08-15.md`](./P1B2B3_PDF_Unicode_Text_Form_Copy_Audit_2026-08-15.md)。

> **2026-08-15 P1-B2B2 PDF 文本表单可靠副本工作区：** B2B1 后端已接入原 `PdfView` 右侧表单侧栏，没有新增窗口、路由或视觉体系。唯一命名、非多行、非密码的安全 `Tx` 字段可编辑草稿，必须先隔离验证再可靠另存；真实 Tauri 宽窄屏完成 `Bob QA` 写入、目标复开、非空外观、源摘要不变和零运行时错误。Unicode、复选框、单选和选择字段继续阻断。详见 [`P1B2B2_PDF_Form_Copy_Workspace_Desktop_Audit_2026-08-15.md`](./P1B2B2_PDF_Form_Copy_Workspace_Desktop_Audit_2026-08-15.md)。

> **2026-08-15 P1-B2B1 PDF 文本表单可靠副本后端：** 新增资料库内 `Tx` 文本字段隔离预览与可靠另存命令；只接受唯一命名、非只读、非密码、带 Widget 且无签名/加密/XFA/JavaScript/动作/结构歧义的字段。基础拉丁值会同时写入规范 `/V` 和每个 Widget 的非空 `/AP /N`，保存强制源摘要、预览输出摘要、同目录新目标、不覆盖及写后复读，失败的新目标会清理。UI、Unicode 嵌入字体、复选框/单选/选择仍未开放。详见 [`P1B2B1_PDF_Text_Form_Reliable_Copy_Backend_2026-08-15.md`](./P1B2B1_PDF_Text_Form_Reliable_Copy_Backend_2026-08-15.md)。

> **2026-08-15 P1-B2B0 PDF 能力登记对齐：** 在表单写入前，已把 PDF 从历史 `edit: unsupported`/sidecar-only 修正为资料库内 `basic-edit` + `copy` + `pdf-copy`，准确覆盖既有页面旋转、排序、排除、提取、合并和插页可靠副本；表单仍明确为只读检查，外部 PDF 继续只读，源覆盖与 PDF 创建仍不支持。发布 profile 与安全降级通道同步独立为 `pdf-copy`/`pdf-reliable-copy-isolation`。下一步 P1-B2B1 实现可靠填写副本后端。详见 [`P1B2B0_PDF_Capability_Registry_Reconciliation_2026-08-15.md`](./P1B2B0_PDF_Capability_Registry_Reconciliation_2026-08-15.md)。

> **2026-08-15 P1-B2A2 PDF 表单检查面板：** B2A1 只读后端已接入原 PDF 工作区的“表单”标签，没有新增路由或窗口；外部 PDF 无入口，字段渲染和 Widget 页码有界，密码值隐藏且无填写/保存控件。真实 custom-protocol Tauri WebView2 在 1280×800、720×680 下验证标准 AcroForm 的 2 字段/2 控件、源摘要不变、零运行时错误和原壳层结构。下一步 P1-B2B 只做无风险字段的可靠填写新副本。详见 [`P1B2A2_PDF_Form_Panel_Desktop_Audit_2026-08-15.md`](./P1B2A2_PDF_Form_Panel_Desktop_Audit_2026-08-15.md)。

> **2026-08-15 P1-B2A1 PDF 表单检查后端：** 新增资料库内只读 AcroForm 检查命令，同时遍历规范字段树和页面 Widget，报告关联、类型、值/默认值、选项、标志、外观、重复名、孤儿及 XFA/JavaScript/签名风险；密码字段值不会出现在报告中。输入、字段数、Widget 数、深度和字符串均有上限，无任何保存参数或写入路径。下一步 P1-B2A2 只在原 PDF 右侧栏展示检查结果并补真实桌面证据。详见 [`P1B2A1_PDF_Form_Inspection_Backend_Audit_2026-08-15.md`](./P1B2A1_PDF_Form_Inspection_Backend_Audit_2026-08-15.md)。

> **2026-08-15 P1-B1 PDF 安全编辑边界审计：** 已确认现有 PDF 具备阅读/搜索、批注和 OCR sidecar，以及旋转、改序、排除、范围提取、合并、插页的可靠新副本；尚无 AcroForm 填写、永久脱敏、水印或元数据编辑。审计发现格式注册表仍低估为 `edit: unsupported`/sidecar-only，需在开放表单写入前统一注册表、发布矩阵和安全降级合同。下一步 P1-B2A 只做规范字段树与页面 Widget 的只读结构检查，加密和签名 PDF 保持强制阻断。详见 [`P1B1_PDF_Safety_Boundary_Audit_2026-08-15.md`](./P1B1_PDF_Safety_Boundary_Audit_2026-08-15.md)。

> **2026-08-15 P1-A3B 图片基础编辑收口：** 既有右侧图片编辑面板已接入精确数值裁剪、裁剪比例感知缩放、JPEG 质量与强制隐私元数据清理说明；未新建独立页面，左侧资料库与右侧编辑结构保持不变。真实 custom-protocol Tauri WebView2 在 1280×800、720×680 下验证 120/60/600/360 裁剪、300×180 输出、JPEG 质量 72、源不变、副本复开、零运行时错误。审计过程中发现并修复“锁定比例仍使用原图比例”的预期不一致。下一步进入 PDF 安全编辑增强。详见 [`P1A3B_Image_Editor_Closure_Audit_2026-08-15.md`](./P1A3B_Image_Editor_Closure_Audit_2026-08-15.md)。

> **2026-08-15 P1-A3A 图片裁剪与隐私后端：** 图片可靠副本内核已增加旋转/翻转后有界裁剪、JPEG 1–100 质量控制、EXIF 方向归一和像素级重新编码元数据清理。合成 EXIF Orientation=6 JPEG 已验证尺寸从 2×3 归一为 3×2，输出不含 EXIF 标记；越界裁剪、非 JPEG 质量参数和非法质量均阻断。公开能力暂不扩写，下一步 P1-A3B 在既有右侧图片编辑面板接入交互并补真实桌面证据。详见 [`P1A3A_Image_Crop_Compression_Privacy_Backend_Audit_2026-08-15.md`](./P1A3A_Image_Crop_Compression_Privacy_Backend_Audit_2026-08-15.md)。

> **2026-08-15 P1-A2 图片编辑工作区验收：** 资料库内 PNG/JPEG/WebP/BMP 已在原有右侧 `MediaViewerView` 中提供旋转、翻转、锁定比例缩放、格式转换和可靠另存；外部图片及 GIF/ICO/AVIF 仍只读。真实 Tauri WebView2 在 1280×800 与 720×680 下验证无文档横向溢出、面板保持可达，960×540 PNG 变换为 480×270 WebP 后完成原图不变、落盘复读和副本重开。下一步进入 P1-A3 裁剪、压缩质量和隐私元数据清理。

> **2026-08-15 P1-A1 图片可靠另存内核：** PNG/JPEG/WebP/BMP 已具备有界旋转、翻转、缩放和格式转换后端；源 SHA-256 冲突保护、知识库路径边界、目标不覆盖、原子新建、落盘复读及源文件不变均有测试与机器合同。GIF/ICO/AVIF 和外部媒体仍只读。本阶段尚未改公开能力声明，接手后进入 P1-A2，只在现有右侧 `MediaViewerView` 接入编辑 UI，完成桌面证据后再更新注册表。详见 [`P1A1_Image_Transform_Copy_Backend_Audit_2026-08-15.md`](./P1A1_Image_Transform_Copy_Backend_Audit_2026-08-15.md)。

> **2026-08-15 v1.0.10 官方更新链收口：** GitHub 托管运行 [`31872858203`](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/31872858203) 已从官方 v1.0.9 通过应用内更新升级到官方 v1.0.10，12/12 检查通过。用户确认、官方 NSIS SHA-256、同目录覆盖、自动重启、最新版状态及覆盖/卸载后的合成资料保留均已验证；三张截图已人工复核，九份脱敏证据受逐文件哈希门禁保护。P0 已收口，下一步进入图片基础编辑。详见 [`V1_0_10_Managed_Updater_Lifecycle_Audit_2026-08-15.md`](./V1_0_10_Managed_Updater_Lifecycle_Audit_2026-08-15.md)。

> **2026-08-15 P0-B v1.0.10 更新验证工具：** 官方 `v1.0.9 -> v1.0.10` 专用策略、GitHub 托管一次性 Windows 工作流和机器门禁已建立；它复用曾捕获 v1.0.8 自动重启失败并验证 v1.0.9 修复的安装 runner 与 WebView 探针。当前只表示工具就绪，真实执行、12/12 检查、截图复核和证据导入尚未完成，状态保持 pending。详见 [`V1_0_10_Managed_Updater_Lifecycle_Audit_2026-08-15.md`](./V1_0_10_Managed_Updater_Lifecycle_Audit_2026-08-15.md)。

> **2026-08-15 P0-A 能力声明对齐：** README 已撤回未注册的 `XLSM/XLSB` 软件内编辑承诺，明确当前工作簿入口仅为 `.xlsx`；ODS/ODP、未注册 ODT 与 WPS 原生格式的边界也已拆开。格式合同新增 README 反向门禁，防止公开说明再次超过共享注册表。`1.0.9 -> 1.0.10` 真实应用内更新仍为 pending，下一步单独建立 v1.0.10 托管更新证据链。详见 [`P0_Capability_Claims_and_Release_Fact_Alignment_Audit_2026-08-15.md`](./P0_Capability_Claims_and_Release_Fact_Alignment_Audit_2026-08-15.md)。

> **2026-08-12 v1.0.10 已发布：** Release `368970200` 已公开，Tag `v1.0.10` 绑定候选证据提交 `380f51d`；源码门禁 `31554131290`、托管安装生命周期 `31556348980` 和候选证据门禁 `31558312102` 全部通过。NSIS、MSI 与 `SHA256SUMS.txt` 已从公开 URL 重新下载，大小和 SHA-256 与冻结产物一致；README 已切换到 v1.0.10。接手后只需执行官方 `1.0.9 -> 1.0.10` 应用内更新观察并回写闭环。

> **2026-08-12 v1.0.10 发布候选：** 版本事实源已冻结到 `1.0.10`，产品提交 `558a16d` 的 Quality Gate `31554131290` 已通过；本地 MSI/NSIS 及 SHA-256 已登记。托管 Windows 运行 `31556348980` 完成 22/22 安装生命周期检查和 18/18 安装后工作区检查，默认应用候选启用、关闭、真实状态与卸载恢复均通过。接手后只需等待候选证据提交的 Quality Gate，随后创建 GitHub Release、重新下载复核三个附件、切换 README 下载链接并记录发布回执；`1.0.9 -> 1.0.10` 应用内更新观察作为发布后的独立收口。

> **2026-08-12 v1.0.10 发布准备：** package、Cargo、Tauri、Windows 生命周期、性能与能力事实源已提升到 `1.0.10`，发布范围固定为 UX-52 应用内默认打开管理。当前公开下载仍为 v1.0.9；接手后依次完成 Quality Gate、冻结候选打包、隔离安装态默认应用复测、GitHub Release 远端复核及官方 `1.0.9 -> 1.0.10` 更新观察。详见 [`V1_0_10_Unsigned_Community_Release_Audit_2026-08-12.md`](./V1_0_10_Unsigned_Community_Release_Audit_2026-08-12.md)。

> **2026-08-12 UX-52 应用内默认打开管理：** 格式能力页现可对 37 类外部格式逐项启用或关闭 Long编辑候选，并显示当前系统默认及部分扩展名默认状态；设置页不再提供笼统的系统设置旁路。Windows 保护的最终默认选择仍由用户点击“设为系统默认”后在系统确认页完成，代码只读 `UserChoice`，不直接写入或绕过系统保护。本项属于 v1.0.9 发布后的维护增量，尚未重打公开安装包。详见 [`UX52_In_App_Default_Application_Management_Audit_2026-08-12.md`](./UX52_In_App_Default_Application_Management_Audit_2026-08-12.md)。

> **2026-08-11 v1.0.9 最终收口：** GitHub 托管运行 [`31495885209`](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/31495885209) 已完成官方 `v1.0.8 -> v1.0.9` 应用内更新，12/12 检查通过。测试脚本没有手动启动新版，更新助手自动拉起 v1.0.9 并确认进程持续存活；用户确认、官方 NSIS SHA-256、覆盖安装、最新版状态及覆盖/卸载后的合成资料保留均已验证。九份脱敏证据已导入 `docs/evidence/v1.0.9-managed-updater/`。社区版发布链已收口，接手后进入维护模式。

> **2026-08-11 v1.0.9 自动更新最终验收：** 已新增官方 `v1.0.8 -> v1.0.9` 托管 Windows 工作流，继续沿用会真实捕获旧版自动重启失败的测试边界。覆盖安装后脚本不会手动启动新版，必须等待更新助手拉起 `tauri-app.exe` 并确认进程持续存活；12 项检查全部通过后才允许收口。详见 [`V1_0_9_Managed_Updater_Lifecycle_Audit_2026-08-11.md`](./V1_0_9_Managed_Updater_Lifecycle_Audit_2026-08-11.md)。

> **2026-08-11 v1.0.9 已发布入口：** GitHub Release `368579987` 已公开，Tag 绑定通过候选门禁的提交 `7ed1defb967bc0521b100e5e6057c61aa8a5537f`。NSIS、MSI 与 `SHA256SUMS.txt` 已从远端重新下载，名称、大小和 SHA-256 全部与冻结候选一致。接手后只剩官方 `1.0.8 -> 1.0.9` 应用内更新 12/12 验收，重点确认更新助手自动拉起新版且进程持续存活。

> **2026-08-11 v1.0.9 发布候选入口：** 冻结产品提交 `8f668bc402ca45b4c621193ba5b65ece63de51a7` 的 Quality Gate `31489160736`、本地 EXE/MSI/NSIS 构建和 GitHub 托管安装生命周期 `31490343424` 均已通过。托管环境完成 22/22 生命周期与 18/18 安装态工作区检查；本机因已有 LongEdit 实例未运行候选或安装器。社区无签名候选现为 `ready-to-publish`，接手后先等待本证据提交的第二轮门禁，再发布并远端复核三个附件，最后执行官方 `1.0.8 -> 1.0.9` 自动更新重启验收。

> **2026-08-11 v1.0.9 恢复补丁准备：** 版本事实源开始提升到 `1.0.9`，范围只包含更新助手延迟启动、持续存活检查、失败重试和脱敏日志。v1.0.8 公开附件保持不变，README 明确其自动重启已被托管运行 `31486852139` 证实失败。接手后按质量门、冻结构建、安装生命周期、Release 远端复核和官方 `1.0.8 -> 1.0.9` 12/12 自动重启链完成。详见 [`V1_0_9_Unsigned_Community_Release_Audit_2026-08-11.md`](./V1_0_9_Unsigned_Community_Release_Audit_2026-08-11.md)。

> **2026-08-11 v1.0.8 自动更新真实失败：** 托管运行 `31486852139` 已证明官方 v1.0.7 能发现、确认、校验并覆盖安装 v1.0.8，但安装后十分钟内没有自动启动新版进程，因此流程在自动重启门禁失败。代码已改为延迟启动、检查新进程持续存活、失败重试并记录脱敏日志；因为已发布的 v1.0.8 二进制不可原地修改，下一步必须以 v1.0.9 重新打包发布，再验证官方 `1.0.8 -> 1.0.9` 12/12 更新链。详见 [`V1_0_8_Managed_Updater_Lifecycle_Audit_2026-08-11.md`](./V1_0_8_Managed_Updater_Lifecycle_Audit_2026-08-11.md)。

> **2026-08-11 v1.0.8 自动更新重启合同：** 已新增官方 `v1.0.7 -> v1.0.8` 一次性 Windows 更新流程。与上一版测试不同，覆盖安装后不再由脚本手动启动新版，而是等待更新助手自动拉起 `tauri-app.exe` 并连接其 WebView2；未自动重启将直接失败。接手后先等待本合同 Quality Gate，再运行 `V1.0.8 Managed Updater Lifecycle` 并导入 12 项检查证据。详见 [`V1_0_8_Managed_Updater_Lifecycle_Audit_2026-08-11.md`](./V1_0_8_Managed_Updater_Lifecycle_Audit_2026-08-11.md)。

> **2026-08-11 v1.0.8 已发布入口：** GitHub Release `368514584` 已公开，Tag 绑定通过门禁的候选证据提交 `090f228`。NSIS、MSI 与 `SHA256SUMS.txt` 已从远端重新下载，名称、大小和 SHA-256 全部与冻结候选一致；README 已切换到 v1.0.8。接手后只需在一次性 Windows 上完成官方 `1.0.7 -> 1.0.8` 应用内更新，重点确认安装后自动重启与资料保留，然后回写最终证据。详见 [`V1_0_8_Unsigned_Community_Release_Audit_2026-08-11.md`](./V1_0_8_Unsigned_Community_Release_Audit_2026-08-11.md)。

> **2026-08-11 v1.0.8 发布候选入口：** 冻结产品提交 `b963b2b3a9abe6d1b45bcd8c8fb8fd967e45f561` 的 Quality Gate `31478234776`、本地 EXE/MSI/NSIS 构建和 GitHub 托管安装生命周期 `31482508935` 均已通过。托管环境完成 22/22 生命周期与 18/18 安装态工作区检查；本机因已有 LongEdit 实例未执行候选或安装器。社区无签名候选现为 `ready-to-publish`，接手后先等待本证据提交的第二轮门禁，再发布并远端复核三个附件，最后执行官方 `1.0.7 -> 1.0.8` 自动更新重启观察。详见 [`V1_0_8_Unsigned_Community_Release_Audit_2026-08-11.md`](./V1_0_8_Unsigned_Community_Release_Audit_2026-08-11.md)。

> **2026-08-11 v1.0.8 发布准备：** 版本事实源已提升到 `1.0.8`，范围固定为代码/Web 文件主动创建、自动更新安装后重启和外部文件独立顶层窗口。README 保留 v1.0.7 有效下载并标出 v1.0.8 准备中。接手后依次完成本地与远端质量门、冻结提交构建 MSI/NSIS、安装态多窗口与自动重启复测、候选证据回写、GitHub Release 和 `1.0.7 -> 1.0.8` 更新观察。详见 [`V1_0_8_Unsigned_Community_Release_Audit_2026-08-11.md`](./V1_0_8_Unsigned_Community_Release_Audit_2026-08-11.md)。

> **2026-08-11 UX-51 发布阻断修复：** 自动更新现由隐藏助手等待 NSIS 完成并重新启动 Long编辑；系统或应用内外部打开会创建独立 `external-*` 顶层窗口，不再占用主资料库或增加内部标签。37 个外部编辑/预览格式已完成映射测试，真实 Tauri WebView2 同时保留主窗口、TXT 与 JSON 三窗口且零运行时错误。实现提交为 `a0a3ab3`，下一步等待 Quality Gate 后提升到 `1.0.8`、打包并执行安装态更新复测。详见 [`UX51_Updater_Relaunch_and_External_Window_Audit_2026-08-11.md`](./UX51_Updater_Relaunch_and_External_Window_Audit_2026-08-11.md)。

> **2026-08-11 CF-1 代码与 Web 源文件创建已验收：** JavaScript、TypeScript、Python、Rust、Go、Java/Kotlin、C/C++/C#、Shell/PowerShell、SQL 与 HTML/CSS/Vue 十个格式族已接入统一分层“新建”菜单，共覆盖 32 个注册后缀。前后端白名单、原子新建、重名不覆盖和非法扩展拒绝均通过；隔离 Tauri WebView2 又完成 8 项真实创建、保存前不落盘、显式保存、关闭重开和零阻断错误检查，5 张截图已视觉复核。CF-1 已收口，接手后只观察可复现回归或等待新的 Office/Excel 真实生产者证据。详见 [`CF1_Code_and_Web_Source_Creation_Audit_2026-08-11.md`](./CF1_Code_and_Web_Source_Creation_Audit_2026-08-11.md)。

> **2026-08-11 v1.0.7 最终收口：** GitHub 托管运行 [`31458701294`](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/31458701294) 已完成官方 `v1.0.6 -> v1.0.7` 应用内更新，11/11 检查通过；用户确认、NSIS SHA-256、同目录覆盖、升级首启、最新版状态及覆盖/卸载后的合成资料保留均已验证。九份脱敏证据已导入 `docs/evidence/v1.0.7-managed-updater/` 并受哈希门禁保护。当前版本在本机可执行范围内已收口；接手后先复核 Quality Gate，仅在出现可复现回归或新增真实生产者证据时继续开发。详见 [`V1_0_7_Managed_Updater_Lifecycle_Audit_2026-08-11.md`](./V1_0_7_Managed_Updater_Lifecycle_Audit_2026-08-11.md)。

> **2026-08-11 v1.0.7 更新观察合同：** 已新增独立的 `v1.0.6 -> v1.0.7` GitHub 托管受控更新链。它只下载两版官方 NSIS，要求用户确认、严格 SHA-256、同目录覆盖、首启最新版状态及覆盖/卸载后的合成资料保留；不会重建发布包，也不会接触本机 LongEdit。接手后先等待本合同提交的 Quality Gate，再运行 `V1.0.7 Managed Updater Lifecycle` 并导入证据。详见 [`V1_0_7_Managed_Updater_Lifecycle_Audit_2026-08-11.md`](./V1_0_7_Managed_Updater_Lifecycle_Audit_2026-08-11.md)。

> **2026-08-11 v1.0.7 已发布入口：** 冻结产品提交 `7cd90c52e024b1d0232277cb33c1eb9d74aeb3a1` 的质量门、本地 MSI/NSIS 构建和托管安装生命周期均通过；候选证据提交经修复证据字节属性后的 Quality Gate `31456635064` 也通过。GitHub Release `368323686` 已公开，Tag 绑定 `4612843`，NSIS、MSI 与 `SHA256SUMS.txt` 从远端重新下载后大小和 SHA-256 全部匹配。社区渠道已发布，企业签名候选仍为 false；接手后只需完成 `1.0.6 -> 1.0.7` 应用内更新观察。详见 [`V1_0_7_Unsigned_Community_Release_Audit_2026-08-11.md`](./V1_0_7_Unsigned_Community_Release_Audit_2026-08-11.md)。

> **2026-08-11 v1.0.7 发布候选入口：** 冻结产品提交 `7cd90c52e024b1d0232277cb33c1eb9d74aeb3a1` 的完整 Quality Gate（运行 `31452738912`）、本地 MSI/NSIS 构建及 GitHub 托管安装生命周期（运行 `31453750795`）均已通过。托管环境完成 22/22 生命周期和 18/18 安装态工作区检查；本机因已有 LongEdit 单实例运行，没有终止用户进程或执行安装器。社区无签名候选现为 `ready-to-publish`，企业签名候选仍为 false。接手后先等待本证据提交的远端门禁，再创建 `v1.0.7` Release、复核远端附件并更新 README；最后单独执行 `1.0.6 -> 1.0.7` 应用内更新观察。详见 [`V1_0_7_Unsigned_Community_Release_Audit_2026-08-11.md`](./V1_0_7_Unsigned_Community_Release_Audit_2026-08-11.md)。

> **2026-08-11 v1.0.7 发布候选准备：** 能力范围冻结后，package、Cargo、Tauri、Windows 生命周期、性能与能力事实源已开始同步到 `1.0.7`。README 保留已验证的 v1.0.6 下载并标出 v1.0.7 准备中；新增 Release Notes 与无签名社区发布审计。接手后按质量门、冻结提交、MSI/NSIS、托管安装生命周期、Release 远端复核和 `1.0.6 -> 1.0.7` 更新观察顺序完成，不再插入新能力。详见 [`V1_0_7_Unsigned_Community_Release_Audit_2026-08-11.md`](./V1_0_7_Unsigned_Community_Release_Audit_2026-08-11.md)。

> **2026-08-11 XLSX 知识索引与能力冻结：** XLSX 已进入资料库持久索引和实时回退搜索，按工作表索引缓存值并可从搜索结果直接定位；索引不执行公式、不刷新外部数据、不写源文件，并受文件、工作表、行列、单元格和字符预算约束。既定 Excel、新格式编辑器、主题预设与专业知识工作台需求已完成本机可执行范围冻结。接手后只进行最终补丁版本验收、README/Release Notes、安装包、GitHub Release 与更新链复测。详见 [`XLSX_Knowledge_Index_and_Capability_Freeze_Audit_2026-08-11.md`](./XLSX_Knowledge_Index_and_Capability_Freeze_Audit_2026-08-11.md)。

> **2026-08-11 XLSX 日期时间编辑增量：** 已有日期型单元格现支持规范 ISO 日期、日期时间和时间输入，统一进入草稿、撤销/重做、区域粘贴与显式保存链。后端使用真实日历校验，并按工作簿 1900/1904 日期系统转换 Excel 序列，保存后语义复读通过且原数字格式保持不变。普通空白格不做隐式日期猜测，ISO 持续时间和虚构日期 `1900-02-29` 继续只读。当前还剩 1 个能力与范围冻结阶段和 1 个最终版本验收阶段。详见 [`XLSX_Date_Time_Editing_Audit_2026-08-11.md`](./XLSX_Date_Time_Editing_Audit_2026-08-11.md)。

> **2026-08-11 XLSX 错误值编辑增量：** 七种可稳定复读的经典 Excel 错误值已进入显式单元格编辑、撤销/重做、批量粘贴、签名保护保存和 OOXML `t="e"` 语义复读链；`#GETTING_DATA`、动态数组错误和未知扩展错误继续阻断类型化写回。公共能力矩阵已从 `planned` 提升为 `limited`。当前还剩 2 个可执行能力阶段（日期时间编辑、复杂对象/新场景按需扩展）和 1 个最终版本验收阶段；三生产者数组写回仍等待外部证据，不计入本机可独立关闭阶段。详见 [`XLSX_Error_Value_Editing_Audit_2026-08-11.md`](./XLSX_Error_Value_Editing_Audit_2026-08-11.md)。

> **2026-08-11 v1.0.6 受控更新闭环：** GitHub 托管的一次性 Windows 已从官方 v1.0.5 通过应用内“下载并安装”升级到官方 v1.0.6。最终运行 `31406703253` 完成 11/11 检查：Release/NSIS SHA-256、显式确认、同目录覆盖、v1.0.6 首启、设置页“当前已是最新版本”、覆盖安装与卸载后的合成资料保留全部通过，三张截图已人工复核，证据位于 [`docs/evidence/v1.0.6-managed-updater`](./evidence/v1.0.6-managed-updater)。本机正在使用的 v1.0.5 全程未触碰。下一步恢复有界的 Excel/Office 等价能力、新格式编辑器和主题预设开发。

> **2026-08-10 v1.0.6 受控更新观察过程（已由上方闭环取代）：** 本机正在运行的 LongEdit 已核对为 v1.0.5，为避免关闭应用、覆盖安装或触碰用户资料，本阶段改用 GitHub 托管可丢弃 Windows。该段记录 runner 刚完成时的 `hosted-execution-pending` 历史状态，最终结论以上方 2026-08-11 入口和 [`V1_0_6_Managed_Updater_Lifecycle_Audit_2026-08-10.md`](./V1_0_6_Managed_Updater_Lifecycle_Audit_2026-08-10.md) 为准。

> **2026-08-10 v1.0.6 已发布入口：** 冻结产品提交 `9349c334b22753dacd0a58fad7f1ce55aa0bf6dc` 的质量门、本地 MSI/NSIS 构建和托管安装生命周期均通过；候选证据提交 `257c12e1795e9de2d5629e8053cbeaa1fb802cc8` 的 Quality Gate `31399100657` 也通过。GitHub Release `367990618` 已公开，Tag 绑定 `257c12e`，NSIS、MSI 与 `SHA256SUMS.txt` 从远端重新下载后大小和 SHA-256 全部匹配。社区渠道已发布，企业签名候选仍为 false；后续 `1.0.5 -> 1.0.6` 更新观察已由上方 2026-08-11 闭环补齐。详见 [`V1_0_6_Unsigned_Community_Release_Audit_2026-08-10.md`](./V1_0_6_Unsigned_Community_Release_Audit_2026-08-10.md)。

> **2026-08-10 v1.0.6 发布准备入口：** package、Cargo、Tauri 和现行发布事实源已提升到 `1.0.6`，本地 `ci:patch-release` 已通过，社区策略仍等待远端质量门与安装包证据；公开下载保持 `v1.0.5`。README 与 `RELEASE_NOTES_v1.0.6.md` 已对齐 EA-5C 的 29 类外部编辑、8 类外部预览、6 类显式转换，以及 37 类/85 扩展名逐项默认应用候选。接手后先等待远端 Quality Gate，再从冻结提交构建 MSI/NSIS、记录哈希、发布并执行 `1.0.5 -> 1.0.6` 受控更新观察。详见 [`V1_0_6_Unsigned_Community_Release_Audit_2026-08-10.md`](./V1_0_6_Unsigned_Community_Release_Audit_2026-08-10.md)。

> **2026-08-10 EA-5C 最新接手入口：** 外部打开与默认应用阶段已完成有界收口：43 类格式分为 29 类直接编辑、8 类只读预览、6 类显式转换；37 类/85 扩展名候选只由用户逐项触发。UX-01 至 UX-41 基础清单已全部回写为完成或有界完成，EA-5B2B 的 22 项生命周期与 18 项安装工作区证据已由 SHA-256 清单锁定。两个 GitHub 工作流已升级到 `actions/setup-node@v6`。下一步提升到 `1.0.6`，重写 README/Release Notes、构建并发布无签名 MSI/NSIS，再执行 `1.0.5 -> 1.0.6` 自动更新观察。详见 [`UX50T_External_Open_and_Experience_Closure_Audit_2026-08-10.md`](./UX50T_External_Open_and_Experience_Closure_Audit_2026-08-10.md)。

> **2026-08-10 EA-5B2B 最新接手入口：** GitHub 托管可丢弃 Windows 已对冻结产品提交 `328d16d` 完成真实 NSIS 生命周期，22 项安装/升级/卸载/回滚检查和 18 项安装产物工作区检查全部通过。用户主动选择的 OPML、PNG、AVIF 成为 LongEdit 候选，未选择的 JSON 未被接管；Unicode/空格路径冷启动、已有实例二次文件转交、默认值不变和卸载清理均通过。安装包仍为 `NotSigned`，只代表无签名内部安装态收口。下一步进入 EA-5C，汇总外部打开能力与总体验清单，再决定是否提升补丁版本并打包。详见 [`UX50S_Default_App_Installed_Lifecycle_Harness_Audit_2026-08-10.md`](./UX50S_Default_App_Installed_Lifecycle_Harness_Audit_2026-08-10.md)。

> **2026-08-07 EA-2B 最新接手入口：** JSON/JSONC、YAML、XML、SVG、TOML 已进入各自专用外部源码工作区；外部可编辑注册项增至 23 个。新增链路保持撤销重做、实时诊断、冲突保护和显式保存，通用外部文本写入不能绕过专用语法/安全门禁。安装器关联仍只有 Markdown。下一步进入 EA-3，审计非源码格式的外部预览、导入、系统打开和可靠写回边界。详见 [`UX50C_External_Structured_Source_Audit_2026-08-07.md`](./UX50C_External_Structured_Source_Audit_2026-08-07.md)。

> **2026-08-07 EA-2A 最新接手入口：** 外部文件工作区已从 Markdown/TXT 扩展到 17 类配置与代码格式；格式能力页逐格式公开外部打开状态，并把默认应用选择明确交给 Windows 和用户。安装器仍只登记 Markdown 的 OpenWith 候选，不会静默接管其他格式。下一步进入 EA-2B，为 JSON/YAML/XML/TOML/SVG 建立专用外部授权保存链路。详见 [`UX50B_External_Text_Code_Default_App_Audit_2026-08-07.md`](./UX50B_External_Text_Code_Default_App_Audit_2026-08-07.md)。

> **2026-08-04 历史入口：** v1.0.3 安装版真实多格式测试暴露了 ACL、更新策略、路由状态、工作区布局和跨格式编辑体验问题。该清单现已补齐为 UX-01 至 UX-41，并在 EA-5C 完成有界回写；下方历史阶段记录仅作为能力与证据背景。

> A0A 已完成安装态确认对话框 ACL 代码修复：主窗口补齐 confirm/message 权限，新增源码到能力清单的一致性检查并接入补丁发布门禁。A0A 完成时 UX-07、UX-11、UX-16 仍为开发中；当前状态以下方后续阶段和总验收清单为准。详见 [`A0A_Dialog_ACL_Hotfix_Audit_2026-08-04.md`](./A0A_Dialog_ACL_Hotfix_Audit_2026-08-04.md)。

> A0B 已完成更新体验与发布事实对齐：当前运行态不再自动请求未发布的 `latest.json`，设置页改为打开官方 GitHub Release 的手动更新入口，并同步修正共享发布策略与机器合同。UX-03 为待复测，下一安装包需验证外部浏览器打开行为。详见 [`A0B_Manual_Update_Experience_Audit_2026-08-04.md`](./A0B_Manual_Update_Experience_Audit_2026-08-04.md)。

> A0C 已完成设置子页返回与隐私诊断中文化：格式能力页现在识别设置来源，返回后重新定位格式能力项；隐私诊断入口、保存对话框及结果反馈已统一中文。UX-02、UX-04 为待复测。详见 [`A0C_Settings_Navigation_Localization_Audit_2026-08-04.md`](./A0C_Settings_Navigation_Localization_Audit_2026-08-04.md)。

> A0D 已完成设置页信息架构重构：八类任务导航替代单列长页，关系改善工具改为用户语言并折叠到知识能力高级区域，主题预设合并为可筛选、展示层去重的单一主题库。桌面 1366×768 与窄窗口 720×760 浏览器视觉复核通过；UX-01、UX-05、UX-06 为待安装包复测。详见 [`A0D_Settings_Information_Architecture_Audit_2026-08-04.md`](./A0D_Settings_Information_Architecture_Audit_2026-08-04.md)。

> A0E 已完成搜索与关联自动准备：首次选择资料库和缓存过期后由后台自动处理，用户状态、说明与更多菜单均改为任务语言；清除/隔离只作用于本机缓存并使用应用内确认框。UX-07 为待安装包复测。下一步按阶段 A 继续处理 UX-11 表格行删除交互与撤销。详见 [`A0E_Automatic_Search_Relation_Preparation_Audit_2026-08-04.md`](./A0E_Automatic_Search_Relation_Preparation_Audit_2026-08-04.md)。

> A0F 已完成 CSV/TSV/开放 Table 行交互止血：行号只选择，删除由明确命令和应用内确认触发；新增/删除行支持撤销重做，所有变更仅在点击保存后写入源文件。UX-11 为待安装包复测。下一步处理 UX-12，从图谱返回表格时等待资料库状态恢复并保持活动文件上下文。详见 [`A0F_Table_Row_Selection_Deletion_Undo_Audit_2026-08-04.md`](./A0F_Table_Row_Selection_Deletion_Undo_Audit_2026-08-04.md)。

> A0G 已完成资料库上下文与图谱返回修复：应用先恢复配置/标签再挂载路由，图谱返回和无路径资料库导航会补回活动文件；Table/Workbook 读取前等待配置，并以内存状态恢复滚动位置和 XLSX 活动 Sheet。UX-12 为待安装包复测。下一步处理 UX-19，保证 Markdown 首次打开和旧配置迁移后默认进入所见即所得。详见 [`A0G_Library_Context_and_Graph_Return_Audit_2026-08-04.md`](./A0G_Library_Context_and_Graph_Return_Audit_2026-08-04.md)。

> A0H 已完成 Markdown 默认模式迁移：新安装、旧配置和旧备份在没有用户显式选择标记时统一进入所见即所得；资料库与外部 Markdown 只在用户主动切换模式后持久化偏好。UX-19 为待安装包复测。下一步处理 UX-20，统一 Markdown 代码块、高亮文字、光标和选区的主题对比度。详见 [`A0H_Markdown_Wysiwyg_Default_Migration_Audit_2026-08-04.md`](./A0H_Markdown_Wysiwyg_Default_Migration_Audit_2026-08-04.md)。

> A0I 已完成 Markdown 代码主题对比度合同：九个应用主题统一代码块、语法色、光标和选区；资料库与外部 Markdown 的首次加载及实时主题切换共用兼容解析器。UX-20 为待安装包复测。下一步处理 UX-22，修复 TXT/LOG 编辑区被状态栏挤压的问题。详见 [`A0I_Markdown_Code_Theme_Contrast_Audit_2026-08-04.md`](./A0I_Markdown_Code_Theme_Contrast_Audit_2026-08-04.md)。

> A0J 已完成 TXT/LOG 工作区尺寸修复：具名 Grid 区域不再受标签栏显隐影响，正文稳定占据剩余高度，状态栏保持紧凑单行。UX-22 为待安装包复测。下一步处理 UX-23，修复窗口切换时外部修改误报。详见 [`A0J_Text_Workspace_Layout_Audit_2026-08-04.md`](./A0J_Text_Workspace_Layout_Audit_2026-08-04.md)。

> A0K 已完成外部修改检测重构：焦点恢复改用 Rust 内容摘要与精确文件身份，应用内保存采用写入回执更新基线；同一签名只提示一次，并提供比较、保留当前、重新加载。UX-23 为待安装包复测。下一步处理 UX-24/UX-27，统一代码编辑器主题与光标对比度。详见 [`A0K_External_Change_Identity_Audit_2026-08-04.md`](./A0K_External_Change_Identity_Audit_2026-08-04.md)。

> A0L 已完成 CodeMirror 主题合同：TXT/代码、JSON、YAML、XML、TOML 共用九主题语义配色，光标、选区、行号、搜索、括号、面板和提示层不再依赖默认值；自动门禁检查语法、行号和光标对比度。UX-24/UX-27 为待安装包复测。下一步处理 UX-25/UX-26/UX-28，收口 JSON Path 说明、大型树性能和结构化编辑器视觉。详见 [`A0L_CodeMirror_Theme_Contract_Audit_2026-08-04.md`](./A0L_CodeMirror_Theme_Contract_Audit_2026-08-04.md)。

> A0M 已完成 JSON 工作区收口：次要源码工具及结构诊断均可收起，字段路径改为用户任务语言并支持点击定位和明确复制反馈；大型树改用父子索引、按展开节点遍历和固定行高虚拟窗口，Rust 安全分析预算及点击保存写盘边界保持不变。UX-25/UX-26/UX-28 为待安装包复测。下一步处理 UX-29，为 LOG 建立专业查看与编辑双模式。详见 [`A0M_JSON_Workspace_Experience_Audit_2026-08-04.md`](./A0M_JSON_Workspace_Experience_Audit_2026-08-04.md)。

> A0N 已完成 LOG 专业工作区：查看模式继续使用范围读取、筛选、级别高亮、自动刷新和尾部跟随；8 MiB 以内可在明确确认影响后进入统一 CodeMirror 编辑器，支持撤销/重做且只有点击保存才写源文件。专用后端命令要求确认并以源签名拒绝并发覆盖，通用文本写入不能绕过。UX-29 为待安装包复测。下一步处理 UX-30，统一 HTML 与代码格式的专业编辑体验，并加入不执行危险脚本、不请求外部资源的安全网页预览。详见 [`A0N_Professional_Log_Viewer_Edit_Audit_2026-08-04.md`](./A0N_Professional_Log_Viewer_Edit_Audit_2026-08-04.md)。

> A0O 已完成 HTML/代码专业工作区：十类源码格式共用行号、语法高亮、括号匹配、自动缩进、有界关键字/标签/文档词补全和轻量诊断；HTML 默认源码，可切换到 DOM 净化、严格 CSP 与无权限 sandbox 三重隔离的安全预览。TextEditor 的历史自动保存已移除，编辑仅更新草稿，只有用户点击保存才以签名保护写盘。UX-30 为待安装包复测。下一步处理 UX-31，统一 YAML/XML/TOML 结构化源码工作区。详见 [`A0O_Code_and_Safe_HTML_Workspace_Audit_2026-08-04.md`](./A0O_Code_and_Safe_HTML_Workspace_Audit_2026-08-04.md)。

> A0P 已完成 YAML/XML/TOML 结构化源码工作区收口：侧栏使用面向任务的结构导航与问题语言，点击条目可定位源码；实时分析按源码规模自适应延迟，并串行追赶最新内容，避免连续编辑并发堆积。统一主题、响应式侧栏、Rust 诊断和显式保存边界保持不变。UX-31 为待安装包复测。下一步处理 UX-32，优化 XLSX 布局、冻结区域视觉和高级数据对象说明。详见 [`A0P_Structured_Source_Workspace_Audit_2026-08-04.md`](./A0P_Structured_Source_Workspace_Audit_2026-08-04.md)。

> A0Q 已完成 XLSX 工作区体验收口：默认占整行的高级对象摘要已移入“透视表与数据连接”工具栏入口，首层说明改为用户语言；主工具栏和 Sheet 标签更紧凑，入口在窄窗口保留可达。网格默认单元格、表头、行号与冻结区域改用不透明主题表面，冻结分隔保持清晰。UX-32 为待安装包复测。下一步处理 UX-33，推进 DOCX 页面式直接编辑与显式保存边界。详见 [`A0Q_Workbook_Workspace_Experience_Audit_2026-08-04.md`](./A0Q_Workbook_Workspace_Experience_Audit_2026-08-04.md)。

> A0R 已完成 UX-33A DOCX 直接保存基础：安全正文块可从页面点击定位并在内存草稿中即时预览；只有用户确认“保存到原文件”才会写盘。后端复核签名、源摘要和隔离输出，复用可靠替换并在落盘复读失败时恢复原字节；另存副本继续保留。UX-33 保持进行中，下一步 UX-33B 建设显式分页、多操作草稿与编辑工具栏。详见 [`A0R_DOCX_Direct_Source_Save_Audit_2026-08-04.md`](./A0R_DOCX_Direct_Source_Save_Audit_2026-08-04.md)。

> A0S 已完成 UX-33B DOCX 分页草稿工作面：显式/渲染分页符和节边界生成独立纸面，页面应用节宽高、方向和页边距；工具栏加入返回、撤销、重做、保存，未保存草稿离开时提供保存、放弃、继续编辑。当前仍是单目标可靠补丁，UX-33/UX-39 保持进行中。下一步 UX-33C 先证明批量补丁整体复读与回滚，再开放多目标草稿。详见 [`A0S_DOCX_Paged_Draft_Editing_Audit_2026-08-04.md`](./A0S_DOCX_Paged_Draft_Editing_Audit_2026-08-04.md)。

> A0T 已完成 UX-33C DOCX 批量补丁事务基础：2–32 个不同语义锚点按顺序通过单项门禁、最终语义复读和确定性整批重放；临时副本重开、源签名冲突、一次可靠覆盖及失败恢复均有三生产者回归。当前前端仍是单目标草稿，UX-33 保持进行中。下一步 UX-33D 接入多目标草稿、修改清单及整批验证/保存。详见 [`A0T_DOCX_Batch_Patch_Transaction_Audit_2026-08-04.md`](./A0T_DOCX_Batch_Patch_Transaction_Audit_2026-08-04.md)。

> A0U 已完成 UX-33D DOCX 多目标草稿工作面：跨页目标自动进入修改清单，语义锚点防止冲突操作，统一撤销/重做可恢复整份草稿；1 项沿用单项命令，2–32 项使用批量隔离验证与可靠覆盖保存。批量另存副本仍明确禁用，UX-33 保持进行中。下一步 UX-33E 补齐批量另存副本，再扩大安全对象覆盖并执行三生产者安装态复测。详见 [`A0U_DOCX_Multi_Target_Draft_Workspace_Audit_2026-08-04.md`](./A0U_DOCX_Multi_Target_Draft_Workspace_Audit_2026-08-04.md)。

> A0V 已完成 UX-33E DOCX 批量可靠另存副本：2–32 项草稿可写入不存在的新 DOCX，命令复核源签名与隔离摘要、确定性重放、目标落盘字节、结构/语义复读和源文件不变；失败时清理未验收副本，已有目标始终拒绝覆盖。Word/WPS/LibreOffice 三类 fixture 回归通过。UX-33 保持进行中，下一步 UX-33F 审计并扩大安全对象覆盖，随后进入安装态复测。详见 [`A0V_DOCX_Batch_Reliable_Copy_Save_Audit_2026-08-04.md`](./A0V_DOCX_Batch_Reliable_Copy_Save_Audit_2026-08-04.md)。

> A0W 已完成 UX-33F DOCX 安全字符格式扩展：单运行目标在粗体、斜体、下划线之外支持直接 RGB 字色和 8–72 磅字号，页面即时显示草稿效果，并完整接入撤销/重做、批量验证、覆盖及另存事务。主题色、字体族和跨部件对象继续只读；Word fixture 语义往返通过，WPS/LibreOffice fixture 因没有白名单单运行目标而保持只读。UX-33 保持进行中，下一步 UX-33G 审计正文内超链接标签等单部件候选，再进入安装态复测。详见 [`A0W_DOCX_Direct_Color_Font_Size_Audit_2026-08-04.md`](./A0W_DOCX_Direct_Color_Font_Size_Audit_2026-08-04.md)。

> A0X 已完成 UX-33G DOCX 简单超链接显示文字编辑：仅开放单段落、单链接、单运行、单文本节点且具有目标的白名单结构，界面明确提示地址保持不变；补丁只替换文本字节，语义复读核对链接载体，链接外壳、目标属性和其余部件保持不变。三生产者自动证据来自真实 fixture 的确定性派生链接包，不等同于原生超链接生产者证据。UX-33 保持进行中，下一步 UX-33H 收集原生样本并执行安装态复测。详见 [`A0X_DOCX_Hyperlink_Label_Edit_Audit_2026-08-04.md`](./A0X_DOCX_Hyperlink_Label_Edit_Audit_2026-08-04.md)。

> A0Y 已完成 UX-33H DOCX 原生超链接生产者审计：Word 与 LibreOffice 原生 `<w:hyperlink>` 各有 2 个简单标签可编辑、2 个复杂标签只读；WPS 原生输出 4 个 `HYPERLINK` 字段，全部按字段门禁只读。三款生产者均完成创建、保存、退出和新实例重开，fixture 摘要、机器合同及逐字节补丁回归已接入。UX-33 保持进行中，下一步 UX-33I 使用包含新代码的 LongEdit 桌面构建执行安装态/WebView 复测。详见 [`A0Y_DOCX_Native_Hyperlink_Producer_Audit_2026-08-04.md`](./A0Y_DOCX_Native_Hyperlink_Producer_Audit_2026-08-04.md)。

> A0Z 已完成 UX-33I DOCX 原生超链接桌面 WebView 审计：真实 Tauri Debug WebView2 中，Word/LibreOffice 各 2 个“链接文字”目标通过草稿、撤销/重做、隔离验证和保存边界检查；WPS 字段链接为 0 个编辑目标并保持只读。5 张截图及机器清单通过，三份源 fixture 和隔离副本字节未变。本步不是 MSI/NSIS 安装生命周期证据，UX-33 保持进行中；下一步 UX-33J 在可丢弃环境复测无签名内部安装包，不覆盖当前用户安装。详见 [`A0Z_DOCX_Hyperlink_Desktop_Audit_2026-08-04.md`](./A0Z_DOCX_Hyperlink_Desktop_Audit_2026-08-04.md)。

> A10 已完成 UX-33J 安装态执行器准备：GitHub 一次性 Windows 流水线已从冻结产品提交动态读取版本，不再锁死 `1.0.0`；安装后 WebView 烟测已接入 Word/WPS/LibreOffice 原生超链接 fixture、草稿撤销/重做、隔离验证、只读降级、安装器摘要和隐私净化路由。当前只证明 harness 就绪，尚未产生 `1.0.3` 的真实安装结论。下一步推送后以该提交触发 hosted lifecycle，回收证据再关闭 UX-33J。详见 [`A10_DOCX_Installed_Harness_Audit_2026-08-04.md`](./A10_DOCX_Installed_Harness_Audit_2026-08-04.md)。

> UX-33J 首次 hosted run `30897488050` 已构建 `22ac691` 的 `1.0.3` 无签名 NSIS，但旧 R5J 启动 hash 假设在 DOCX 检查前超时；不是 DOCX 功能失败。执行器现改为显式导航工作台。下一次运行复用 `30897488050` 安装器时，`product_ref` 必须保持 `22ac691`，以维持安装器源码绑定。

更新日期：2026-08-04
交接基线：当前发布版本 `v1.0.3`；日常管理、文本/开发格式、PDF 研究与页面管理、图表、Canvas/OPML 思维导图、知识图谱和现代 Office 基础工作面已经形成主干。当前仍为无 Authenticode 签名社区版，原自动更新私钥不可用，v1.0.3 不发布 `latest.json` 或 `.sig`，版本更新暂时通过 GitHub Release 手动下载安装。

> 最新接手入口：[`Current_Closure_Status_and_Packaging_Plan_2026-07-31.md`](./Current_Closure_Status_and_Packaging_Plan_2026-07-31.md)。当前先执行 E5 高级能力最终收口审计，随后构建并验证未签名 MSI/NSIS；真实签名、Windows 10/11 隔离发布矩阵与人工批准继续独立阻塞正式 RC，`releaseCandidate=false`。

> 2026-07-31 C1A 已完成：R5N 外部签名环境仍阻断时，知识图谱产品化继续向管理行动推进。现有关系新增/删除、来源证据和健康治理保持不变；图谱节点现在可按 1～4 层局部关系生成新的 Markdown 项目笔记，记录中心来源、关联资料、目标和任务，并自动进入现有搜索与首页待办。生成文件与中心对象同目录、同名递增且不覆盖，最多写入 100 个关联对象。下一本机阶段为 C1B 子图智能集合；P0 仍是 R5N 已签名 Windows 10/11 外部发布执行。详见 [`C1A_Graph_Project_Note_Audit_2026-07-31.md`](./C1A_Graph_Project_Note_Audit_2026-07-31.md)。

> 2026-07-31 C1B 已完成：Markdown/PDF 图谱中心可按 1～4 层保存为动态智能集合；集合使用知识库相对根路径，每次打开实时重建文件级子图，并已接入首页、Library 集合侧栏和文件关系上下文。管理备份可保留并在换机映射后恢复图谱集合。当前没有真实签名证书，R5N 保持 `releaseCandidate=false` 并转为未来外部执行项，不再阻塞本机产品收尾。下一本机阶段为 C1C 关系确认/隐藏/恢复，随后进入 D1 统一体验审计。详见 [`C1B_Dynamic_Graph_Collections_Audit_2026-07-31.md`](./C1B_Dynamic_Graph_Collections_Audit_2026-07-31.md)。

> 2026-07-31 C1C 已完成：共同标签推断关系可在文件关系上下文中确认、隐藏、改回推断和恢复；判断以知识库相对路径保存到 `.longedit/graph-relation-decisions.json`，不修改 Markdown。已确认关系会进入图谱和动态集合，并从孤立文件治理中移除；隐藏后影响立即撤销。显式链接与结构关系继续以原文件为事实源。C 阶段本机产品化主线已收口，下一步进入 D1 跨编辑器统一体验审计与集中修正。详见 [`C1C_Graph_Relation_Lifecycle_Audit_2026-07-31.md`](./C1C_Graph_Relation_Lifecycle_Audit_2026-07-31.md)。

> 2026-07-31 D1A 已完成：跨编辑器矩阵已建立，首批关闭 YAML/XML/TOML 的体验缺口。三个结构化源码编辑器共用响应式结构面板，桌面可收起，760px 以下默认保留完整源码空间并可一键切换结构/诊断；保存按钮统一为“保存中/保存/已保存”，状态支持辅助技术播报。安全保存和格式能力边界未改变。下一步进入 D1B，集中处理 JSON、Table、Diagram、Canvas、Workbook、PDF、DOCX、PPTX 的工具栏密度、只读/阻断提示和窄屏优先级。详见 [`D1A_Structured_Editor_Unified_Experience_Audit_2026-07-31.md`](./D1A_Structured_Editor_Unified_Experience_Audit_2026-07-31.md)。

> 2026-07-31 D1B 已完成：JSON、Table、Diagram、Canvas、Workbook 的保存入口统一为“保存中/保存/已保存”，动态状态支持辅助技术播报；PDF、DOCX、PPTX 的 sidecar、隔离验证、可靠副本、只读与阻断结果统一采用 status/alert 语义。Table 与 Diagram 在 620px 以下保持标题、核心模式和保存入口可用，Canvas 窄屏状态不再挤压工具栏。格式写入白名单和安全边界均未扩大。下一步进入 D1C 键盘焦点与关键流程可访问性收口，随后执行 D2 跨格式安全降级回归。详见 [`D1B_Complex_Workspace_Consistency_Audit_2026-07-31.md`](./D1B_Complex_Workspace_Consistency_Audit_2026-07-31.md)。

> 2026-07-31 D1C 已完成：JSON、Table、Diagram、Canvas、Workbook、PDF、DOCX、PPTX 的高频模式切换、图标按钮和关键弹层已完成键盘与控件语义收口。Table 视图删除改为独立可聚焦按钮；PDF 翻页、颜色和侧栏标签有稳定名称/状态；PPTX 放映层可接管并约束焦点，Esc/方向键/空格不重复触发，退出后返回放映按钮。新增 `check:d1c-accessibility-contract` 并接入总格式门禁。D1 统一体验阶段至此收口，但不宣称完整 WCAG 认证。下一步进入 D2 跨格式安全降级回归。详见 [`D1C_Keyboard_Focus_and_Accessibility_Audit_2026-07-31.md`](./D1C_Keyboard_Focus_and_Accessibility_Audit_2026-07-31.md)。

> 2026-07-31 D2 已完成：39 类注册格式全部且仅一次归入 6 条安全通道，统一覆盖签名保护覆盖、严格只读、PDF sidecar、Office 可靠新副本、外部应用交接和 XLSX 有界写回。新增 `shared/safe-degradation-contract.json` 与 `check:d2-safe-degradation-contract`，会核对格式注册表、发布矩阵、writer 边界以及冲突/失败/恢复实现证据，并已接入总格式门禁。本机 C、D1、D2 产品收尾主线至此完成，下一步为 D3 最终产品验收与能力冻结；R5N 正式签名和剩余外部生产者证据仍独立保持 fail-closed。详见 [`D2_Cross_Format_Safe_Degradation_Audit_2026-07-31.md`](./D2_Cross_Format_Safe_Degradation_Audit_2026-07-31.md)。

> 2026-07-31 D3 已完成：日常工作区、格式编辑与降级、知识组织、可视化/主题/可访问性、PDF、现代 Office 副本、XLSX 有界编辑、恢复隐私和性能回归共 9 个领域已汇总为 `shared/product-acceptance-freeze.json`。`check:d3-product-acceptance-freeze` 会验证 39 格式、10 发布配置、6 安全通道、真实证据文件及所有验收门禁从 `ci:check` 可达。基础产品状态为 `accepted-for-capability-freeze`，但 `releaseCandidate=false`；签名与外部生产者证据继续独立阻断。下一代码阶段为 E0，先审计完整 Excel 等价编辑、新格式编辑器和主题扩展的缺口、风险与优先级。详见 [`D3_Final_Product_Acceptance_and_Capability_Freeze_Audit_2026-07-31.md`](./D3_Final_Product_Acceptance_and_Capability_Freeze_Audit_2026-07-31.md)。

> 2026-07-31 E0 已完成：`shared/advanced-capability-roadmap.json` 已把高级开发拆为 Excel 等价 P0、新格式编辑器 P1、按场景主题扩展 P2、复杂 Office/WPS P2 四条轨道。Excel 当前 10 个公式族已验证，但数组生产者仍为 1/3、Multi-axis Pivot 为 2/3；下一代码阶段为 E1A 动态数组/spill 只读内存计算与预览，明确不写用户文件、不改公式缓存。SVG 为后续 E2A 候选，安全合同通过前不注册 writer。主题当前 3 核心 + 4 场景承诺已完成，后续不以数量代替场景证据。`releaseCandidate=false` 保持不变。详见 [`E0_Advanced_Editing_Gap_and_Priority_Audit_2026-07-31.md`](./E0_Advanced_Editing_Gap_and_Priority_Audit_2026-07-31.md)。

> 2026-07-31 E1A 已完成：`dynamicArrayPreviewContract` 已开放受限 `SEQUENCE` 动态数组内存预览，支持有限数字参数、直接 A1 数值依赖和未保存数值草稿，单次上限 10,000 个单元格；占用、外来公式、合并区域、越界、未知函数和复杂依赖均稳定阻断。该命令只读且受源签名保护，不写用户文件、公式缓存或数组声明。数组生产者 1/3 与 Multi-axis Pivot 2/3 状态不变，E1B/E1C 继续等待外部证据；下一代码阶段为 E2A SVG 安全合同与基础源码编辑器。详见 [`E1A_Dynamic_Array_In_Memory_Preview_Audit_2026-07-31.md`](./E1A_Dynamic_Array_In_Memory_Preview_Audit_2026-07-31.md)。

> 2026-07-30 权威入口：R1 统一发布能力矩阵与 R2 Windows 安装生命周期已完成。当前 MSI/NSIS 身份、Markdown 关联白名单、系统默认应用选择、旧标识迁移和卸载数据边界均有机器契约与真实桌面证据；实现提交 `032ec11` 的 [GitHub Quality Gate](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/30533681730) 已完整通过。`releaseCandidate=false`，下一代码阶段为 R3 索引恢复、备份导入导出与隐私净化诊断包；E1B WPS ODT 2/3 和 X3-B6 数组生产者 1/3 继续作为外部证据门禁。证据见 [`R2_Windows_Install_and_Lifecycle_Audit_2026-07-30.md`](./R2_Windows_Install_and_Lifecycle_Audit_2026-07-30.md)。

> 2026-07-30 R3A 已完成：知识索引状态新增 `recoveryAvailable` 和 `staleSourceCount`；损坏 `snapshot.json` 可在原缓存目录隔离为 `snapshot.corrupt.<timestamp>.json`，随后用户可显式重建索引。该步骤不读取、不导出、不打包知识库正文。当前距离“全格式支持和收口”还剩 R3B 备份导出、R3C 备份导入恢复、R3D 隐私诊断包、R4 正式签名/Windows VM 发布矩阵，以及外部证据门禁 E1B WPS ODT 3/3 和 X3-B6 数组生产者 3/3。下一代码阶段为 R3B，详见 [`R3A_Knowledge_Index_Recovery_Audit_2026-07-30.md`](./R3A_Knowledge_Index_Recovery_Audit_2026-07-30.md)。

> 2026-07-30 R3B 已完成：设置页新增管理备份导出，生成固定 ZIP：`manifest.json`、`config.redacted.json` 和三份能力/韧性合同。备份只包含脱敏配置、库清单摘要、路径/remote 指纹、保存搜索和能力合同；不包含文档正文、API Key、系统凭据、完整用户路径或缓存正文。当前剩余收口阶段为 R3C 备份导入恢复、R3D 隐私诊断包、R4 正式签名/Windows VM 发布矩阵，以及 E1B/X3-B6 两个外部证据门禁。下一代码阶段为 R3C，详见 [`R3B_Management_Backup_Export_Audit_2026-07-30.md`](./R3B_Management_Backup_Export_Audit_2026-07-30.md)。

> 最新基础桌面门禁基线为 36 项真实 Tauri 检查和 28 张截图；PPTX C3 结构化只读、三生产者输入、搜索定位、知识关系、索引生命周期和桌面视觉矩阵均已收口；C4D 已完成可靠新副本，C4E 已完成 PowerPoint/WPS/LibreOffice 对文本、样式、替代文本三个输出的真实复开。下文较早的逐批记录保留为历史证据，不应覆盖最新结论。

> 2026-07-28 审计及下文逐批记录保留为历史证据；当“下一步”描述冲突时，以本文件顶部链接的 2026-07-30 综合审计为准。项目已进入基础需求收口期，但尚不能宣称所有初始需求 100% 完成。

> 最新开发入口：X3-B1 已在原有右侧 XLSX 工作面加入数组/动态数组只读清单、范围定位、缓存覆盖提示和前后端写入保护；本地重算与行列结构迁移保持阻断。当前证据是确定性库生成样本，不能替代 Excel/WPS/LibreOffice 生产者验证。下一步为 X3-B2 三生产者差异矩阵与 spill 冲突只读诊断，详见 [`X3_B1_XLSX_Array_Formula_Readonly_Boundary_Audit_2026-07-30.md`](./X3_B1_XLSX_Array_Formula_Readonly_Boundary_Audit_2026-07-30.md)。

> X3-B2 最新检查点：spill 只读诊断已增加缓存完整度、序列化占用和外来公式冲突信号；WPS Spreadsheets `12.0/26895` 已完成真实打开、另存、应用退出、独立复开和 LongEdit 反向复读，生产者矩阵为 `partial 1/3`。Excel 与 LibreOffice 因本机环境缺失仍待补，能力继续标记为受限。详见 [`X3_B2_XLSX_Array_Producer_and_Spill_Diagnostic_Audit_2026-07-30.md`](./X3_B2_XLSX_Array_Producer_and_Spill_Diagnostic_Audit_2026-07-30.md)。

> X3-B3 已完成：数组公式诊断新增缓存值类型分布、错误缓存地址、具体冲突地址和一键定位；功能继续位于原有右侧 XLSX 工作面，没有新增独立页面。真实 Tauri 专业明/暗主题、1280/1024 视口共 10 项检查和 2 张截图通过，源 XLSX 字节不变。计算与数组写回仍阻断，生产者矩阵仍为 `partial 1/3`。下一代码阶段为 X3-B4 的可控冲突/错误 fixture 桌面定位闭环；外部环境到位时补齐 Excel/LibreOffice。详见 [`X3_B3_XLSX_Array_Cache_and_Conflict_Locator_Audit_2026-07-30.md`](./X3_B3_XLSX_Array_Cache_and_Conflict_Locator_Audit_2026-07-30.md)。

> X3-B4 已完成：基于 WPS 往返样本派生受控诊断 fixture，在真实 Tauri 专业明/暗主题中分别点击并定位外来公式冲突 `D3` 与标准错误缓存 `D4`；12 项检查、2 张截图通过，源字节不变。诊断总数保留，地址最多返回 256 个并在右侧工作面显式提示截断。生产者矩阵仍为 `partial 1/3`，数组计算与写回继续阻断。下一代码阶段为 X3-B5 的 Excel/LibreOffice 外部证据交接包。详见 [`X3_B4_XLSX_Array_Conflict_Desktop_Closure_Audit_2026-07-30.md`](./X3_B4_XLSX_Array_Conflict_Desktop_Closure_Audit_2026-07-30.md)。

> X3-B5 已完成：正版 Microsoft Excel 与 LibreOffice Calc 可在各自可信机器上对固定数组基线执行原生保存、退出、独立进程复开和 LongEdit 语义复读，并导出固定三成员证据包；导入端绑定基线摘要、生产者身份、生命周期、输出摘要和项目自身解析结果，拒绝覆盖既有证据。5/5 伪造/损坏包均确认不会修改矩阵、能力契约或创建目标；合法 TEMP 隔离包已验证可原子提升到 2/3。完整 `ci:check` 通过 Rust 功能测试 `383/383`、性能测试 `1/1`、PDF 100 MiB 范围基准约 `50 ms`，生产依赖审计为 `0` 漏洞。当前机器没有两套可信生产者，因此矩阵如实保持 `partial 1/3`，公开能力仍为只读受限，数组计算和写回继续阻断。详见 [`X3_B5_XLSX_Array_Producer_Evidence_Handoff_Audit_2026-07-30.md`](./X3_B5_XLSX_Array_Producer_Evidence_Handoff_Audit_2026-07-30.md)。

> X3-B6 已完成可执行收口：新增只读环境审计和 Excel+LibreOffice 双包矩阵级原子关闭器。两包先在 TEMP 中分别通过 B5 全门禁并形成隔离 `3/3`，随后才一次性提升四个 fixture/manifest、生产者矩阵与共享能力契约；第二包损坏时目标状态经自动化确认保持 `1/3`。完整 `ci:check` 通过 Rust `383/383`、性能 `1/1` 和 `0` 生产依赖漏洞。本机 Excel COM 仍指向 WPS `et.exe`，LibreOffice 缺失，因此没有登记虚假生产者证据，公开能力保持受限。详见 [`X3_B6_XLSX_Array_Producer_Matrix_Atomic_Closure_Audit_2026-07-30.md`](./X3_B6_XLSX_Array_Producer_Matrix_Atomic_Closure_Audit_2026-07-30.md)。

> 当前阶段交付证据见 `docs/E1B_ODT_Read_Index_Checkpoint_Audit_2026-07-28.md` 和 `docs/E1B_ODT_Producer_Gate_Progress_Audit_2026-07-28.md`。E1B 已完成有界语义解析、WorkspaceGuard 只读命令、Library 工作面、双索引和定位代码；LibreOffice 与 Microsoft Word 真实 fixture 已通过。Word 原阻塞已定位为 ODT 格式兼容性模态提示并完成受控保存、关闭和原生重开；WPS 缺少可验证的 ODF 组件并生成错误 OLE 文件。`.odt` 仍未进入共享格式注册表，下一批只关闭 WPS 生产者门禁。

> 2026-07-29 又完成 E1B Word/LibreOffice 真实 Tauri 桌面子门禁：正常/紧凑、专业明/暗、文内搜索、`odt-block` 路由定位和源字节不变共 8 项检查、4 张截图通过。证据见 `docs/E1B_ODT_Desktop_Evidence_Audit_2026-07-29.md`；该结果不改变 WPS blocked 和 `.odt` 未注册边界。

> 同日完成 WPS 关闭候选自动接入：桌面审计现在区分 `checkpoint` 与 `closure-candidate`，只有 WPS fixture/manifest 成对存在且原生保存、同生产者复开、隐私净化、大小和 SHA-256 全部匹配，才追加 WPS 明色搜索与暗色紧凑定位证据。详细合同见 `docs/E1B_WPS_Closure_Automation_Audit_2026-07-29.md`。

> E1A 完整 `ci:check` 通过 Rust 功能测试 `363/363`、性能测试 `1/1`，生产依赖审计为 `0` 漏洞；ODF 仍未进入产品格式注册表。

> E1B 生产者门禁 2/3 检查点完整 `ci:check` 通过 Rust 功能测试 `367/367`、性能测试 `1/1`，生产依赖审计为 `0` 漏洞；LibreOffice 与 Microsoft Word ODT 已通过真实解析和同生产者重开，WPS 单点阻断状态由 `shared/odt-read-contract.json` 固定。
> 实现提交 `4a2d009` 的 GitHub Quality Gate 已通过：<https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/30346127166>。

> A3R 专项真实桌面门禁为 8 项检查和 4 张截图；完整 `ci:check` 通过 Rust 功能测试 `354/354`、性能测试 `1/1`，生产依赖审计为 `0` 漏洞。

## 1. 新电脑快速恢复

### 环境要求

- Windows 10/11 x64
- Git 与 GitHub CLI（`gh auth login`）
- Node.js 与 npm；安装依赖时使用 `npm ci`
- Rust stable、Cargo，以及 Tauri 2 在 Windows 上需要的 WebView2 与 MSVC 构建工具

### 拉取与验证

```powershell
git clone https://github.com/Longyuyeee/Long_MarkDownReader.git
cd Long_MarkDownReader
git fetch --all --prune
git switch main
npm ci
npm run ci:check
npm run tauri -- build --debug --no-bundle
```

桌面端调试运行：

```powershell
npm run tauri -- dev
```

Debug 构建输出位于 `src-tauri/target/debug/tauri-app.exe`，该目录属于本机构建产物，不进入 Git。

## 2. 当前产品能力

- Markdown 编辑、双向链接、反向链接、标签、历史版本和 Git 同步。
- 全局/局部知识图谱、图谱健康检查、关系筛选、链接修复与图谱到 Canvas 转换。
- G8-1 已把关系数量、入链/出链、孤立风险和局部图谱入口放进默认工作台、当前文件和全文搜索结果。
- G8-2A 已提供跨工作面共享关系侧栏，显示事实/结构/规划/语义分类、方向、定位和原文证据；未提取格式明确降级。
- G8-2B 已补齐同标签、智能集合、30 秒/32 条会话缓存，并以真实 PDF、Table、Canvas 桌面对象验证统一侧栏。
- JSON Canvas 可视化编辑，以及 Markdown、文件、Mermaid、表格图表等节点。
- Mermaid Diagram Studio，支持结构化编辑、预览与 SVG/PNG 导出。
- CSV/TSV 和开放 `.table.json` 表格编辑、图表、仪表盘、Markdown/Canvas 嵌入。
- XLSX 多工作表预览、空白/已有基础单元格编辑、连续/多区域、TSV 剪贴板、基础样式、公式重算、行高列宽和合并/取消合并，支持冲突检测及 OOXML 局部可靠写回；可将工作表转换为开放表格。
- PDF 分段读取、阅读、标注、OCR sidecar、全文索引和图谱关系。
- PDF B0～B2C 已完成页面草稿、隔离验证、原子无覆盖另存、PDF.js 重开、复杂兼容矩阵、按范围提取、多文件有序合并和指定位置插页；对象流、页面继承和扫描页进入安全子集，高风险对象稳定阻断，仍禁止覆盖源文件或已有目标。
- API Key 使用 Windows 系统凭据存储；旧配置中的明文 Key 会一次性迁移并清除。
- YAML、XML、TOML、INI/CONF/CFG、Properties、`.editorconfig`、`.gitignore` 已进入统一管理与可靠基础编辑。
- `.env` 系列默认遮罩且后端排除全文索引/知识图谱；必须在当前文件显式确认后才能显示和编辑原值。
- 常见 JavaScript/TypeScript、Python、Rust、Go、Java/Kotlin、C/C++/C#、Shell/PowerShell、SQL 和 Web 源文件支持语法高亮、搜索与轻量可靠编辑，但不提供 IDE 执行、调试或语言服务。
- DOCX C1-2A 已接入共享注册、WorkspaceGuard 与有界 OOXML 解析；原 Library 右侧工作面支持标题、段落、列表、表格、样式/编号语义、受限内部图片预览、目录、文内搜索和高级对象兼容画像，原文件只读。
- DOCX C1-2A 已解析 `styles.xml`、`numbering.xml` 和内部文档关系；白名单图片经过单图 4 MiB、总量 12 MiB、32 张和文件签名门禁后可在原右侧工作面真实显示。
- DOCX C1-2B 已解析页眉、页脚、脚注、尾注、批注、合并单元格、分页和基础节版式，建立正文引用双向定位并接入全局索引；原件继续只读。
- C0-2A 已由 Microsoft Word `16.0.20131` 真实创建并保存版本化 DOCX，完成隐私匿名化、Word 只读重开、SHA-256 清单和 Rust 解析回归。
- C0-2B 已由 WPS Writer `12.1.0.26895` 真实创建项目自有 DOCX，完成定向隐私处理、安装实例标识清理、WPS 只读重开、SHA-256 清单和 Rust 解析回归。
- C0-2C 已由 LibreOffice Writer `26.2.4.2` 真实导出项目自有 DOCX，完成只读隐私/外链扫描、LibreOffice 重开、SHA-256 清单和 Rust 解析回归。
- C0-2 三生产者统一矩阵和独立 CI 门禁已完成，Word/WPS/LibreOffice 均为 `verified`；运行时保存准备报告不再包含生产者缺失 blocker，C0-2 进度为 3/3。
- C2A 已建立 `word/document.xml` 单部件隔离补丁、文件签名/部件摘要双门禁、未修改部件 raw-copy、包差异白名单、临时副本复读和源文件不变证明；没有保存命令或用户编辑入口；该阶段完成时 C2 进度为 1/5，当前进度见下方 C2B 条目。
- C2B 已为安全普通段落和标题建立目标清单、文本摘要握手、精确 `<w:t>` 字节补丁、XML 实体往返与写后语义复读；复杂载体保持只读，仍没有保存命令或 UI 编辑入口；该阶段完成时 C2 进度为 2/5，当前进度见下方 C2C 条目。
- C2C 已将安全列表项和单段落非合并表格单元格加入目标清单；表格目标绑定正文表格块及零基行列坐标，多段落、合并、续格、嵌套和复杂载体继续只读；该阶段完成时 C2 进度为 3/5。
- C2D 已为安全单运行文本增加粗体/斜体/单下划线隔离补丁，并为单个正文内嵌图片增加替代文本补丁；复杂运行、浮动图片和媒体二进制继续只读，C2 进度为 4/5。
- C2E0 当时增加只读保存准备报告，检查源签名、隔离输出摘要、目标占用、源覆盖和三类生产者证据；该历史阶段固定阻断且证明未尝试写入，阶段完成时 C2 为 4/5。
- C2E 已完成用户可见的文本/基础样式/图片替代文本单次编辑、摘要握手、原子无覆盖另存、落盘结构/语义复读和源字节复核；同一输出已由 Word、WPS、LibreOffice 复开，C2 进度为 5/5。
- C3A 已完成 PPTX 有界 OOXML 读取、幻灯片顺序、文本/图片/基础对象坐标、备注、搜索定位、兼容画像和只读放映；原件没有任何写回命令。
- C3D 已补齐 WPS Presentation 12.1 真实生成、隐私清理、原程序复开与 Rust 回读，PowerPoint/WPS/LibreOffice 矩阵达到 3/3；三尺寸、两主题桌面矩阵同时修复中窄屏备注隐藏和窄屏放映裁切，C3 只读阶段整体收口。
- C3B1 已接通 `slide -> layout -> master -> theme` 视觉继承链，解析页面背景、主题颜色/字体、对象填充/描边/旋转和基础文字样式，并由主舞台、缩略导航和只读放映消费；C3B 整体仍为部分完成。
- C3B2 已展开组合子对象并恢复组内坐标，解析图片裁剪/透明度和常用颜色变换；混合文本不再错误套用单一运行样式，而是带警告安全降级。该批完成时 C3B 仍为部分完成。
- C3B3 已完成连接线、自由形状、基础表格和复杂图形框架的分级只读呈现；主画布、缩略图和放映共用真实对象渲染组件。C3B 只读视觉实现已收口，C3 整体仍为部分完成。
- C3C1 已建立共享 PPTX 搜索段，覆盖文件名、幻灯片标题/正文、对象文本/替代文本/表格和备注；持久化索引与实时扫描消费同一生成器并通过真实 PowerPoint/LibreOffice fixture、结果一致性和源字节不变回归。注册表索引能力已提升为 `supported / pptx`，PPTX 仍严格只读。
- C3C2 已让 Library 搜索结果在右侧 PPTX 工作区精确定位幻灯片、对象和备注；支持缩略图滚动、对象持续高亮、备注面板、重复定位令牌和异步竞态仲裁。真实 Tauri 审计同时修复了 PPTX 阅读命令未注册 `WorkspaceGuard` 的装配错误。
- C3C3 已让 PPTX 文件和幻灯片进入统一 KnowledgeObject 与图谱快照，生成文件→幻灯片 `contains` 关系；当前幻灯片复用共享关系侧栏并可作为图谱中心，切换缩略图实时同步上下文，仍保持 Library 右侧内嵌与源文件只读。
- C3C4 已完成 PPTX 索引缺失、重建、过期、删除与源文件删除全生命周期回归；Library 可见过期状态并安全实时回退，资源上限和真实桌面搜索→关系→图谱→返回链路均已验证。C3C 整体收口。
- A5/G8/B0/B1A/B1B/B1C/C0/C1/C2E 已用真实 Tauri Debug/WebView2 自动化完成 36 项检查和 28 张证据图。

## 3. 后端结构

- `src-tauri/src/lib.rs`：仅保留 Tauri 应用装配、托盘/窗口事件、URI 协议与命令注册。
- `src-tauri/src/commands/`：按 AI、Canvas、配置、图表、文件、Git、图谱、历史、索引、PDF、搜索、系统、表格和工作簿拆分的 IPC 命令。
- `src-tauri/src/formats/`：Canvas、Diagram、Markdown、PDF 标注/OCR、开放表格格式适配与验证。
- `src-tauri/src/services/`：系统凭据、数据迁移、PDF 索引、可靠写入、`WorkspaceGuard` 和外部单文件授权状态。

FR-BASE-004 已验收：按项目既有统计口径，`lib.rs` 从 2,257 行降至当前 292 行，Rust 业务测试随模块放置。

## 4. 关键设计文档

- `docs/Product_Requirements_and_Development_Roadmap.md`：需求状态、验收标准和实施批次，是后续开发的主路线图。
- `docs/Professional_Knowledge_Workspace_Design.md`：产品定位、整体架构与专业管理系统设计。
- `docs/Open_Table_Format_Spec.md`：开放表格文件格式。
- `docs/Table_Chart_Reference_Spec.md`：图表引用和嵌入规范。
- `docs/XLSX_Compatibility_Boundary.md`：XLSX 能力边界。
- `docs/Workbook_Engine_Interface.md`：完整工作簿内核契约、能力矩阵和 XLSX fixture 门禁。
- `docs/Credential_Storage_Security.md`：凭据安全模型和迁移方式。
- `docs/Mermaid_Diagram_Workspace.md`：Diagram Studio 行为与兼容边界。
- `docs/Knowledge_Object_Relation_Contract.md`：统一图谱对象身份、定位、关系和格式适配边界。
- `docs/Local_Knowledge_Index_Contract.md`：可重建缓存、状态、失效、安全和规模边界。
- `docs/Professional_Workspace_Home.md`：默认工作台的数据来源、扫描边界和验收约束。
- `docs/Saved_Search_Collections.md`：智能集合的配置模型、动态求值和安全边界。
- `docs/Knowledge_Workspace_Health.md`：重复文件、未处理批注、扫描预算和只读治理边界。
- `docs/Workbook_Row_Column_Outline.md`：XLSX 行列隐藏、分组、可靠写回和保真边界。
- `docs/Workbook_Structure_Migration.md`：XLSX 行列插删的坐标、范围、公式迁移规则和预览边界。
- `docs/Formula_Calculation_Compatibility.md`：S8-6A～S8-6F 公式函数族、错误分类、查找/日期语义、真实 fixture 和明确排除项。
- `docs/XLSX_Advanced_Data_Object_Contract.md`：S8-7 高级对象离线策略、透视候选审计、内存聚合预览和写回门禁。
- `docs/T8_1B_Theme_Desktop_Visual_Audit.md`：四套场景主题、真实 Tauri 三档尺寸证据、图谱紧凑布局修复和可重复截图脚本。
- `docs/Development_Progress_Audit_2026-07-24.md`：当前完整候选能力、风险排序、发布门禁，以及合并后从 XLSX 专项收尾切换到统一文件管理 A0 主线的顺序。
- `docs/Development_Progress_and_Direction_Audit_2026-07-27.md`：当前 30 类格式/62 个扩展名的能力分层、原始需求对齐、关键缺口和 DOCX～发布矩阵退出条件；这是最新综合审计入口。
- `docs/Unified_File_Manager_Format_Requirements.md`：统一文件管理、常用格式阅读/基础编辑、安全保存和体系化管理的补充需求基线。
- `docs/Next_Development_Execution_Guide.md`：A0～A5、PDF 页面编辑、DOCX/PPTX 基础工作面和体系化管理增强的后续执行指导。
- `docs/C0_C1_DOCX_Structured_Reading_Audit_2026-07-27.md`：DOCX 首批结构化阅读、安全预算、兼容画像、桌面证据、明确边界和后续收口顺序。
- `docs/C1_2A_DOCX_Styles_Numbering_Media_Audit_2026-07-27.md`：DOCX 样式继承、列表编号、内部媒体关系、安全预览门禁和真实生产者缺口。
- `docs/C1_2B1_DOCX_Related_Content_Index_Audit_2026-07-27.md`：DOCX 附属内容、正文引用、全局索引、对象定位、安全预算和 C1-2B 剩余边界。
- `docs/C1_2B2_DOCX_Layout_Desktop_Audit_2026-07-27.md`：DOCX 合并单元格、分页、基础节版式、真实桌面证据和 C1-2B 收口判定。
- `docs/C0_2A_Microsoft_Word_Producer_Fixture_Audit_2026-07-27.md`：Microsoft Word 真实生产者环境、版本化 fixture、隐私匿名化、重开、哈希和解析回归。
- `docs/C0_2BC_DOCX_Producer_Matrix_Intake_Gate_Audit_2026-07-27.md`：Word/WPS/LibreOffice 三生产者统一状态、证据接入规则和防伪 CI 门禁。
- `docs/C0_2B_WPS_Writer_Producer_Fixture_Audit_2026-07-27.md`：WPS Writer 真实生产者环境、定向隐私处理、原程序重开、哈希与解析回归。
- `docs/C0_2C_LibreOffice_Writer_Producer_Fixture_Audit_2026-07-27.md`：LibreOffice Writer 真实生产者环境、可重复生成、隐私扫描、原程序重开、哈希与解析回归。
- `docs/A5_Desktop_Acceptance_Audit_2026-07-26.md`：阶段 A 桌面级收口、真实证据矩阵、能力边界和 G8 图谱产品化入口。
- `docs/Library_Right_Pane_Workspace_Audit_2026-07-26.md`：知识库内嵌/外部独立空间模式、视觉尺度和路由入口合同。
- `docs/Text_Editor_Architecture_Decision.md`：A2 TXT 编辑器选型、CodeMirror 6 职责边界、大文件策略和后续扩展约束。
- `docs/JSON_Editor_Architecture_Decision.md`：A3 JSON/JSONC 解析器、源码事实源、注释/重复键/高精度边界和分批开放门禁。
- `docs/C2A_DOCX_Isolated_Package_Patch_Audit_2026-07-27.md`：DOCX 单部件隔离补丁、包差异、临时副本重开和禁止原件写回边界。
- `docs/C2B_DOCX_Paragraph_Heading_Isolated_Edit_Audit_2026-07-27.md`：安全段落/标题目标枚举、精确文本补丁、语义复读和复杂对象拒绝边界。
- `docs/C2C_DOCX_List_Table_Isolated_Edit_Audit_2026-07-27.md`：安全列表项、表格行列坐标、单段落非合并门禁和写后坐标稳定性。
- `docs/C2D_DOCX_Style_Image_Isolated_Edit_Audit_2026-07-27.md`：基础字符样式、内嵌图片替代文本、复杂运行/浮动图片拒绝和媒体字节保真。
- `docs/C2E0_DOCX_Save_Readiness_Gate_Audit_2026-07-27.md`：DOCX 源冲突、目标占用、生产者证据缺口和不写入保存准备门禁。
- `docs/C2E_DOCX_Reliable_Save_Audit_2026-07-27.md`：DOCX 基础编辑副本、原子无覆盖创建、落盘复读、源文件保护和三生产者输出复开。
- `docs/C3A_PPTX_Structured_Readonly_Audit_2026-07-27.md`：PPTX 安全解析、结构化只读工作面、2/3 真实生产者矩阵、明确边界和 C3B～C3D 收口顺序。
- `docs/C3B1_PPTX_Theme_and_Basic_Style_Audit_2026-07-27.md`：PPTX 主题/母版/布局背景继承、基础对象与文字样式、真实 fixture 回归及 C3B2～C3D 退出条件。
- `docs/C3B2_PPTX_Group_Image_and_Color_Audit_2026-07-27.md`：PPTX 组合子对象/坐标、图片裁剪透明度、颜色变换、混合文本降级和 C3B3 后续边界。
- `docs/C3B3_PPTX_Object_Rendering_and_Thumbnail_Audit_2026-07-27.md`：PPTX 连接线/自由形状/基础表格、复杂对象分级卡面、共享对象渲染器、真实画布缩略图和 C3C/C3D 后续边界。
- `docs/C3C1_PPTX_Index_Core_Audit_2026-07-27.md`：PPTX 共享搜索段、持久化索引/实时扫描一致性、稳定定位元数据、源文件不变证明和 C3C2 入口。
- `docs/C3C2_PPTX_Precise_Locator_Audit_2026-07-27.md`：Library 内嵌搜索定位、幻灯片/对象/备注消费、重复令牌、请求级工作区守卫修复和真实桌面证据。
- `docs/C3C3_PPTX_Knowledge_Object_Relation_Audit_2026-07-27.md`：PPTX 文件/幻灯片对象、`contains` 关系、对象级共享关系侧栏、图谱回流和真实桌面证据。
- `docs/C3C4_PPTX_Index_Desktop_Closure_Audit_2026-07-27.md`：PPTX 索引完整生命周期、资源上限、过期可见状态、实时回退和真实桌面综合闭环。
- `docs/C3D_PPTX_Producer_and_Visual_Closure_Audit_2026-07-27.md`：WPS 真实生产者、三生产者矩阵、三尺寸/两主题桌面证据、中窄屏备注和全窗口放映修复。
- `docs/C4D_PPTX_Reliable_Save_Copy_Audit_2026-07-27.md`：PPTX 统一受限操作、原子无覆盖新副本、写后结构/语义复读、源文件保护和真实桌面重开证据。
- `docs/C4E_PPTX_Output_Producer_Reopen_Audit_2026-07-27.md`：三个真实输出副本、PowerPoint/WPS/LibreOffice 外部复开和 3/3 发布门禁。
- `docs/C5A1_PPTX_Isolated_Image_Replacement_Audit_2026-07-28.md`：单引用 PNG/JPEG 安全目标、单媒体部件隔离替换、可靠新副本、真实桌面证据和 C5A2 外部复开入口。
- `docs/C5A2_PPTX_Image_Output_Producer_Reopen_Audit_2026-07-28.md`：图片替换输出的 PowerPoint/WPS/LibreOffice 3/3 复开、目标图片解码和只读哈希证明。
- `docs/C5B_PPTX_Basic_Shape_Lifecycle_Audit_2026-07-28.md`：白名单基础形状新增/删除、可靠新副本、真实桌面证据和三生产者输出复开。
- `docs/Development_Progress_and_Direction_Audit_2026-07-27_C3B3.md`：C3B3 后总体进度、C3C 索引/定位/关系架构审计、C3D～C5 阶段拆分和后续格式方向。
- `docs/Development_Stage_Audit_2026-07-22.md`：当前阶段审计、设计对齐、Table 子阶段收尾和 Excel 等价后续七个主阶段。
- `docs/Development_Stage_Audit_2026-07-20.md`：上一轮专业工作区阶段审计和交错排期基线。

## 5. 验证基线

当前本地候选验证结果：

- A0 第一批：`shared/file-formats.json` 已升级到 schema v2；前端和 Rust 注册表均消费用户能力等级与保存模式；最长扩展名优先路由已覆盖 `.table.json` 等复合扩展名；Library 文件树、状态栏和保存入口已开始按能力模型展示与阻断。
- A1 第一批：新增 `src-tauri/src/formats/text.rs` 文本快照内核；通用文本读写现在保留编码、BOM、换行符和末尾换行，保存前校验读取签名并拒绝外部覆盖，Library 状态栏显示编码/BOM/换行快照。
- A1 第二批：后端已支持显式编码读取、显式编码/BOM/换行转换、GBK 中文 fixture、只读覆盖阻断和写后语义重读验证；前端编码选择入口、GB18030 更广 fixture、大文件范围读取和结构化错误仍是 A1 收口项。
- A1 收口批第一段：Library 文本工作面已提供编码菜单，可按 UTF-8/UTF-8 BOM/GBK/GB18030 重新读取或转换保存；读写调用分别传递 `readOptions` 与 `savePolicy`，并在每个标签记忆用户选择的读取编码。
- A1 收口批第二段：新增 `TextDocumentError` 结构化错误，读写命令返回稳定错误码、可恢复标记和建议；新增 GB18030 扩展汉字 fixture，前端错误提示会展示恢复建议。
- A1 收口批第三段：新增单次最大 1 MiB 的文本范围读取、多字节边界连续性测试和 `read_text_document_range` 命令；超过 20 MiB 完整编辑阈值时，Library 自动进入大文件只读预览，支持按需继续加载、按编码重读，并禁用保存与自动保存。
- A2 第一批：采用 CodeMirror 6 并新增独立 TXT 工作面；已接通行号、查找替换、跳行、撤销重做、编码/BOM/换行保存策略、外部签名冲突和 A1 大文件范围模式，选型边界见 `docs/Text_Editor_Architecture_Decision.md`。
- A2 第二批：已接通最近文件、系统文件选择/启动参数/单实例事件的外部 `.txt` 路由、外部 TXT 可靠读写，以及设置页和编辑器内可控制的 1.5 秒防抖自动保存；外部授权保持进程级，不把不可恢复授权的外部路径持久化为最近项。
- A2 第二批验证：生产构建通过，Rust 功能回归 `204/204` 通过，格式契约和 `cargo fmt --check` 通过，`npm audit --omit=dev` 为 0 个漏洞；真实 Tauri 系统打开、保存、重启证据仍按计划留给 A5。
- A2 最后一批：新增共享 `WorkspaceTabs.vue`，Markdown/TXT 统一切换和关闭；TXT 脏草稿及编码/签名/范围状态保存在内存标签，外部授权标签不跨重启；知识库切换、彻底退出和页面卸载统一检查未保存内容。
- A2 最后一批验证：生产构建、Vue 类型检查、格式契约和 Rust 功能回归 `204/204` 已通过；构建仅保留既有大分包警告。
- A3 第一批：普通 `.json/.jsonc` 已注册为只读源码预览，新增 CodeMirror JSON 工作面和 Rust `jsonc-parser` 权威诊断；`.table.json` 最长扩展名路由、JSON/JSONC 模式差异、重复键、高精度数字、结构统计和 Unicode 诊断跳转均有代码或契约保护。
- A3 第一批验证：生产构建、Vue 类型检查、格式契约和 Rust 功能回归通过，npm 正式源依赖审计为 0 个漏洞；构建仅保留既有大分包警告。
- A3 第二批：JSON/JSONC 已提升为基础源码编辑，支持 280 ms 实时 Rust 校验、共享标签内存草稿、`Ctrl+S`/全局保存、非法源码明确确认、读取签名冲突保护和可靠写后重读；通用文本写入无法绕过专用 JSON 语法门禁。
- A3 第二批验证：生产构建、Vue 类型检查、格式契约和 Rust 功能回归 `215/215` 通过；npm 正式源依赖审计为 0 个漏洞，构建仅保留既有大分包警告。
- A3 第三批：源码工作面新增搜索、全部折叠/展开、保真格式化/压缩，以及最多 20,000 节点的 JSON Path 目录、筛选、定位和复制；Rust 变换使用原始 token 切片，保留重复键、数字字面量、字符串转义、JSONC 注释和尾随逗号。
- A3 第三批验证：定向 Rust 回归 `15/15`、全量 Rust 功能回归 `220/220`、生产构建、Vue 类型检查、格式契约和 `cargo fmt --check` 通过；npm 正式源依赖审计为 0 个漏洞，构建仅保留既有大分包警告。
- A3 第四批：新增源码/树形双视图；树形预览消费 Rust AST 标签、深度、子项数与源码范围，支持逐节点/全部折叠、节点选择、原始源码复制、路径复制和源码定位，重复键不会在前端对象化后合并。
- A3 第四批验证：生产构建、Vue 类型检查和 JSON 定向 Rust 回归 `15/15` 通过；树形 DOM 设置 2,000 可见节点预算，结构修改继续禁用。
- A3 第五批：Rust 新增精确 AST 范围标量替换；树形视图可编辑字符串、数字、布尔值和 `null`，支持标量类型变化、陈旧草稿保护、单次撤销事务和替换后重新分析。重复键、精度敏感数字、容器和非法字面量继续阻断。
- A3 第五批验证：定向 Rust 回归 `20/20`、全量 Rust 功能回归 `225/225`、生产构建、Vue 类型检查、格式契约和 `cargo fmt --check` 通过；构建仅保留既有大分包警告。
- A3 第六批第一段：Rust 路径目录新增对象键精确范围，树形视图开放对象键重命名；新键由 Rust JSON 序列化器编码，支持 Unicode、转义与空键，保持值、空白、注释和尾随逗号不变。重复键、精度敏感数字、错位范围、陈旧草稿与超长键稳定阻断。
- A3 第六批第一段验证：JSON 定向 Rust 回归 `23/23`、全量 Rust 功能回归 `228/228`、生产构建、Vue 类型检查、格式契约和 `cargo fmt --check` 通过；构建仅保留既有大分包警告。
- A3 第六批第二段：Rust 新增对象属性尾部补丁，树形对象节点开放新增属性；支持空对象、紧凑/多行布局、JSONC 尾随逗号、Unicode/空键和任意可保真严格 JSON 值。尾部注释、重复键、错位范围、陈旧草稿、超长键和精度敏感值稳定阻断。
- A3 第六批第二段验证：JSON 定向 Rust 回归 `27/27`、全量 Rust 功能回归 `232/232`、生产构建、Vue 类型检查、格式契约和 `cargo fmt --check` 通过；构建仅保留既有大分包警告。
- A3 第六批第三段：Rust 新增数组项尾部补丁，树形数组节点开放追加项；支持空数组、紧凑/嵌套/多行布局、JSONC 尾随逗号和任意可保真严格 JSON 值。尾部注释、错位范围、陈旧草稿和精度敏感值稳定阻断。
- A3 第六批第三段验证：JSON 定向 Rust 回归 `31/31`、全量 Rust 功能回归 `236/236`、生产构建、Vue 类型检查、格式契约和 `cargo fmt --check` 通过；构建仅保留既有大分包警告。
- A3 第六批第四段：Rust 新增对象属性删除补丁，树形属性节点开放带确认删除；覆盖首项、中间项、末项、唯一属性和 JSONC 尾随逗号。目标两侧分隔符归属不明确、存在邻接注释、范围陈旧或文档有保真风险时稳定阻断。
- A3 第六批第四段验证：JSON 定向 Rust 回归 `35/35`、全量 Rust 功能回归 `240/240`、生产构建、Vue 类型检查、格式契约和 `cargo fmt --check` 通过；构建仅保留既有大分包警告。
- A3 第六批第五段：Rust 新增数组项删除补丁，分析结果提供权威数组索引，树形数组项开放带确认删除；覆盖首项、中间项、末项、唯一项和 JSONC 尾随逗号。目标两侧分隔符归属不明确、存在邻接注释、范围陈旧或文档有保真风险时稳定阻断。
- A3 第六批第五段验证：JSON 定向 Rust 回归 `39/39`、全量 Rust 功能回归 `244/244`、生产构建、Vue 类型检查、格式契约和 `cargo fmt --check` 通过；构建仅保留既有大分包警告。
- A4 第一批第一段：`.log` 已进入共享格式注册、文件树、统一标签路由和有界文本索引；独立只读工作面提供内容/级别筛选、时间与级别高亮、末尾范围、2 秒自动刷新、尾部跟随、轮转重载、512 KiB 单次读取和 4 MiB 显示缓冲上限。显式编辑仍为 `planned`，真实桌面刷新证据并入 A5。
- A4 第一批第一段验证：注册表定向 Rust 回归 `4/4`、全量 Rust 功能回归 `245/245`、生产构建、Vue 类型检查、格式契约和 `cargo fmt --check` 通过；格式契约覆盖 `11` 种格式和 `14` 个扩展名，构建仅保留既有大分包警告。
- 前端生产构建、主题/格式/工作簿/XLSX 发布契约检查均通过；工作簿契约已覆盖 S8-2A 的 Table 创建/调整入口、签名事务、包级往返、历史清理、重载与重算。
- Rust：S8-7E2F 后完整门禁为 367 项功能测试、1 项性能测试，全部通过；七类聚合及单行轴、单列轴、三度量共 10 个临时 Pivot 包完成结构、语义、输出值、输出样式和未触及部件复读，成功/阻断路径原文件字节保持不变。
- 本批完整性能回归通过：`inspect=249 ms / page=2,696 ms / patch=2,616 ms / total=5,562 ms`，未放宽 `10000x12` 负载、时间或 5% 文件增长约束。
- 当前完整门禁：367 项 Rust 功能测试、1 项性能测试、全部格式与证据合同、前端生产构建和 PDF 范围基准通过；生产依赖 0 漏洞。真实 Tauri 专项证据继续以各阶段固定清单为准。
- `npm audit --omit=dev`：0 个漏洞。

Vite 仍会提示少数 Mermaid/UI 分包压缩后超过 500 KiB；这是性能优化项，不是构建失败。

## 6. 下一阶段顺序

当前代码顺序：**R2 Windows 安装与生命周期边界**。R1 统一发布能力矩阵已完成；E1B WPS ODT 生产者与 X3-B6 数组生产者属于并行外部证据门禁，不得伪造关闭。高风险交换格式继续只生成可靠新副本。

2026-07-29 已完成 E1B WPS ODF 环境门禁加固：`scripts/audit-e1b-wps-odf-environment.ps1` 以隔离 `SaveAs2(..., 23)` 探测固定 WPS `12.1.0.26895` 的 0 个文件转换器、0 个 ODF 组件和 OLE 复合文档输出；证据为 `fixtures/odt/producers/wps-writer-blocker.json`。fixture 生成器现在先做强制预检并在净化前后验证 ODT ZIP，阻断时无无效 fixture 或临时目录残留。E1B 仍为 2/3，`.odt` 仍未注册；详细审计见 `docs/E1B_WPS_ODF_Environment_Gate_Audit_2026-07-29.md`。

2026-07-29 已完成 E1B 当前可执行桌面证据：`npm.cmd run audit:e1b-odt-desktop` 使用 `tauri.e2e.conf.json` 在隔离工作区驱动真实 WebView2，Word/LibreOffice 的两档布局、两套专业主题、搜索和精确定位均通过，清单为 `docs/evidence/e1b-odt-desktop/audit-manifest.json`。下一步只在可信 WPS ODF 环境到位后生成 WPS fixture、补录 WPS 桌面场景、达到 3/3 后登记 `.odt` 为 `preview-only`。

WPS 桌面补录代码已准备完成：真实 `wps-writer.odt` 到位后，同一命令会自动验证 manifest/SHA-256 并生成三生产者 6 场景 `closure-candidate` 清单，无需再手工改桌面脚本。当前仍不得把“自动化就绪”写成“WPS 已通过”。

以下内容是 2026-07-24 的历史阶段记录，用于追溯实现，不再代表当前暂停点。

2026-07-24 暂停点状态、质量证据、风险和逐批退出条件见 `docs/Development_Pause_Audit_2026-07-24.md`；当时的综合审计见 `docs/Development_Progress_Audit_2026-07-24.md`，上一轮细节见 `docs/Development_Progress_Audit_2026-07-23.md`，历史阶段拆分依据见 `docs/Development_Stage_Audit_2026-07-22.md`。这些文档记录的是 A4 开始前的历史状态；A4/A5、G8、PDF B0～B1C、DOCX C1-2A 和 S8-7E2F 后续均已完成，不得再把历史暂停点当作当前恢复点。X2～X5 / S8-7 后续～S8-8 继续保留为 XLSX 专项队列。

当前 `v0.7.0` 基线已完成知识库文件树的创建、移动、重命名、删除、排序、扫描和状态读取路径守卫，并修复旧 API Key 迁移失败丢失及远程 HTTP 传输风险。

1. 完成 FR-BASE-001/007：拖拽导入现由 Rust 系统事件授权；历史缓存区分知识库与外部文档；图片读取要求被当前 Markdown 精确引用。下一批继续审计少量平台和导出命令。
2. FR-INDEX-004/FR-FORMAT-001 已完成：前后端消费 `shared/file-formats.json`，创建、打开、工作区扫描、外部授权和索引均由能力与适配器契约分派；`.txt` fixture 证明同类格式扩展不再修改根级白名单。
3. FR-DATA-009 的 S6-11、S8-2A～S8-4D4 已完成冻结窗格、数据视图、普通 Table、基础排序筛选、命名区域、数据验证、受限条件格式，以及标准双单元格锚点绘图对象、已有标准图表标题/内部一维系列引用编辑、基础图表生命周期、标准单轴坐标轴标题、图例位置、系列显示名、基础图表级数据标签和有限直接 RGB 系列颜色；工作面可从连续选区创建柱形/折线/饼图/散点图、安全删除、受限切换类型并编辑安全表达子集。本地预览已消费轴标题、图例方位和系列颜色。四类图表真实 fixture、命令往返和 Tauri 保存重开证据见 `S8_4D4_Chart_Desktop_Visual_Audit.md`。单点/绝对锚点、复杂组合图、逐点/自定义标签、高级主题色语义、高级轴格式和高级筛选仍未开放，边界见 `XLSX_Public_Compatibility_Matrix.md`。
4. T7-1 已完成：唯一主题注册表、专业浅色/深色/高对比预设、统一持久化、编辑器/图表消费者与结构门禁已交付；视觉矩阵见 `docs/Theme_Preset_Contract_and_Visual_Matrix.md`。
5. F7-2 已完成：OPML 树形/思维导图双视图、拖拽层级、折叠、搜索、撤销重做、可靠往返、语义索引和 Canvas 投影已交付；兼容边界见 `docs/OPML_Mind_Map_Editor_Design.md`。
6. G7-2 已完成：全局图谱节点详情可直接建立和删除七类语义关系，关系可靠写入 Markdown Frontmatter；路径、关系类型、内容签名、删除证据和原子写入均由后端验证。
7. FR-DATA-009 的 S6-12 已完成：读取图表/图片关系、锚点、标题和系列来源，工作面提供结构卡片与定位；对象编辑和像素级渲染仍未开放，单元格写回通过 Drawing/Chart/媒体逐字节保真门禁。
8. FR-DATA-009 的 S6-13 已完成：透视表、切片器、外部链接和数据连接进入脱敏结构清单；外部目标不跟随，敏感连接内容不进入 IPC，刷新/计算/交互编辑仍未开放。
9. FR-DATA-009 的 S6-14 与 S8-5A～S8-5C 已完成：打印区域、页面设置、页眉页脚、打印选项与保护状态进入结构化摘要；单连续打印区域、纵横方向、五种常用纸张、百分比/适页缩放、六项页边距、奇偶页/首页六个标准页眉页脚文本和四个标准标志，以及网格线、行列标题、居中、黑白、草稿和首页页码可安全编辑。保护材料不进入 IPC，受保护 Sheet 写回整批拒绝，打印预览、图片型页眉页脚和解锁仍未开放。
10. FR-DATA-009 的 S6-15 已完成：复杂 fixture 全包差异白名单、10,000×12 性能预算和机器发布档案进入 CI；总体 XLSX 往返仍为计划，不宣传完整 Excel 等价。
11. G7-3 已完成：OPML 主题、Canvas 节点、PDF 批注和 Table 视图成为可寻址图谱对象，跨格式结构关系与精确打开链路已交付。
12. I7-1 已完成：版本化本地快照支持状态、进度、源签名失效、显式重建和删除，用户文件继续作为唯一事实源。
13. I7-2 已完成：跨格式全文搜索优先消费有效快照，保留 PDF 正文页、OCR 页和批注定位，并在旧、缺失、损坏或过期时实时扫描降级。
14. W7-1 已完成：默认专业工作台聚合收藏、最近、待办、常用 Canvas、图谱健康和索引状态；概览扫描受格式注册表、路径守卫、条目数和文件大小约束。
15. W7-2 已完成：跨格式查询和格式过滤器可保存为设备级智能集合，从侧栏或工作台重开时动态求值；Rust 后端限制数量、长度、格式与知识库归属。
16. W7-3 已完成：治理队列汇总精确重复文件和未进入 Markdown 引用的 PDF 批注；结果只读、可回到源对象，扫描具有明确条目、文件、哈希和结果上限。
17. S8-1A 已完成：整行整列支持隐藏、取消隐藏和 0–7 级大纲分组；独立结构事务保留宽高和其他属性，旧签名、越界层级及受保护 Sheet 整批拒绝。
18. S8-1B1 已完成：独立迁移内核和 Tauri 预览命令支持行列插删后的绝对/相对 A1 引用、范围扩缩、跨 Sheet 判定、整行整列范围和 `#REF!`；当前不修改 XLSX。
19. S8-1B2A 已完成：普通目标 Sheet 的整行插删包级事务覆盖行、单元格、维度、跨 Sheet 公式和定义名称，旧签名及复杂目标载体整批拒绝；当前仅提供后端命令。
20. S8-1B2B1 已完成：工作表 XML 内的合并、验证、筛选、冻结、选择状态、条件格式和超链接随整行插删迁移。
21. S8-1B2B2 已完成：Table、图表公式、Drawing 行锚点和计算链进入包级迁移；完整范围对象可删除并同步父节点计数，完整 Table 删除及高风险对象仍明确拒绝。
22. S8-1B3 已完成：整行插入/删除已接入连续整行选择和签名保护事务；脏草稿、保护 Sheet 和删除确认形成前端防线，成功后清空旧坐标历史、重载分页、恢复选区并重算已加载公式。
23. S8-1C 已完成：整列插入/删除复用轴向迁移内核和签名保护事务，覆盖列定义、冻结列、工作表范围载体、Chart/Drawing/计算链关系与前端提交后恢复；Table 列数变化和活动筛选条件继续明确拒绝。
24. S8-2A 已完成：普通 Excel Table 支持从连续选区创建、范围扩缩和表头列同步；事务维护 Sheet 引用、关系、内容类型与 Table 部件，并拒绝活动筛选、汇总行、计算列及扩展元数据。
25. S8-2B 已完成：Table 改名、内置样式与首列/末列/行列条纹选项，以及转换为普通区域/删除 Table 定义已接入工作面；包级事务维护名称唯一性、Sheet 引用、关系、内容类型和 Table 部件，结构化引用及复杂 Table 元数据继续明确拒绝。
26. S8-2C 已完成：Table 与工作表 AutoFilter 支持单列包含筛选、单列升降序状态和清除条件；重载恢复同一数据视图，高级/多列条件只读且覆盖操作拒绝，明确确认后可清除。
27. S8-3A 已完成：名称框支持创建、更新引用、改名和删除工作簿级/Sheet 级安全单一 A1 命名区域；事务校验名称、作用域、结构保护、内容签名与 OOXML 包，隐藏/系统名称只读，被公式引用的名称拒绝改名或删除。
28. S8-3B 已完成：连续选区支持创建列表、整数、小数、文本长度和自定义公式数据验证，已有规则可编辑、重新应用选区或删除；事务校验签名、Sheet 保护、范围重叠、外部引用、复杂扩展与 OOXML 包，公式规则仅写入保真而不伪执行。
29. S8-3C1 已完成：基础数值 `cellIs` 条件格式支持读取、视觉执行、创建、编辑、重新应用范围和删除；复杂规则可见、只读并保真，事务维护 DXF、优先级、签名保护与包验证。
30. S8-3C2A 已完成：直接 A1 引用与数字/文本/布尔字面量比较支持相对/绝对引用迁移、视觉执行和安全编辑；函数、区域、跨 Sheet 与复合表达式只读保真。
31. S8-3C2B1 已完成：固定数值双色/三色色阶支持 RGB 插值、创建、编辑、范围重应用和删除；动态阈值只读，色阶写回不修改 DXF 样式部件。
32. S8-3C2B2 已完成：后端完整范围统计解析 min/max、百分比和百分位阈值，返回解析值供分页工作面可靠渲染；公式阈值只读并设有规则数/样本数上限。
33. S8-3C2C1 已完成：标准 OOXML 非负固定阈值数据条支持读取、渲染、创建、编辑、范围重应用和删除；颜色、数值显隐、条长及 DXF 不变进入回归，并修复 `x14:` 扩展节点误解析。
34. S8-3C2C2 已完成：数据条支持 min/max/percent/percentile 完整范围解析、负数固定阈值及跨零自动轴渲染；`x14:` 负值颜色、方向和边框等高级样式继续只读保真。
35. S8-3C2D 已完成：Excel 2007 标准 3/4/5 图标集支持完整范围阈值解析、渲染、创建、编辑、重新应用范围和删除；反向、仅图标和严格阈值进入回归，自定义混合图标、公式阈值与 `x14:` 专属图标族只读保真。
36. S8-3C3A 已完成：当前单元格可切换查看多条命中规则、显示冲突顺序并提高/降低可编辑规则的全 Sheet 优先级；基础规则可编辑 `stopIfTrue`，优先级事务只改写属性并保留公式、DXF 与只读复杂规则。
37. S8-3C3B 已完成：`groupIndex + ruleIndex` 精确寻址同范围多规则组，受支持规则可逐条编辑、删除和排序；兄弟规则及未知事件原样保留，共享范围禁止被单条规则隐式改变。
38. S8-3C3C1 已完成：共享规则可显式拆分到当前选区，独立同范围规则可重新组合；事务直接迁移原始 `cfRule` 事件，不重建公式、样式、优先级或 DXF。
39. S8-3C3C2 已完成：安全表达式支持有界 `AND/OR/NOT`、多 A1 引用、短路求值和依赖分页预取；区域、跨 Sheet、未知函数及超限公式只读保真。
40. S8-4A 已完成：建立绘图对象稳定身份和选择状态；标准双单元格锚点支持名称/替代文本编辑与按选区移动/缩放，写入受签名、保护和包校验约束。
41. S8-4B 已完成：已有标准标题和内部一维公式系列引用可安全编辑，旧系列缓存会移除；工作面按真实源单元格生成统一组件本地预览。
42. S8-4C 已完成：连续选区可创建柱形/折线/饼图/散点图，支持安全删除与标准结构间受限类型切换；图表模板和选区系列建模已抽离到 `workbook_chart`。
43. S8-4D1 已完成：标准单轴柱形/条形/折线/散点图可编辑分类轴与数值轴标题，标准安全图表可设置左/右/上/下/右上图例或隐藏；复杂、多轴和扩展图表只读。
44. 复杂工作簿写回性能阻断已关闭：选择性解压、XML 后缀保真、未修改 ZIP 部件原始复制和受控压缩使 `patch` 恢复至约 5.26 秒，完整 `ci:check` 通过。
45. 完善 FR-BASE-005：增加真实 Tauri 图表创建、保存、重开 E2E 和视觉矩阵。
46. S8-4D2 已完成：标准安全图表可编辑系列显示名和基础图表级数值/分类名/系列名标签，饼图额外支持百分比；高级逐点标签只读，本地预览同步低密度标签。
47. S8-4D3 已完成：标准安全系列可写回统一直接 RGB 填充/线条颜色；工作面提供当前主题 6 色板与 RGB 取色器，本地预览同步轴标题、图例方位和系列颜色；高级系列样式继续只读。
48. S8-4D4 已完成：柱形、折线、饼图和散点图具备真实 XLSX fixture、命令边界往返、专业浅色四类截图、专业深色/高对比代表场景，以及真实 Tauri 编辑、保存、进程重启和重开证据。
49. S8-5A 已完成：当前连续选区可设为或清除打印区域；页面设置面板支持方向、Letter/Legal/A3/A4/A5、百分比/适页缩放和六项页边距；事务具备签名、保护、包校验、语义重读与真实 Tauri 保存验证。
50. S8-5B 已完成：独立页眉页脚面板支持奇数页、偶数页和首页六个标准文本及四个标准标志；每字段限制 255 字符，覆盖特殊字符、字段代码、清空、超长拒绝、保护拒绝、包校验和语义重读。
51. S8-5C 已完成：独立打印选项面板支持网格线、行列标题、水平/垂直居中、黑白、草稿和 1–32767 可选首页页码；事务覆盖创建、更新、清除、保护拒绝、包校验和语义重读，页面阶段收尾。
52. S8-6A 已完成：机器清单固定 IronCalc 版本和显式内存重算模式；真实 XLSX 验证聚合、数学、逻辑、文本四族 16 个函数，以及除零、依赖错误传播、`IFERROR` 恢复、未知函数和稳定错误分类；命令边界与 workbook contract 已纳入门禁。
53. S8-6B 已完成：真实矩阵新增条件聚合和查找数据 Sheet，验证 `SUMIF/COUNTIF/AVERAGEIF` 与 `VLOOKUP/HLOOKUP/INDEX/MATCH` 的精确/升序近似匹配、通配条件、文本结果保型、`#N/A` 和恢复路径；机器清单扩展为六族 23 个函数。
54. S8-6C 已完成：真实矩阵新增多条件聚合和日期场景，验证 `SUMIFS/COUNTIFS/AVERAGEIFS` 与 `DATE/YEAR/MONTH/DAY` 的多条件、无匹配、Excel 1900 日期序列、闰年和错误传播；机器清单扩展为八族 30 个函数、41 个场景。尺寸不一致的 `*IFS` 范围因依赖行为不等价而明确排除。
55. S8-6 后续拆为 S8-6D 现代查找/引用与 S8-6E 数组、溢出、易失函数、外部引用分级验收；之后进入 S8-7 高级数据对象和 S8-8 发布审计。
56. S8-6D 已完成：`XLOOKUP` 进入第九个已验证函数族，真实矩阵扩展为 31 个函数、50 个场景；覆盖精确/近似、跨 Sheet、行向量、反向、通配、缺省值、`#N/A`、`IFERROR`、文本保型和草稿依赖重算。IronCalc 0.7.1 未实现 `XMATCH`，数组返回/溢出结果也未进入合同。
57. S8-6E 已完成：显式内存重算开放 `OFFSET/INDIRECT/RAND/RANDBETWEEN/TODAY/NOW`，机器清单扩展为十族 37 个函数、56 个场景；数组/动态数组在计算前安全拒绝，外部工作簿链接保持离线拒绝，源公式、缓存和包保真不受影响。S8-6 公式语义阶段收尾，下一步进入 S8-7。
58. S8-7A 已完成：新增高级对象机器合同、后端汇总/权威离线策略和工作簿专业审计面板；四类对象可查看安全元数据，本地对象可定位，刷新、编辑、外部跟随和敏感字段暴露继续禁止。下一步进入 S8-7B。
59. S8-7B 已完成：本地透视表可审计输出布局、缓存字段/类型、Cache Records、字段角色和聚合；真实 fixture 与命令边界验证 `candidate_for_rebuild`，未知或不完整结构返回稳定阻断原因。刷新和写回仍禁止，下一步进入 S8-7C 内存聚合预览。
60. S8-7C 已完成：候选本地透视表可从当前工作表值和未保存非公式草稿生成内存聚合预览；七种聚合、带类型分组、资源上限、签名冲突和文件字节不变已进入回归。工作表、Pivot Cache、透视定义和原文件均不写入，下一步进入 S8-7D 写回可行性审计。
61. S8-7D 已完成：逐对象核对 Pivot Field items、`rowItems/colItems`、页面筛选和输出区域单元格，返回 `blocked/structure_candidate` 与稳定阻断原因；两种状态均不允许写回。当前兼容 fixture 因缺少字段项、行列项和输出单元格保持阻断，下一步进入 S8-7E 真实生产者 fixture 与隔离重建原型。
62. S8-7E1 已完成：引入固定 Apache POI 上游提交、许可和 SHA-256 的真实 Excel Pivot fixture；一个本地范围对象通过完整结构审计，一个命名来源/页面筛选对象稳定阻断。普通单元格修改后两个 Pivot Table、两个 Cache Definition 和两个 Cache Records 部件逐字节不变。当前机器无 Excel/LibreOffice，桌面刷新保存往返仍待 S8-7E2 后补证，写回继续禁用。
63. S8-7E2A 已完成：新增 `preview_workbook_pivot_rebuild` dry-run 命令和审计面板“影响清单”，精确映射 Cache Definition、Cache Records、Pivot Table、输出工作表四类计划影响部件。命令校验签名、内存隔离副本和摘要，不写用户文件；完整候选进入 `isolated_dry_run_ready`，命名来源/页面筛选对象稳定阻断。下一步 S8-7E2B 只在临时副本中实际重建 Cache。
64. S8-7E2B 已完成：新增 `rebuild_workbook_pivot_cache_isolated_copy`，只在内存隔离副本中实际重建 Cache Definition 与 Cache Records；已验证字符串共享索引、数字直接值、日期共享索引，修正真实 fixture 的过期日期边界，并对包复读、对象语义、新摘要及未修改部件逐字节保真设置门禁。新共享项、公式来源、混合类型、页面筛选和过期签名稳定拒绝，用户文件始终不写入。下一步 S8-7E2C 同步重建 Pivot Field items、`rowItems/colItems` 与输出工作表。
65. S8-7E2C 已完成：新增 `rebuild_workbook_pivot_isolated_copy`，在同一内存副本同步重建 Cache Definition、Cache Records、Pivot Table 和输出工作表；保持隐藏 items，重建行列项、明细、行列总计和总计。真实 fixture 验证 2×2 可见布局、13 个输出单元格及来源数值 1→10 后总计 4→13；包、对象语义、输出值和未触及部件保真全部通过，用户文件仍不写入。下一步 S8-7E2D 扩展新 sharedItems 与布局扩缩容。
66. S8-7E2D 已完成：新增 `rebuild_workbook_pivot_expanded_isolated_copy`，根据当前源数据增删共享项并同步 Cache Records、Pivot items、`rowItems/colItems`、`location` 和输出区域；保持既有共享项顺序与隐藏状态，新项默认可见。真实 fixture 覆盖 `A3:D7 → A3:E8` 扩张和 `A3:D7 → A3:C6` 收缩，验证样式延伸、至少 7 个旧单元格清理、总计 6/4、包语义与未触及部件保真，用户文件仍不写入。下一步 S8-7E2E 验证聚合方式与布局变体。
67. S8-7E2E 已完成：新增 `verify_workbook_pivot_variants_isolated_copy`；`sum/count/average/max/min/product/countNums` 七类聚合各自生成临时 Pivot 包并通过联合重建、包校验、对象语义和输出值复读。真实来源进一步验证单行轴、单列轴及 `sum/count/average` 三度量语义矩阵。S8-7E2F 已在同一命令上继续完成 3 个布局隔离包，合计 10 个临时包，用户文件仍不写入。
68. T7-1 已建立主题扩展框架；该历史检查点当时有 3 套正式预设，随后 T8-1 已扩展并验收为 3 套核心 + 4 套场景预设。F7-2 已交付首个 OPML 新格式编辑器，后续 JSON/JSONC 与多类文本/配置格式也已进入统一工作面。
69. T8-1A 已完成：七套发布预设分为 3 个核心 + 4 个场景方案，设置页区分正式与兼容组合，预设可同步动效节奏，注册表新增 WCAG AA 正文对比度和层级数量门禁。下一批 T8-1B 补齐四套场景预设的真实 Tauri 视觉矩阵。
70. T8-1B 已完成：四套场景预设具备设置页 1440×900、工作台 1024×768、思维导图 760×900 共 12 张真实 Tauri WebView2 证据；修复紧凑图谱页头、工具栏溢出、筛选条和初始详情遮挡，并隔离 E2E 配置写入。
71. S8-7E3A 已完成：标准本地 Pivot 在隔离布局验证后可可靠另存为同目录新 `.xlsx`；事务绑定源签名和隔离输出摘要，拒绝源覆盖、已有目标、旧状态、路径片段和未保存草稿，写后复读 OOXML/Pivot 语义并再次确认源字节不变。下一步 S8-7E3B 补齐 Excel/LibreOffice/WPS 真实刷新保存重开矩阵。
72. S8-7E3B 已完成：LongEdit 标准 Pivot 新副本已由 Microsoft Excel `16.0/20228`、WPS Spreadsheets `12.0/26895`、LibreOffice Calc `26.2.4.2` 分别刷新、保存、退出进程并新进程重开；3/3 均保持 `PivotTable1`、`A3:D7`、`D7=4`，三份输出再由 LongEdit 反向复读。下一步 S8-7E3C 逐项扩展单轴和多度量新副本白名单。
73. S8-7E3C 已完成：单行轴、单列轴和三度量均进入可靠新副本白名单；隐藏项与生产者原生多级表头已修正，Excel/WPS/LibreOffice 9/9 往返通过，十二份 XLSX 由 LongEdit 反向确认 `PivotTable1`、字段来源和聚合。下一步 S8-7E3D 扩展其余单度量聚合。
74. S8-7E3D 已完成：`count/average/max/min/product/countNums` 六种单度量聚合均进入可靠新副本白名单；修正跨分组 `max/min/product` 总计，Excel/WPS/LibreOffice 18/18 往返与 OOXML `subtotal` 复读通过，二十四份 XLSX 由 LongEdit 反向复读。下一步 S8-7E3E 审计多层轴并建立隔离包原型。
75. S8-7E3E 已完成：由 Microsoft Excel `16.0/20228` 生成并独立重开双层行轴、双层列轴真实 fixture；新增多层轴隔离审计命令，解码 `r` 前缀压缩项并验证双轴各 4 条明细、2 条父级小计、1 条总计及 16 个预览分组。临时包只重建 Cache Definition/Records，Pivot Definition 和输出 Worksheet 逐字节保持不变，用户文件不写入。下一步 S8-7E3F 在临时包中完整重建多层轴定义与层级输出。
76. X3-A / S8-6F 已完成：IronCalc 固定升级至 `0.8.0`，真实 XLSX 公式矩阵扩展为 38 个函数、64 个场景；标量 `XMATCH` 的精确、反向、通配、相邻值、横向量、`#N/A`、恢复和未保存依赖重算通过模块与 Tauri 命令门禁。动态数组、数组常量、正则模式、外部工作簿计算和缓存写回继续阻断。

S8-5C 的真实 Tauri 隔离运行已确认面板布局和七项控件可见；桌面点击保存重开因用户两次停止自动化而未继续，等价保存 payload 已由真实兼容 fixture 的命令边界往返、清除和页面对象保真回归覆盖。

PDF B2A/B2B/B2C 已完成：可按显式页范围提取页面、将 2～16 个 Library PDF 显式排序后合并，也可把另一 PDF 的指定页面插到页前、页后或末尾；复用 B0～B1C 页面计划、兼容画像与安全另存内核，并验证跨输入页序、文本、页面几何、应用内重开、全部源文件不变及复杂/加密输入阻断。A3R 也已完成 JSON/JSONC 软件内创建与管理闭环；E0/E1A 已固定九格式路线及 ODF 可信包边界，下一批推进 E1B ODT 只读预览与索引。

## 7. 已知边界与注意事项

- 当前重点是本地优先和开放文件格式，不引入私有数据库作为唯一事实源。
- XLSX 当前已具备基础单元格、连续/多区域、当前工作区整行整列、填充柄、公式引用迁移、按需依赖重算、基础样式、持久化行高列宽和合并区域编辑能力；高级样式、更多工作表结构和完整公式等价尚未完成，不能提前宣传为 Excel 等价编辑器；完整等价编辑按兼容矩阵逐项验收。
- PDF 标注和 OCR 使用 sidecar 文件，不直接重写原 PDF。
- OPML 主题、Canvas 节点、PDF 批注和 Table 视图已是全局图谱中的独立对象；本地索引支持持久化全量重建、签名失效检测和页级跨格式全文搜索，尚未实现文件级增量更新。
- 不要提交 `.claude/settings.local.json`、系统凭据、知识库内容、`dist/` 或 `src-tauri/target/`。

## 8. 2026-07-29 E1B 发布状态机恢复点

E1B 发布门禁已升级为 `checkpoint` / `released-preview` 双状态机器，并加入内存正反例验证。当前仍严格保持 `checkpoint`：Word 与 LibreOffice 已验证，WPS 有真实机器阻断证据，`.odt` 未注册且 `write=false`。

后续不得分步或提前暴露 `.odt`。只有 WPS 真实 fixture、同生产者复开和三生产者 `closure-candidate` 桌面证据全部到位，才能在同一提交中把生产者矩阵、`shared/odt-read-contract.json` 和 `shared/file-formats.json` 原子切换为只读发布态；精确合同与反例见 [`E1B_ODT_Release_State_Machine_Audit_2026-07-29.md`](./E1B_ODT_Release_State_Machine_Audit_2026-07-29.md)。

## 9. E1B WPS 跨机器交接入口

当前机器 WPS 仍输出 OLE，不能本机生成合格 ODT。具备可信 WPS ODF 能力的机器现在可以运行 `generate-e1b-odt-producer-fixtures.ps1 -Producer wps` 后使用 `export-e1b-wps-closure-bundle.ps1` 导出固定三成员关闭包；本机使用 `import-e1b-wps-closure-bundle.ps1` 校验固定 DOCX 源摘要、容器和两层 manifest 后导入。导入不会自动修改生产者矩阵或注册表，仍须先完成桌面 `closure-candidate`。

完整命令、正反例和信任边界见 [`E1B_WPS_Portable_Closure_Handoff_Audit_2026-07-29.md`](./E1B_WPS_Portable_Closure_Handoff_Audit_2026-07-29.md)。来源不明的 ZIP 即使摘要自洽也不得接纳。

## 10. E1B WPS 最终能力诊断

2026-07-29 已排除 WPS COM 格式编号误用：本机 `wpsapi.dll` TypeLib 明确注册
`wdFormatOpenDocumentText=23`，但 `SaveAs2(23)` 与 `SaveAs(23)` 均生成 OLE，省略格式的扩展名
推断则生成缺少 ODT `mimetype` 的非 ODT ZIP。环境审计已升级为 schema v2 和三路径保存矩阵，
`check:odt-read-contract` 会固定校验 TypeLib、输出容器和逐项清理状态。

当前结论是 WPS `12.1.0.26895` 没有可工作的 ODT 写出链路，不是 LongEdit 枚举错误。本机诊断
到此收口，后续只接受具备原生 ODT 保存和重开能力的可信 WPS 环境通过严格跨机器交接包补齐
第 3 个生产者；在此之前 E1B 继续保持 2/3，不进入 E1C。详细证据与官方资料复核见
[`E1B_WPS_ODF_Final_Capability_Diagnosis_Audit_2026-07-29.md`](./E1B_WPS_ODF_Final_Capability_Diagnosis_Audit_2026-07-29.md)。

## 11. S8-7E2F Pivot 布局包恢复点

2026-07-29 已完成单行轴、单列轴和 `sum/count/average` 多度量的完整隔离 OOXML 包重写。S8-7E3C 的生产者审计进一步修正隐藏项过滤和原生表头，三种布局现复读 `A3:B6`、`A3:D5`、`A3:J8`，同步验证 Pivot 字段/轴项/数据伪轴、输出值、旧范围清理和输出样式。

该恢复点之后，S8-7E3A 已完成标准 Pivot 可靠新副本；下一入口更新为 S8-7E3B 真实生产者刷新保存往返。多层轴、页面字段、切片器、外部连接和原件覆盖继续阻断。E2F 完整范围见 [`S8_7E2F_XLSX_Pivot_Layout_Package_Rewrite_Audit_2026-07-29.md`](./S8_7E2F_XLSX_Pivot_Layout_Package_Rewrite_Audit_2026-07-29.md)。

## 12. S8-7E3A Pivot 可靠新副本恢复点

标准一行字段、一列字段、一个 `sum` 值字段且无页面筛选的本地 Pivot 已开放“可靠另存新副本”。保存只允许同目录不存在的 `.xlsx`，使用源签名与隔离摘要双重绑定；目标落盘后完成字节、包结构、Pivot 身份/布局/聚合语义复读，源文件保存前后字节、签名和摘要保持不变。

本地完整门禁已通过：前端生产构建、工作簿契约与全部格式证据检查通过，Rust 功能测试 367/367、性能测试 1/1，生产依赖审计为 0 个漏洞。远端 GitHub Quality Gate 以本恢复点提交后的运行记录为准。

下一阶段为 S8-7E3B 真实生产者往返矩阵。多度量和单轴布局虽然已通过隔离包验证，但尚未进入保存白名单；原件覆盖、已有目标替换、页面字段、多层轴、切片器和外部连接继续阻断。详细证据见 [`S8_7E3A_XLSX_Pivot_Reliable_Copy_Save_Audit_2026-07-29.md`](./S8_7E3A_XLSX_Pivot_Reliable_Copy_Save_Audit_2026-07-29.md)。

## 13. S8-7E3B Pivot 三生产者往返恢复点

标准本地 Pivot 的 LongEdit 新副本已通过 Excel、WPS、LibreOffice 3/3 真实刷新、保存、进程退出和新进程重开。每个生产者使用独立副本，均保持 `PivotTable1`、`A3:D7` 和 `D7=4`；版本、会话/进程证据、输出长度和 SHA-256 位于 `docs/evidence/s8-7e3b-xlsx-pivot-roundtrip/matrix.json`。Rust 回归继续从 LongEdit 一侧复读全部四份 XLSX。

本地完整门禁已通过：前端生产构建和全部格式/证据合同通过，Rust 功能测试 368/368、性能测试 1/1，生产依赖审计为 0 个漏洞。远端 GitHub Quality Gate 以本恢复点提交后的运行记录为准。

下一入口为 S8-7E3C：依次评估单行轴、单列轴和三度量可靠新副本，并为每个开放候选重复 3/3 生产者往返。原件覆盖、已有目标替换、多层轴、页面字段、切片器和外部连接继续阻断。详细证据见 [`S8_7E3B_XLSX_Pivot_Producer_Round_Trip_Audit_2026-07-29.md`](./S8_7E3B_XLSX_Pivot_Producer_Round_Trip_Audit_2026-07-29.md)。

## 14. S8-7E3C Pivot 布局新副本恢复点

单行轴、单列轴和 `sum(Field2)/count(Field1)/average(Field2)` 三度量已进入可靠新副本白名单。三份 LongEdit 基准与九份 Excel/WPS/LibreOffice 输出均已版本化；桌面刷新、保存、退出和新进程重开矩阵为 9/9，Rust 从 LongEdit 一侧反向复读十二份 XLSX 的 `PivotTable1`、字段来源和聚合。

真实生产者审计修正了 E2F 的隐藏项和表头假设：基准范围现为 `A3:B6`、`A3:D5`、`A3:J8`。LibreOffice 单列轴会规范化为 `A3:C5`，但保存与新进程重开保持一致，总计语义不变；不宣传跨生产者坐标完全一致。

下一入口为 S8-7E3D：逐项评估 `count/average/max/min/product/countNums` 单度量可靠新副本。原件覆盖、已有目标替换、多层轴、页面字段、切片器和外部连接继续阻断。详细证据见 [`S8_7E3C_XLSX_Pivot_Layout_Copy_Round_Trip_Audit_2026-07-29.md`](./S8_7E3C_XLSX_Pivot_Layout_Copy_Round_Trip_Audit_2026-07-29.md)。

## 15. S8-7E3D Pivot 聚合新副本恢复点

`count/average/max/min/product/countNums` 六种单度量聚合已进入摘要绑定的同目录可靠新副本白名单。六份 LongEdit 基线与十八份 Excel/WPS/LibreOffice 输出已版本化；矩阵 18/18，且每份回存文件都复读 `pivotTable1.xml` 的 `subtotal`，防止聚合静默降级。

本阶段修正跨分组 Grand Total：`average` 加权、`max/min` 取极值、`product` 求积。LongEdit 基线为 `A3:D6`，三生产者刷新后规范化为稳定的 `A3:D7`；聚合、字段来源和总计保持不变。

下一入口为 S8-7E3E 多层轴真实 fixture、结构审计和隔离包原型。页面字段、切片器、外部连接、已有目标覆盖和原件覆盖继续阻断。详细证据见 [`S8_7E3D_XLSX_Pivot_Aggregation_Copy_Round_Trip_Audit_2026-07-29.md`](./S8_7E3D_XLSX_Pivot_Aggregation_Copy_Round_Trip_Audit_2026-07-29.md)。

## 16. S8-7E3E Pivot 多层轴结构恢复点

Microsoft Excel 真实 fixture 已固定 `Region/City` 双层行轴和 `Year/Quarter` 双层列轴。LongEdit 可解码 Excel 的 `r` 前缀压缩层级项，验证双轴明细、父级小计和总计，并从当前源表值生成 16 个完整层级组合。

`audit_workbook_pivot_multi_axis_isolated_copy` 只在内存临时包中重建 Cache Definition 与 Cache Records；包、对象语义和预览分组复读通过，Pivot Definition、输出 Worksheet 和其他未触及部件逐字节不变。命令绑定源签名，成功和旧签名路径均不修改用户文件。

下一入口为 S8-7E3F：把轴模板扩展为有序多层模型，完整重建压缩 `rowItems/colItems` 与层级输出，再覆盖数值变化、类别扩缩容、旧单元格清理和样式延伸。S8-7E3F 仍不开放可靠保存；生产者往返与白名单留到 S8-7E3G。详细证据见 [`S8_7E3E_XLSX_Pivot_Multi_Axis_Structure_Prototype_Audit_2026-07-29.md`](./S8_7E3E_XLSX_Pivot_Multi_Axis_Structure_Prototype_Audit_2026-07-29.md)。

## 17. 接手后直接做什么

当前从 `main` 的 `3907903` 继续，不需要切换其他分支。

1. 进入 S8-7E3F，把现有单层 Pivot 轴模板改为有序多层轴模型。
2. 在临时包中重建多层 `rowItems/colItems`、层级表头、明细、小计和总计。
3. 用已提交的 Microsoft Excel 双层轴 fixture 覆盖数值变化、类别扩张和收缩。
4. 通过包结构、语义、输出值、样式、未触及部件和源文件不变门禁。
5. S8-7E3F 只做隔离包，不开放保存；完成后进入 S8-7E3G，再做 Excel/WPS/LibreOffice 往返并评估可靠新副本。

继续保持阻断：页面字段、切片器、外部连接、已有目标覆盖和原件覆盖。
# 2026-07-30 交接快照：S8-7E3F 已收口

当前 `main` 已推进到 S8-7E3F：XLSX 多层行轴 + 多层列轴 Pivot 可以在临时包中同步重建 Cache Definition/Records、Pivot Definition、压缩 `rowItems/colItems` 和输出 Worksheet。审计命令返回 `multi_axis_output_rebuilt`，输出范围 `A3:I12`，输出单元格 `80`，Grand Total `424`，成功路径和旧签名拒绝路径均不修改用户原文件。

下一步直接进入 S8-7E3G：对 S8-7E3F 的隔离输出包执行 Excel/WPS/LibreOffice 三生产者刷新、保存、退出和新进程重开，验证无修复提示和语义稳定；稳定前不开放多层轴可靠保存，更不开放原文件覆盖。

# 2026-07-30 交接快照：S8-7E3G-A 预检已完成

已新增 `multi_axis` 审计副本生成入口，并固定 LongEdit 基线 `fixtures/xlsx/output-reopen/s8-7e3g-longedit-multi-axis.xlsx`。E3G matrix 位于 `docs/evidence/s8-7e3g-xlsx-pivot-multi-axis-roundtrip/matrix.json`，当前状态为 `blocked_preflight` / `0/3`，原因是本机仅发现 WPS Spreadsheets，未发现 Microsoft Excel 与 LibreOffice Calc。

下一台具备三生产者的机器应直接运行 `npm run audit:s8-7e3g-xlsx-pivot-multi-axis-roundtrip`，补齐 Excel/WPS/LibreOffice 的刷新、保存、退出和新进程重开证据。未达到 3/3 前，可靠保存和原文件覆盖继续阻断。

# 2026-07-30 交接快照：S8-7E3G-B 已完成 WPS 往返

S8-7E3G 已改为可增量执行的生产者矩阵。本机 WPS Spreadsheets `12.0/26895` 已对固定 LongEdit 多层轴基线完成刷新、保存、退出、新会话重开和 LongEdit 反向复读；`MultiAxisPivot`、双层行列轴、`A3:I12` 与 `I12=424` 均保持稳定。证据输出为 `fixtures/xlsx/output-reopen/s8-7e3g-wps-spreadsheets.xlsx`，matrix 已由 `0/3 blocked_preflight` 更新为 `1/3 partial`。

当前可用生产者可运行 `npm run audit:s8-7e3g-xlsx-pivot-multi-axis-available`；三生产者完整门禁仍运行 `npm run audit:s8-7e3g-xlsx-pivot-multi-axis-roundtrip`。下一台具备 Excel 或 LibreOffice 的机器可以用 `scripts/verify-s8-7e3g-xlsx-pivot-multi-axis-roundtrip.ps1 -Producer <id>` 增量补证。只有达到 3/3 后才评估多层轴可靠新副本；原文件覆盖、已有目标覆盖、Page Fields、外部数据和切片器继续阻断。详细审计见 [`S8_7E3G_B_XLSX_Pivot_Multi_Axis_WPS_Round_Trip_Audit_2026-07-30.md`](./S8_7E3G_B_XLSX_Pivot_Multi_Axis_WPS_Round_Trip_Audit_2026-07-30.md)。

# 2026-07-30 交接快照：S8-7E3G-C 已完成 LibreOffice 往返

LibreOffice Calc `26.2.5.2 / cd7284b4cbbfeb507e630c1aac019f4157393acb` 已通过隔离 UNO 运行时完成多层轴 Pivot 刷新、保存、退出、独立配置新进程重开和 LongEdit 反向复读。matrix 当前为 `partial / 2/3`；WPS 与 LibreOffice 均保持 `MultiAxisPivot`、双层行列轴、`A3:I12`、80 个输出单元格、16 个预览分组和 Grand Total `424`。

下一步只补 Microsoft Excel。具备 Excel 的机器直接运行 `scripts/verify-s8-7e3g-xlsx-pivot-multi-axis-roundtrip.ps1 -Producer microsoft-excel`，提交 Excel 输出与更新后的 matrix，再运行完整 `audit:s8-7e3g-xlsx-pivot-multi-axis-roundtrip`。达到 3/3 前可靠新副本继续阻断；达到 3/3 后也只进入白名单评估，不自动开放原文件覆盖。详细审计见 [`S8_7E3G_C_XLSX_Pivot_Multi_Axis_LibreOffice_Round_Trip_Audit_2026-07-30.md`](./S8_7E3G_C_XLSX_Pivot_Multi_Axis_LibreOffice_Round_Trip_Audit_2026-07-30.md)。

# 2026-07-30 交接快照：S8-7E3G-D Excel 身份与证据交接已完成

本机标准 `Excel.Application` CLSID 实际被 WPS `et.exe /Automation` 接管；应用自报 `Microsoft Excel 12.0/26895`，路径却属于 Kingsoft，因此不能作为 Microsoft Excel 证据。新增环境审计与验证器身份门禁，要求 LocalServer 为 Microsoft Office `EXCEL.EXE` 且明确拒绝 Kingsoft/WPS/`et.exe`。当前 matrix 保持 `partial / 2/3`。

最后一项证据现在使用固定三成员 ZIP 交接：可信 Excel 机器运行 `npm run export:s8-7e3g-excel-evidence -- -OutputPath <zip>`；当前开发机人工确认产出来源后运行 `npm run import:s8-7e3g-excel-evidence -- -BundlePath <zip>`。导入绑定 LongEdit 基线摘要、校验生命周期与快照、再次执行 LongEdit 复读、拒绝覆盖并在失败时保持 matrix 不变。详细审计见 [`S8_7E3G_D_XLSX_Pivot_Excel_Identity_and_Evidence_Handoff_Audit_2026-07-30.md`](./S8_7E3G_D_XLSX_Pivot_Excel_Identity_and_Evidence_Handoff_Audit_2026-07-30.md)。

# 2026-07-30 交接快照：S8-7E3G-E Excel 证据协议已加固

Excel 三成员包现已绑定环境身份、producer 版本/构建和输出摘要。新增 CI 自动拒绝矩阵，覆盖额外 ZIP 成员、LongEdit 基线漂移、生命周期门禁缺失和输出摘要篡改；4/4 均确认失败时不创建 Excel 输出且 matrix 字节不变。

当前仍是 `2/3 partial`，没有真实 Excel 证据。下一台可信 Excel 机器继续按 `audit environment → export bundle → 可信传输 → import bundle` 执行。拒绝测试中的 `synthetic-rejection-only` 数据只用于失败路径，绝不能登记为生产者证据。详细审计见 [`S8_7E3G_E_XLSX_Pivot_Excel_Evidence_Protocol_Hardening_Audit_2026-07-30.md`](./S8_7E3G_E_XLSX_Pivot_Excel_Evidence_Protocol_Hardening_Audit_2026-07-30.md)。

# 2026-07-30 交接快照：CI PowerShell 哈希兼容性已修复

远端连续失败已定位为 GitHub Windows Runner 无法识别新证据脚本使用的 `Get-FileHash`。S8-7E3G、X3-B5、X3-B6 的测试、导入、导出和生产者验证现统一使用 `scripts/powershell-sha256.ps1` 的 .NET SHA-256 实现；机器契约会拒绝相关脚本重新引入该 cmdlet。

本地三条证据事务测试与完整 `ci:check` 已通过：Rust 功能测试 `383/383`、性能测试 `1/1`、生产依赖漏洞 `0`。此修复不提升公开能力，Pivot 多层轴仍为 `2/3`、数组公式仍为 `1/3`。远端 Quality Gate 通过后，接手者直接进入 F1/E2A 外部应用能力发现与统一外部打开。详细审计见 [`CI_PowerShell_SHA256_Portability_Audit_2026-07-30.md`](./CI_PowerShell_SHA256_Portability_Audit_2026-07-30.md)。

首次远端复验已证明哈希修复生效，并进一步暴露父 `pwsh` 与子 `powershell.exe` 的 `TEMP` 不一致。现由 `scripts/powershell-path-safety.ps1` 同时识别系统临时目录和 GitHub `RUNNER_TEMP`，且保留严格目录边界检查；X3-B5/X3-B6 针对性事务测试已再次通过。

# 2026-07-30 交接快照：F1 / E2A 已完成

外部应用发现与统一打开已接入主干：Microsoft Office、WPS Office、LibreOffice 通过 App Paths/PATH 发现真实角色程序并读取产品版本；Library 右侧能力栏和文件树菜单共享系统默认/指定应用入口。后端拒绝任意程序路径，只打开工作区内已登记格式，并返回接管前后 SHA-256 不变回执。

本阶段没有提前开放 WPS 原生格式或旧 Office 转换。接手后直接进入 E3：固定 `.wps/.et/.dps` 真实 fixture 和隐私清理规则，登记 `external-open` 能力，接入右侧能力工作面、文件树和最近记录；转换资格保持阻断。详细审计见 [`E2A_External_Application_Discovery_and_Unified_Open_Audit_2026-07-30.md`](./E2A_External_Application_Discovery_and_Unified_Open_Audit_2026-07-30.md)。

# 2026-07-30 交接快照：E3 WPS 原生格式已完成

`.wps/.et/.dps` 已由 WPS Office `12.1.0.26895` 直接生成、脱敏并用新 WPS 实例复开。共享注册表和主窗口右侧 `ExternalOffice` 工作面现在可以确认容器身份，显示大小、修改时间和 SHA-256，并复用 E2A 的系统默认/指定应用外部打开。

三种格式严格保持 `external-open / saveMode:none`；LongEdit 不解析正文、不索引、不转换、不编辑、不创建也不保存。接手后直接进入 E2B `.doc` 隔离转换试点：先做 OLE 预检与风险报告，只允许显式生成新 DOCX 副本并证明源摘要不变；通过后再扩展 E2C `.xls/.ppt`。详细审计见 [`E3_WPS_Native_Recognition_and_External_Open_Audit_2026-07-30.md`](./E3_WPS_Native_Recognition_and_External_Open_Audit_2026-07-30.md)。

远端隔离 Quality Gate `30512714411` 已通过：E3 契约、Rust `391 passed`、XLSX 性能预算、PDF 大文件范围读取和生产依赖审计全部为绿色。
# 2026-07-30 R2 交接入口

R2 Windows 安装与生命周期工程已收口。接手后直接进入 R3 数据韧性与诊断，不再回到格式能力矩阵重做：

1. 先实现索引状态检查、损坏识别、安全重建和重启恢复。
2. 再实现配置/应用元数据备份导出与导入，禁止默认打包知识库正文或凭据。
3. 增加隐私净化诊断包及失败注入契约。
4. R3 完成后进入 R4：正式签名和可抛弃 Windows 10/11 VM 的安装、升级、降级拒绝、卸载保留及文件关联恢复矩阵。

R2 事实源为 `shared/windows-lifecycle-policy.json`，完整审计见 `docs/R2_Windows_Install_and_Lifecycle_Audit_2026-07-30.md`。发布能力页当前显示 R2，`releaseCandidate=false`。

# 2026-07-31 E2A SVG 交接入口

E2A 已完成。SVG 现在是第 40 类注册格式，复用统一 XML 源码工作面，并增加 Rust 安全白名单重写、`<img>` Blob 净化预览、5 MiB 源码预算、16,384 视口预算和签名冲突保护保存。不安全源码只保留在草稿中修复，脚本、事件属性、`foreignObject`、外部引用、处理指令和非白名单元素不能写回。

接手后直接进入 E2B：

1. 冻结 Draw.io 的 mxGraph 压缩/XML 解析合同。
2. 明确外部图片、链接、实体、资源预算和未知属性保留策略。
3. 实现页面与单元格结构模型，再确定可靠副本或受保护覆盖策略。
4. 增加真实 `.drawio` fixture、失败语料、桌面复开和 D2 安全通道证据。

E1B 数组写回和 E1C 多层 Pivot 可靠副本仍分别受 1/3、2/3 外部生产者证据阻断；`releaseCandidate=false` 不变。详细审计见 [`E2A_SVG_Security_and_Basic_Source_Editor_Audit_2026-07-31.md`](./E2A_SVG_Security_and_Basic_Source_Editor_Audit_2026-07-31.md)。

# 2026-07-31 E2B Draw.io 交接入口

E2B 已完成。Draw.io 现在是第 41 类注册格式，`.drawio/.dio` 已接入独立结构化工作面、创建、索引和签名保护保存。后端同时支持直接嵌入与压缩页，页面/单元格解析受资源预算限制；工作面只绘制本地 mxCell 投影，不自动打开链接或加载外部图片。标签、几何和颜色修改只重写目标页，未知属性保持保真，危险资源协议会阻止保存。

接手后直接进入 E5 高级能力最终收口审计：核对 E1A、E2A、E2B、主题承诺、发布矩阵和仍阻塞的外部生产者证据，不继续扩展 Draw.io 功能，也不提升 `releaseCandidate=false`。详细审计见 [`E2B_Drawio_Structured_Editor_Audit_2026-07-31.md`](./E2B_Drawio_Structured_Editor_Audit_2026-07-31.md)。

# 2026-08-01 E5 交接入口

E5 已完成。机器事实源为 `shared/e5-final-capability-closure.json`，完整门禁在基线提交 `313e8701825c29e69de9d0592df1ac462d3921a4` 上通过：Rust 功能回归 431/431、性能回归 1/1、生产依赖漏洞 0。

下一步直接进入 U1 未签名内部候选包：从 E5 通过后的干净 `main` 构建 MSI/NSIS，绑定提交、版本、大小和 SHA-256，并明确保持 internal-only 与 `releaseCandidate=false`。完成 U1 后进入 U2 本机安装生命周期验证；真实签名和 Windows 10/11 隔离证据仍交给 R5N 外部流程。

# 2026-08-01 U1 交接入口

U1 已更新到 1.0.0。`shared/u1-unsigned-internal-candidate-policy.json` 绑定提交 `6f3ce50` 的隔离干净构建，MSI/NSIS 均为 `NotSigned`，哈希与大小已登记，二进制只保存在本机忽略目录。

便携运行烟测因当前会话存在另一份 LongEdit 单实例而记录为 `blocked-existing-single-instance`；没有关闭用户进程、执行安装器或修改注册表。下一步进入 U2 一次性环境的未签名安装生命周期。

# 2026-08-01 U2O handoff

U2O 已完成。GitHub 托管运行 `30664431101` 对源码 `dfe5e9c424ab4a3b71f1eee3924dc43f8f7d400f` 重新构建安装包，并在 Windows Server 2025 一次性环境通过 18 项未签名安装生命周期检查。TXT/JSON 保存重开截图已人工确认位于 Library 右侧工作面，管理备份恢复和知识索引重建也已通过。证据已导入 `docs/evidence/r5k-windows-matrix/imported`。

当前动作是 R5N `execute-signed-windows-10-and-windows-11-client-matrix`。必须使用受信任签名材料和真实 Windows 10/11 客户端；Windows Server 托管证据不得冒充客户端通道，`releaseCandidate=false` 不变。

R5N 环境已在 U2P 再次审计：本机没有签名工具、合格证书或两个客户端 runner。接手机器按 `docs/U2P_R5N_External_Release_Blocker_Audit_2026-08-01.md` 的顺序执行，不得用自签名或 Windows Server 结果替代正式发布证据。

G9 产品线已并行完成首页“知识网络脉搏”：关系覆盖率、已连接/孤立对象、关系类型和高连接主题均来自统一图谱模型，高连接主题可直接打开居中图谱。接手后进入 G10 真实感跨格式资料库桌面验收；不得把合成单元测试登记成真实用户资料库证据。

# 2026-08-01 U2 外部执行入口

U2 已推进到 `execute-on-disposable-windows-runner`。机器事实源为 `shared/u2-disposable-install-lifecycle-policy.json`；U1 NSIS 与 0.6.2 回滚安装器均就绪，但当前主机没有一次性 Windows runner，且已有安装与运行进程，所以安装修改继续阻断。

Sandbox 生成器绑定安装包清单中的产品提交 `6f3ce50`，并可在无 Sandbox 主机上先生成配置。1.0.0 的 U2 证据通过后进入 V1 无 Authenticode 签名社区发布通道；历史 R5N 保留为未来商业签名通道，不再阻止本次社区版发布。
# 2026-08-05 UX-33J 交接入口

UX-33 有界 DOCX 页面编辑已完成安装态收口。U2 运行 `30967710442` 对固定产品提交 `22ac691` 的无签名 `1.0.3` NSIS 完成三类 DOCX 验证，并通过 18/18 安装、卸载、回滚和恢复检查。机器证据位于 `docs/evidence/ux33j-installed-docx-hyperlink`，完整结论见 `docs/A11_DOCX_Installed_Hyperlink_Audit_2026-08-05.md`。

接手后直接进入 UX-34：修复 Drawio/Canvas 的 ResizeObserver 可恢复警告，验证重复切换、缩放、拖动和返回资料库不会弹阻断错误。不要把 UX-33 扩写成完整 Word 等价能力；跨部件 DOCX 对象仍需另立阶段。当前安装包未签名，`releaseCandidate=false`。
# 2026-08-05 UX-34 交接入口

UX-34 Drawio/Canvas 尺寸稳定性已完成。Canvas ResizeObserver 采用单帧合并、尺寸短路和卸载取消；`index.html` 与应用运行时仅阻止两种标准可恢复布局通知，普通错误仍进入原错误页。Tauri Debug WebView2 已完成 6 轮路由、视口、缩放和拖动验证，证据见 `docs/evidence/ux34-drawio-canvas-stability`，完整审计见 `docs/A12_Drawio_Canvas_Resize_Stability_Audit_2026-08-05.md`。

接手后直接进入 UX-35：删除文件树节点重复的原生 `title` 文本提示，只保留统一详情浮层，并确保键盘焦点可以获得同等信息。当前证据不包含用户资料，`releaseCandidate=false`。

# 2026-08-05 UX-35 交接入口

UX-35 文件树详情浮层已完成。节点原生 `title` 已删除，鼠标和键盘方向键当前项共用可访问详情浮层，Esc 与焦点离开可关闭。真实 Tauri Debug WebView2 已验证两个隔离 fixture 均无重复原生提示，运行时异常为 0；证据见 `docs/evidence/ux35-file-tree-preview`，完整审计见 `docs/A13_File_Tree_Detail_Preview_Audit_2026-08-05.md`。

接手后直接进入 UX-36：文件树空白区/目录右键菜单第一项改为“新建”二级菜单，按文档、数据、图表、代码组织格式；重命名必须展示完整文件名并允许修改后缀，格式变化前提示风险、名称冲突时禁止覆盖。当前证据不含用户资料与完整本机路径，`releaseCandidate=false`。

# 2026-08-05 UX-36 交接入口

UX-36 文件树新建与安全重命名已完成。空白区和目录右键首项统一为“新建”，按四类覆盖格式注册表全部 18 种可创建格式；完整文件名重命名支持已注册后缀变化、明确拒绝同名目标，并在单弹窗内二次确认“不转换内容”。真实 Tauri Debug WebView2 已验证 JSON 创建、冲突拒绝、`.md` 改 `.txt` 及树/标签/路由同步，证据见 `docs/evidence/ux36-file-tree-actions`，完整审计见 `docs/A14_File_Tree_Create_Rename_Audit_2026-08-05.md`。

接手后直接进入 UX-37：审计脑图、思维导图和产品知识图谱的真实画布交互，按平移、缩放、节点拖动、框选、多选、键盘移动、撤销重做、树状/组织/放射/时间线布局逐项补齐并取真实桌面证据。当前证据不含用户资料与完整本机路径，`releaseCandidate=false`。

# 2026-08-05 UX-37A 交接入口

UX-37A OPML 专业画布已完成。思维导图支持四种布局、三套主题、平移缩放、适合窗口、框选/Ctrl 多选、成组拖动、方向键移动、直接改名及统一撤销重做；自动保存、离开自动保存和投影旁路写盘均已移除。真实 Tauri Debug WebView2 验证两节点拖动、键盘移动与直接改名，未点击保存时源签名不变，运行时异常为 0；证据见 `docs/evidence/ux37a-opml-canvas`，完整审计见 `docs/A15_OPML_Professional_Canvas_Audit_2026-08-05.md`。

接手后进入 UX-37B：在产品知识图谱画布补齐框选、多选、键盘移动、撤销重做和树状/组织/放射/时间线布局。UX-37 总项在 UX-37B 完成前保持进行中；当前证据不含用户资料与完整本机路径，`releaseCandidate=false`。

# 2026-08-05 UX-37B 交接入口

UX-37B 产品知识图谱专业画布已完成，UX-37 总项关闭。关系网络支持自动网络、树状、组织、放射、时间线五种布局，专业、多彩、专注三套主题，以及平移缩放、适合窗口、Shift 框选、Ctrl 多选、成组拖动、方向键移动和撤销重做。布局和坐标只写入本地工作区状态，不修改 Markdown；真实 Tauri Debug WebView2 验证 6 节点框选、成组拖动、键盘移动和历史操作，源文件哈希不变，运行时错误为 0。证据见 `docs/evidence/ux37b-knowledge-graph-canvas`，完整审计见 `docs/A16_Knowledge_Graph_Professional_Canvas_Audit_2026-08-05.md`。

接手后进入 UX-38 全格式验收：按格式能力矩阵逐项核查真实文件打开、编辑、显式保存、撤销重做、主题、窄窗口和返回上下文，优先覆盖尚无统一真实桌面证据的格式。当前证据不含用户资料与完整本机路径，`releaseCandidate=false`。

# 2026-08-05 UX-38A 交接入口

UX-38A 已建立覆盖 41/41 个格式族、12 个体验维度的机器可检查矩阵，并在真实 Tauri Debug WebView2 中完成 24 个轻量格式的受管打开与加载验收。24/24 通过，最长加载 2041 ms，运行时错误和阻断界面均为 0，源文件哈希全部不变；证据见 `docs/evidence/ux38a-lightweight-formats`，审计见 `docs/A17_UX38A_Lightweight_Format_Matrix_Audit_2026-08-05.md`。

UX-38 总项仍在进行中。视觉审计确认多标签会继续压缩并暴露原生滚动条，标签维度只能标记为部分通过。接手后进入 UX-38B，先统一修复 UX-09、UX-10、UX-17：标签保持可读最小宽度、滚轮/触控板横向滚动、隐藏原生轨道并提供边缘反馈；之后再继续数据表格、Office、图形和外部依赖格式。当前证据不含用户资料与完整本机路径，`releaseCandidate=false`。

# 2026-08-05 UX-38B 交接入口

UX-38B 工作区标签滚动已完成，UX-09、UX-10、UX-17 关闭。标签采用 176px 固定宽度和 156px 最小保护宽度，隐藏原生轨道，支持滚轮、Shift+滚轮、触控板主方向增量、左右边缘按钮、活动项自动显露和方向键导航。真实 Tauri Debug WebView2 已用 12 个文件完成宽屏、滚动和 1000x720 窄窗口验收，运行时错误为 0，源文件哈希不变；证据见 `docs/evidence/ux38b-workspace-tabs`，审计见 `docs/A18_UX38B_Workspace_Tab_Scrolling_Audit_2026-08-05.md`。

UX-38 总项仍在进行中。接手后进入 UX-38C 数据表格格式族，依次核查 Table、CSV/TSV、XLSX、ODS 的打开、加载与异常状态、内存编辑与显式保存、主题和冻结层、窄窗口、键盘及返回上下文。当前证据不含用户资料与完整本机路径，`releaseCandidate=false`。

# 2026-08-05 UX-38C1 交接入口

UX-38C1 CSV/TSV/Table 网格体验已完成。冻结控制支持 0 至 12 列并按累计列宽定位，冻结表头、数据格和行号改用不透明主题表面；行号选择与应用内删除确认完成实机复测；“创建 Table 副本”会先说明目标名称、目录和原文件不变，完成后可打开或在文件树定位。工具栏还会按工作区容器宽度换行。真实 Tauri Debug WebView2 的 CSV/TSV 验收运行时错误为 0，源文件哈希不变；证据见 `docs/evidence/ux38c-table-grid`，审计见 `docs/A19_UX38C1_Table_Grid_Experience_Audit_2026-08-05.md`。

UX-38 总项继续进行。接手后进入 UX-38C2：真实复测 XLSX/ODS 的冻结层、紧凑布局、主题、窄窗口和异常状态，并覆盖图谱返回后的 CSV/TSV/XLSX 活动文件、滚动位置与 Sheet 上下文，判断 UX-12、UX-32 是否可以关闭。当前证据不含用户资料与完整本机路径，`releaseCandidate=false`。

# 2026-08-05 UX-38C2 交接入口

UX-38C2 已完成，数据表格格式族收口，UX-12、UX-13、UX-32 关闭。XLSX 与 ODS 采用工作区容器响应布局和不透明冻结层，并持续记忆滚动位置与活动 Sheet；CSV/TSV 修正加载态恢复时机。真实 Tauri Debug WebView2 已验证 CSV、TSV、XLSX、ODS 从知识图谱返回后的活动文件与滚动上下文，XLSX/ODS 同时恢复目标 Sheet；运行时错误为 0，源文件哈希不变。证据见 `docs/evidence/ux38c2-workbook-context`，审计见 `docs/A20_UX38C2_Workbook_Context_Audit_2026-08-05.md`。

UX-38 总项继续进行。接手后进入 UX-38D 文档媒体格式族，依次验收 PDF、DOCX/ODT、PPTX/ODP 的真实打开、模式切换、保存边界、主题、窄窗口、键盘和返回上下文。不得把有界 Office 能力写成完整等价编辑；当前 `releaseCandidate=false`。

# 2026-08-05 UX-38D1 交接入口

UX-38D1 PDF 工作区已完成。PDF 现在持续记忆当前页、双向滚动、缩放、适合宽度及侧栏状态，并在知识图谱往返后恢复；工具栏按工作区容器宽度折行，窄宽度侧栏标签采用两行紧凑布局。真实 Tauri Debug WebView2 在 220% 缩放下完成图谱返回与 900x720 窄窗口验收，运行时错误为 0，源 PDF 哈希不变。证据见 `docs/evidence/ux38d1-pdf-workspace`，审计见 `docs/A21_UX38D1_PDF_Workspace_Audit_2026-08-05.md`。

UX-38 总项仍在进行中。接手后进入 UX-38D2，验收 DOCX/ODT 的打开、加载与异常状态、页面式编辑或结构化只读边界、显式保存/可靠副本、主题、窄窗口、键盘和返回上下文。PDF 原文只读、sidecar 批注及可靠新副本边界保持不变；当前 `releaseCandidate=false`。

# 2026-08-05 UX-38D2 交接入口

UX-38D2 DOCX 受管工作区已完成。DOCX/ODT 均记忆正文滚动，DOCX 还恢复编辑面板与模式；两者改为按实际工作区容器宽度响应。DOCX 注册表、发布矩阵和安全合同已对齐现有“内存草稿、隔离验证、用户确认后有界覆盖或可靠另存”能力。真实 Tauri Debug WebView2 验证 DOCX 图谱往返、820x720 编辑布局和 ODT 760x720 直接只读预览，运行时错误为 0，源文件哈希不变。证据见 `docs/evidence/ux38d2-document-workspace`，审计见 `docs/A22_UX38D2_Document_Workspace_Audit_2026-08-05.md`。

ODT 仍是预览路由且未注册：Word/LibreOffice 通过，WPS 生产者门禁为 2/3，不得宣称资料库已正式开放。UX-38 下一步进入 UX-38D3，验收 PPTX/ODP 的模式、可靠副本、主题、窄窗口、键盘和返回上下文；当前 `releaseCandidate=false`。

# 2026-08-05 UX-38D3 交接入口

UX-38D3 PPTX/ODP 工作区已完成，文档媒体格式族收口。PPTX 现在记忆当前幻灯片、详情面板与画布滚动，并按实际工作区宽度响应；ODP 记忆当前幻灯片，且加载态不会再覆盖历史上下文。真实 Tauri Debug WebView2 已验证两种格式从知识图谱返回、窄窗口与源文件不变，运行时错误为 0；证据见 `docs/evidence/ux38d3-presentation-workspace`，完整结论见 `docs/A23_UX38D3_Presentation_Workspace_Audit_2026-08-05.md`。

接手后进入 UX-38E 图形画布格式族，按 Canvas、Draw.io、Diagram、OPML 的顺序核对打开、显式保存、撤销重做、主题、窄窗口、键盘和返回上下文，优先复用 UX-34/UX-37 已有真实证据并只补缺口。PPTX 仍只能可靠另存副本，ODP 仍为只读，`releaseCandidate=false` 不变。

# 2026-08-05 UX-38E 交接入口

UX-38E 图形工作区已完成。Canvas、Draw.io、Mermaid、OPML 均已验证内存草稿、显式保存和知识图谱往返上下文；Canvas、Draw.io、Mermaid 本轮通过撤销重做，OPML 复用 UX-37A 已接受证据。真实 Tauri WebView2 审计运行时错误和意外弹窗均为 0，证据见 `docs/evidence/ux38e-graphics-workspace`，完整结论见 `docs/A24_UX38E_Graphics_Workspace_Audit_2026-08-05.md`。

接手后进入 UX-38F：只收口 `.doc/.xls/.ppt/.wps/.et/.dps` 的外部应用发现、不可用状态、失败说明、返回上下文与窄窗口，不宣称 LongEdit 内部等价编辑或转换。UX-38F 完成后执行 UX-38 总矩阵最终审计；当前 `releaseCandidate=false`。

# 2026-08-05 UX-38F 交接入口

UX-38F 外部 Office 工作区已完成。`.doc/.xls/.ppt/.wps/.et/.dps` 均在工作区内展示系统默认、Microsoft Office、WPS Office、LibreOffice 的可用或不可用状态，并提供用户主动触发的安全外部交接；旧 Office 的隔离转换入口与外部打开已明确分区。真实 Tauri WebView2 已验证六格式加载、图谱往返、应用选择或目标路径恢复、760x720 窄布局与源哈希不变，运行时错误和意外弹窗均为 0。证据见 `docs/evidence/ux38f-external-office`，完整结论见 `docs/A25_UX38F_External_Office_Workspace_Audit_2026-08-05.md`。

接手后执行 UX-38 总矩阵最终审计：清点 41/41 格式的证据和所有 `partial/referenced/not-applicable` 边界，只关闭有真实证据支持的项目，不扩大有限 Office、外部打开或只读预览能力。当前 `releaseCandidate=false`。

# 2026-08-05 UX-38 最终交接入口

UX-38 全格式体验阶段已按有界能力完成。矩阵覆盖 41/41 格式、10 个实际档案和 12 个体验维度，状态合计为 75 accepted、32 partial、7 referenced、6 not-applicable、0 pending；两个无人引用的历史占位档案已移除。所有有限项都有明确能力边界，因此不得把阶段收口解读为完整 Office/Excel/Draw.io 等价。机器事实见 `shared/ux38-final-closure.json`，完整审计见 `docs/A26_UX38_Final_Format_Experience_Closure_2026-08-05.md`。

接手后进入 UX-39 无签名打包与安装回归：产品开发版本已提升到 `1.0.4`，从冻结的干净 `main` 构建 MSI/NSIS，重点复测启动时无控制台弹窗、安装界面与开发界面一致，以及 UX-38 各工作区在安装态的关键路径。没有真实签名时只保持无签名社区构建，`releaseCandidate=false`；不得把本阶段误打包为 `1.0.3`，也不得在验收前提前宣称 v1.0.4 已发布。

UX-39A 已完成 v1.0.4 本地产物审计：源码提交 `1bec297` 生成 MSI/NSIS，版本资源、文件名、SHA-256、`NotSigned` 状态和无更新附件边界均已核对。由于本机已有安装实例运行，未中断用户状态强行做便携烟测；隔离安装回归已派发到 GitHub Actions 运行 `30989527026`。下一步导入该运行的安装态证据，通过前不得发布 v1.0.4。详见 [`UX39A_Unsigned_Package_Artifact_Audit_2026-08-05.md`](./UX39A_Unsigned_Package_Artifact_Audit_2026-08-05.md)。

# 2026-08-06 UX-39 发布交接入口

UX-39 已完成安装包与安装态回归收口。最终产品源码提交为 `2b5d4d750da0f3e3ee913a4cc461784ffa8ea947`；GitHub Actions 运行 `31062756515` 通过 18/18 安装生命周期、15/15 安装态功能和 11/11 路由挂载检查。此前两个失败运行暴露的后台路由兜底和预发布能力矩阵版本冲突均已修复，不再作为阻断项。

最终公开候选为 `LongEdit_1.0.4_x64-setup.exe`（SHA-256 `cd68e19d9daab198f9bca7f97d3eeb432314f5f3e7895295845e7b48d4b29ff3`）与 `LongEdit_1.0.4_x64_zh-CN.msi`（SHA-256 `dacbd99ed0f6fe148bdecb99378cf49b4afd68f16e9dcc4b5492233b1e358ee9`）。两者均为 `NotSigned`，只允许与 `SHA256SUMS.txt` 一起手动发布，不上传 `latest.json` 或 `.sig`。

接手后只需完成 `v1.0.4` 标签与 GitHub Release、下载复核公开附件，并把发布 URL、时间和标签提交写回 `shared/v1-community-release-policy.json`。完整证据见 [`UX39B_Installed_Lifecycle_Closure_Audit_2026-08-06.md`](./UX39B_Installed_Lifecycle_Closure_Audit_2026-08-06.md)。

## v1.0.4 发布回执

`v1.0.4` 已于 `2026-08-06T02:06:55Z` 正式发布，标签指向提交 `acfc86b937307eee70e8063884ef405ba2c0a7fa`。Release 地址为 <https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.4>。NSIS、MSI 和 `SHA256SUMS.txt` 已从远端重新下载复核，公开哈希与发布候选完全一致。

接手后进入 v1.0.4 稳定性观察，不再重复打包 1.0.3 或 1.0.4。只处理真实可复现回归；后续产品阶段继续推进完整 Excel、高级 Office 编辑、更多原生格式和主题深化。自动更新私钥边界不变，仍不发布 `latest.json` 或 `.sig`。

# 2026-08-06 UX-40 交接入口

v1.0.4 安装反馈确认文档 Tab 切换被全局路由遮罩和 `out-in` 串行转场人为阻塞。UX-40 已删除全屏路由遮罩，启动与文档导航遮罩预算均改为 0ms，并移除跨格式工作区的串行退场；性能记录仍保留但不再影响交互。生产构建、R5B 性能合同和当前完整审计链均通过，详见 [`UX40_Document_Switching_Performance_Audit_2026-08-06.md`](./UX40_Document_Switching_Performance_Audit_2026-08-06.md)。

该修复位于 `main`，已发布的 `v1.0.4` 安装器不包含它。接手后应先用真实安装包复测 Markdown/TXT 同路由切换以及 TXT/JSON/PDF/XLSX 跨格式切换，再决定后续补丁版本；不得把当前源码修复误报为已交付给 v1.0.4 用户。

UX-40 深入审计后已进一步收紧：全屏路由遮罩现已从产品中彻底删除；应用外壳先于配置 IPC 挂载，关键启动调用均有 2-8 秒边界；路由导入失败保留当前页面并显示非阻塞恢复条；Markdown/TXT 快速切换使用请求代次防止旧读取覆盖新文档。新增 `check:navigation-liveness` 并进入当前开发审计链。下一步必须在新安装包中做连续快速切换与故障恢复验证，不能只依赖源码门禁。

提交 `676baa7` 已完成真实 Tauri Debug WebView2 回归：隔离资料库中的 12 种文本/开发格式连续切换、滚轮、键盘、活动标签回显与窄窗口均通过，运行时错误、阻断错误界面和源文件变化均为 0。摘要位于 `docs/evidence/ux40-navigation-liveness/runtime-summary.json`；安装态重型格式回归仍是下一安装包的发布前置条件。

UX-21 已移除资料库编辑区右上角的当前文件关系状态块，不再显示关系数量、入链数量或“孤立风险”，并停止为活动文件单独加载该摘要。关系能力仍可从工作台、知识搜索结果和按需关系界面进入。

UX-18 按用户澄清保留右侧文件上下文按钮，但删除应用内容区固定的 42px 全高预留列。按钮关闭时仅贴边悬浮，关系面板只在展开后获得 326px 宽度并覆盖显示，不再压缩各格式编辑区域。

左侧“智能集合”经审计不是空功能，而是保存搜索条件或局部图谱以便复用；用户术语已统一改为“保存视图”。侧栏标签改为稳定七等分：宽度低于 460px 时全部仅显示图标，达到阈值后全部显示图标与文字，活动项不再改变宽度；动画使用产品动效变量并响应系统减少动效设置。`check:sidebar-tabs-responsive` 已进入当前开发审计链。

UX-08 已让文件树显示完整文件名与后缀，并为全部 41 种注册格式建立分类图标和识别色。文件右键菜单新增“编辑显示样式”，可设置背景、文字颜色和十种标记图标；标记保存在本机配置，重命名时迁移、删除时清理，管理备份刻意不携带绝对路径标记。后端限制 512 条、`#RRGGBB` 颜色和固定图标白名单，`check:file-tree-appearance` 已进入当前开发审计链。

UX-19 首次打开 Markdown 的显示错位已定位并修复：资料库编辑器可能在尚无活动文档时先以源码模式挂载，随后虽然顶部“所见”按钮按配置高亮，底层 Vditor 仍保持源码模式。现在首次打开及在普通文本与 Markdown 之间切换时都会核对真实编辑器模式，不一致则先按目标模式重建再载入内容；`check:markdown-default-mode` 已覆盖这一运行时对齐合同。安装态仍需复测首次打开、连续切换和用户主动持久化源码偏好。

UX-41 已建立全局横向滚轮导航。纯横向工具栏、标签栏、筛选条、卡片和预览集合自动接入；Table 与 Workbook 双轴网格在表头/列标题悬浮时横向滚动，正文保留纵向滚动；画布缩放、原生横向触控板和表单控件不被抢占。专项审计 `check:horizontal-wheel-navigation` 已进入当前开发审计链，完整边界见 [`UX41_Horizontal_Wheel_Navigation_Audit_2026-08-06.md`](./UX41_Horizontal_Wheel_Navigation_Audit_2026-08-06.md)。

UX-42 已重构 Table 新建看板体验。视图创建收纳为单一菜单，看板分组、标题与卡片字段改为分层配置；长字段名和长内容具有稳定省略、换行与尺寸约束，窄窗口不再挤压错位。已使用 `测试结果记录 2.table.json` 的隔离副本在真实 Tauri WebView2 中验证 13 字段、11 卡片，桌面/字段弹层/760px 窄窗口无越界、无运行时错误且源文件未变化。专项审计 `check:table-board-experience` 已进入当前开发审计链，详见 [`UX42_Table_Board_Experience_Audit_2026-08-06.md`](./UX42_Table_Board_Experience_Audit_2026-08-06.md)。

UX-43 已新增图片与视频只读工作区，当前注册格式由 41 类扩展为 43 类。图片覆盖 PNG/JPEG/GIF/WebP/BMP/ICO/AVIF，提供缩放、适应窗口、旋转和透明网格；视频覆盖 MP4/WebM/Ogg Video/M4V，提供原生控制、倍速和全屏，实际解码取决于系统 WebView2。媒体路径先经 `WorkspaceGuard` 和大小预算验证，再仅授权规范化单文件只读访问。真实 Tauri 回归已通过透明 PNG、WebM 和 720px 窄窗口，详见 [`UX43_Media_Workspace_Audit_2026-08-06.md`](./UX43_Media_Workspace_Audit_2026-08-06.md)。

UX-47 已恢复自动检查与自动安装，但不再依赖遗失的旧 Tauri 私钥。新链路固定查询本仓库 GitHub 最新稳定 Release，只接受严格命名的 Windows x64 NSIS，后端校验附件 SHA-256 后才允许用户确认安装；应用每 24 小时自动检查一次，设置页也可手动检查。已发布的 v1.0.4 不含该代码，接手后要在下一安装包做一次人工迁移，并用更高测试版本完成端到端覆盖安装回归。详见 [`UX47_Managed_Automatic_Update_Audit_2026-08-06.md`](./UX47_Managed_Automatic_Update_Audit_2026-08-06.md)。

UX-48 已修复 Table 顶部“导出 CSV”等命令在空间不足时被压缩、文字越界的问题，并删除窄窗口直接隐藏导出与行列命令的规则。统一命令条合同已覆盖 Table、Workbook、Canvas、思维导图、Mermaid、PDF、PPTX、DOCX、ODT、日志和 YAML：控件保持可读尺寸，空间不足时隐藏原生滚动条并支持滚轮横滑。详见 [`UX48_Command_Strip_Overflow_Audit_2026-08-06.md`](./UX48_Command_Strip_Overflow_Audit_2026-08-06.md)。

UX-49 已完成媒体流式读取与视频工具增强。图片和视频不再整文件读入 JavaScript/Blob，而是在 `WorkspaceGuard` 校验后仅授权当前文件，通过 Tauri Asset Protocol 的 Range 响应按需读取；视频上限由 128 MiB 调整为 2 GiB。MP4/WebM/OGV/M4V 保持 WebView 原生目标，MOV/MKV/AVI/MPEG/MPG 作为系统解码器兼容格式开放，并明确显示兼容边界。播放器新增播放/暂停、前后 10 秒、循环、静音、倍速、画中画、全屏、快捷键与非阻断错误提示，图片适应窗口会跟随工作区尺寸更新。源码构建、Rust 锁定检查、2 项分类单测和媒体专项门禁已通过；下一安装包仍需用真实大视频和多编码样本复测内存、拖动定位、全屏/画中画及外部打开。详见 [`UX49_Streaming_Media_Workspace_Audit_2026-08-06.md`](./UX49_Streaming_Media_Workspace_Audit_2026-08-06.md)。

# 2026-08-07 EA-3A 交接入口

EA-3A 已完成图片和视频的外部只读工作区。外部能力现明确分为 23 类 `edit` 与 2 类 `preview`：图片/视频可由应用文件选择器、Windows 启动参数或用户逐项选择的默认应用入口直接打开，但只获得独立预览授权，没有 writer、保存按钮或写回路径。安装器关联仍只有 `.md/.markdown`，不会抢占全部支持格式。

格式能力页已分别说明可编辑与只读数量，媒体工作区显示外部文件、只读和不会写回，并纳入统一标签与返回资料库流程。专项契约、前端生产构建、4 项外部授权测试、2 项媒体分类测试和 Rust 锁定检查均通过。接手后进入 EA-3B，从 PDF 开始逐类审计外部预览、sidecar、新副本和资料库语义；不能批量把剩余 `import` 格式改成 `preview/edit`。完整结论见 [`UX50D_External_Media_Preview_Audit_2026-08-07.md`](./UX50D_External_Media_Preview_Audit_2026-08-07.md)。

# 2026-08-07 EA-3B 交接入口

EA-3B 已完成外部 PDF 专业只读工作区。外部 PDF 复用 2 GB 渐进 Range 阅读器，保留搜索、目录、页码、缩放、适合宽度、密码输入和阅读位置；标题明确显示外部、只读和不会写回，并进入统一标签会话。后端新增独立 preview 授权命令，未经用户授权的绝对路径不能读取。

批注、OCR、知识引用、页面整理、提取、合并和插页严格保留在资料库模式；外部 PDF 不写 Sidecar、不初始化页面草稿，也不创建新副本。外部能力现为 23 类 `edit` 与 3 类 `preview`，安装器关联仍只有 `.md/.markdown`。专项契约、资料库 PDF 回归、前端构建、4 项授权测试、26 项 PDF 测试和 Rust 检查均通过。接手后进入 EA-3C，优先评估 ODS/ODP 等纯只读结构格式；DOCX/PPTX/XLSX 继续单独审计。详见 [`UX50E_External_PDF_Readonly_Workspace_Audit_2026-08-07.md`](./UX50E_External_PDF_Readonly_Workspace_Audit_2026-08-07.md)。

# 2026-08-07 EA-3C 交接入口

EA-3C 已完成 ODS 与 ODP 外部结构化只读预览。两类格式通过独立 preview 授权命令复用有界解析器，ODS 展示工作表、单元格和公式缓存值，ODP 展示幻灯片、文本与备注线索；均不执行内容、不计算公式、不保存、不转换，解析后再次核对源字节。外部工作区已纳入统一标签、返回资料库和“外部文件 · 只读 · 不会写回”状态。

外部能力现为 23 类 `edit` 与 5 类 `preview`，安装器关联仍只有 `.md/.markdown`。专项契约、E1C 资料库回归、前端类型检查与生产构建、2 项 ODF 测试、4 项授权测试和 Rust 锁定检查均通过。接手后进入 EA-3D，只审计 ODT 的外部只读资格和真实生产者门禁；证据齐备前保持 `import`，DOCX/PPTX/XLSX 继续单独处理。详见 [`UX50F_External_ODF_Structured_Preview_Audit_2026-08-07.md`](./UX50F_External_ODF_Structured_Preview_Audit_2026-08-07.md)。

# 2026-08-07 EA-3D 交接入口

EA-3D 已完成 ODT 外部资格审计与源文件保护加固，但没有开放外部预览。机器合同仍为 `checkpoint`：Microsoft Word、LibreOffice Writer 已验证，WPS Writer 因 ODF 输出组件不可用保持阻断，生产者门禁为 2/3；`.odt` 继续不进入共享注册表，不新增外部命令或安装器关联。

ODT 解析和受限图片提取后现在会再次读取并逐字节核对源文件，Word/LibreOffice 真实 fixture 的命令层零修改测试通过，工作区状态栏显示“源文件未修改”。`check:external-odt-gate` 已加入当前开发审计链，持续防止 3/3 前误开放。外部能力仍为 23 类 `edit` 与 5 类 `preview`。接手后进入 EA-3E，逐类审计 DOCX、PPTX、XLSX 的外部只读或可靠新副本策略；ODT 等待可信 WPS 证据包。详见 [`UX50G_External_ODT_Eligibility_Gate_Audit_2026-08-07.md`](./UX50G_External_ODT_Eligibility_Gate_Audit_2026-08-07.md)。

# 2026-08-07 EA-3E 交接入口

EA-3E 已完成 DOCX 外部只读工作区。外部 DOCX 使用独立 preview 授权命令，解析后清空文本、样式和图片说明编辑目标，并在返回前再次核对源字节；页面隐藏撤销、编辑、隔离验证、覆盖和另存入口，只保留页面阅读、目录、搜索、定位、兼容画像与安全图片预览。资料库内 DOCX 的有界编辑和三生产者可靠保存能力没有改变。

外部能力现为 23 类 `edit` 与 6 类 `preview`，安装器关联仍只有 `.md/.markdown`。专项契约、DOCX 10 项回归、既有外部能力契约、前端类型检查与生产构建和 Rust 锁定检查均通过。接手后进入 EA-3F，单独开放并验证 PPTX 外部只读工作区；XLSX 继续保持 `import`。详见 [`UX50H_External_DOCX_Readonly_Workspace_Audit_2026-08-07.md`](./UX50H_External_DOCX_Readonly_Workspace_Audit_2026-08-07.md)。

# 2026-08-07 EA-3F 交接入口

EA-3F 已完成 PPTX 外部只读工作区。外部 PPTX 使用独立 preview 授权命令，保留缩略图、结构化画布、搜索、定位、备注、兼容画像、受限图片预览和放映；编辑准备、文本/样式/图片/形状/幻灯片补丁以及可靠另存区域均被隐藏并在函数入口再次阻断。解析后会重新读取并逐字节核对源文件。

外部能力现为 23 类 `edit` 与 7 类 `preview`，安装器关联仍只有 `.md/.markdown`。专项契约、PPTX 11 项回归、DOCX/ODF 既有契约、前端类型检查与生产构建和 Rust 锁定检查均通过。接手后进入 EA-3G，只审计 XLSX 外部只读与分页读取边界。详见 [`UX50I_External_PPTX_Readonly_Workspace_Audit_2026-08-07.md`](./UX50I_External_PPTX_Readonly_Workspace_Audit_2026-08-07.md)。

# 2026-08-07 EA-3G 交接入口

EA-3G 已完成 XLSX 外部只读分页工作区。外部 XLSX 使用独立 preview 授权的描述与 Sheet 分页命令，不执行中断写入恢复，每次解析前后都复核源字节；页面保留分页浏览、选区复制、公式显示、命名区域、样式、图表和脱敏连接信息，隐藏并阻断保存、草稿、重算、转换、结构编辑、动态数组和透视表重建。

外部能力现为 23 类 `edit`、8 类 `preview` 与 12 类 `import`，安装器关联仍只有 `.md/.markdown`。工作簿 39 项回归、外部授权 4 项回归、专项契约、前端类型检查、生产构建和 Rust 锁定检查均通过。EA-3 的现代 Office 外部只读阶段已收口；接手后进入 EA-4A，审计日志、Canvas、开放 Table、Draw.io、Mermaid 和 OPML 的直开资格，旧 Office/WPS 六类继续保持显式转换。详见 [`UX50J_External_XLSX_Readonly_Workspace_Audit_2026-08-07.md`](./UX50J_External_XLSX_Readonly_Workspace_Audit_2026-08-07.md)。

# 2026-08-07 EA-4A 交接入口

EA-4A 已完成 `.log` 外部专业查看与受保护编辑。外部日志复用有界范围读取、筛选、高亮、尾部跟随和自动刷新；进入编辑模式后保持 8 MiB 上限、撤销重做、覆盖确认和签名冲突保护，只有点击保存才写回。专用外部写入命令要求显式授权且不能由通用文本写入绕过。

外部能力现为 24 类 `edit`、8 类 `preview` 与 11 类 `import`，安装器关联仍只有 `.md/.markdown`。Canvas、开放 Table、Draw.io、Mermaid、OPML 继续保持 `import`，旧 Office/WPS 六类继续显式转换。接手后进入 EA-4B，先为 JSON Canvas 建立独立外部读取、显式保存、撤销重做、格式校验与签名冲突链路，再逐类审计其余专业格式。详见 [`UX50K_External_Log_Workspace_Audit_2026-08-07.md`](./UX50K_External_Log_Workspace_Audit_2026-08-07.md)。

# 2026-08-07 EA-4B 交接入口

EA-4B 已完成 `.canvas` 外部完整编辑。外部 Canvas 使用独立授权读写命令，保留画布交互、撤销重做和显式保存；读取和写入都执行 20 MiB 与 JSON Canvas 结构门禁，保存前确认覆盖并验证源文件签名，合法保存后更新签名，外部修改冲突不会被覆盖。

外部 Canvas 的文件节点只展示引用数据，不自动读取未授权文件；资料库图表/Mermaid 嵌入、创建、Markdown/图谱投影和索引能力没有外泄。外部能力现为 25 类 `edit`、8 类 `preview` 与 10 类 `import`，安装器关联仍只有 `.md/.markdown`。接手后进入 EA-4C，优先审计开放 Table、CSV、TSV 的外部编辑、编码、转换说明和签名保护；Draw.io、Mermaid、OPML 与旧 Office/WPS 保持现有边界。详见 [`UX50L_External_Canvas_Workspace_Audit_2026-08-07.md`](./UX50L_External_Canvas_Workspace_Audit_2026-08-07.md)。

# 2026-08-07 EA-4C 交接入口

EA-4C 已完成 `.table.json`、`.csv`、`.tsv` 外部专用编辑工作区。三类文件必须通过用户授权路径读取，编辑只驻留内存；点击保存后再次确认覆盖并校验源签名。CSV/TSV 保留原扩展名、分隔符、编码、BOM 和换行符，`.table.json` 保留原生表格、看板、图表与仪表盘视图，外部修改冲突不会被覆盖。

外部模式隐藏需要资料库目标的“创建 Table 副本”和导出入口，不会静默向外部目录创建文件。外部能力现为 26 类 `edit`、8 类 `preview` 与 9 类 `import`，安装器关联仍只有 `.md/.markdown`。接手后进入 EA-4D，依次审计 Draw.io、Mermaid/Diagram 与 OPML 的外部直开、显式保存、画布交互和引用隔离；旧 Office/WPS 六类继续保持显式转换或系统打开。详见 [`UX50M_External_Table_Workspace_Audit_2026-08-07.md`](./UX50M_External_Table_Workspace_Audit_2026-08-07.md)。

# 2026-08-07 EA-4D1 交接入口

EA-4D1 已完成 `.drawio`、`.dio` 外部结构化基础编辑。外部文件通过独立授权读取，专用 writer 在保存前重新执行 XML、压缩页、资源协议和结构预算门禁，并验证源签名；外链和外部图片只作为数据保留，不执行、不自动打开也不加载。草稿只驻留内存，点击保存后使用应用内确认覆盖，外部修改冲突不会被覆盖。

外部能力现为 27 类 `edit`、8 类 `preview` 与 8 类 `import`，安装器关联仍只有 `.md/.markdown`。接手后进入 EA-4D2，单独开放并验证 Mermaid `.mmd/.mermaid` 的外部源码编辑、实时预览、导出边界与签名保护；OPML 继续保持 `import`，旧 Office/WPS 六类继续显式转换。详见 [`UX50N_External_Drawio_Workspace_Audit_2026-08-07.md`](./UX50N_External_Drawio_Workspace_Audit_2026-08-07.md)。

## 2026-08-07 EA-4D2 External Mermaid Workspace

Mermaid `.mmd/.mermaid` 已进入授权后的外部直接编辑：外部路径不再依赖知识库，实时预览保持严格安全模式，修改只在点击保存或 Ctrl+S 后写回；覆盖前确认，后端继续执行 2 MiB、UTF-8、扩展名、语法和源签名检查，外部冲突不会覆盖。SVG/PNG 导出仍与源文件写回隔离。

外部能力现为 28 类 `edit`、8 类 `preview` 与 7 类 `import`，安装器关联仍只有 `.md/.markdown`。接手后进入 EA-4D3，单独开放并验证 OPML 外部 XML 保真、画布拖动/历史、显式保存和冲突保护；旧 Office/WPS 六类继续显式转换。详见 [`UX50O_External_Mermaid_Workspace_Audit_2026-08-07.md`](./UX50O_External_Mermaid_Workspace_Audit_2026-08-07.md)。

## 2026-08-10 EA-4D3 External OPML Workspace

OPML `.opml` 已进入授权后的外部直接编辑：外部路径不依赖知识库，思维导图/大纲、四种布局、三种主题、拖动多选、右键、键盘移动与撤销重做保持可用；修改只在点击保存或 Ctrl+S 后写回。覆盖前会说明 OPML 2.0 XML 规范化，后端继续执行 8 MiB、10,000 节点、64 层、DTD 拒绝、文档校验和源签名检查，外部冲突不会覆盖。依赖知识库创建新文件的 Canvas 投影在外部模式隐藏。

外部能力现为 29 类 `edit`、8 类 `preview` 与 6 类 `import`，安装器关联仍只有 `.md/.markdown`；剩余六类均为旧 Office/WPS 显式转换或系统打开工作流。接手后进行全部外部格式的默认应用选择、安装态启动与关联收口审计，再判断是否进入下一补丁版本。详见 [`UX50P_External_OPML_Workspace_Audit_2026-08-10.md`](./UX50P_External_OPML_Workspace_Audit_2026-08-10.md)。

## 2026-08-10 EA-5A 默认应用逐格式候选

“格式能力”页已提供逐格式 LongEdit 候选准备。只有用户点击的 `edit/preview` 格式会写入当前用户 `OpenWithProgids` 与 LongEdit 能力清单，随后由 Windows 页面完成最终默认应用确认；LongEdit 不写 `UserChoice`，安装器关联仍只有 `.md/.markdown`，旧 Office/WPS 六类继续排除。外部首实例与单实例启动仍先授权再路由，`external=1` 页面不再挂载资料库文件上下文，保持完整工作区。

接手后进入 EA-5B，对测试安装包执行真实 Windows 候选注册、冷启动、已有实例二次打开、中文/空格路径与卸载恢复回归。详见 [`UX50Q_Default_App_Candidate_Workflow_Audit_2026-08-10.md`](./UX50Q_Default_App_Candidate_Workflow_Audit_2026-08-10.md)。

## 2026-08-10 EA-5B1 默认应用候选卸载恢复

NSIS 卸载钩子已补齐运行时候选清理：37 类 `edit/preview` 格式的 85 个扩展名只删除 `LongEdit.ExternalFile` 值，并清理 LongEdit ProgID、能力清单和 `RegisteredApplications` 入口；其他应用候选、扩展名键和 Windows `UserChoice` 均不触碰。自动契约会从统一格式注册表核对完整集合，安装器静态关联仍只有 `.md/.markdown`。

接手后进入 EA-5B2，把候选触发、冷启动、已有实例二次打开、中文/空格路径和卸载恢复接入可丢弃 Windows 安装生命周期并执行真实 NSIS 证据回归。详见 [`UX50R_Default_App_Uninstall_Recovery_Audit_2026-08-10.md`](./UX50R_Default_App_Uninstall_Recovery_Audit_2026-08-10.md)。

## 2026-08-10 EA-5B2A 安装生命周期探针

U2 可丢弃 Windows runner 已接入 EA-5B 安装态探针：带中文/空格路径的外部 OPML 冷启动、已有实例接收外部 TXT、格式能力页真实触发 OPML/图片候选、未选择 JSON 反向检查、默认值与 `UserChoice` 前后比较，以及卸载后的 LongEdit 注册恢复。独立 JSON 与截图已纳入 R5K 必需证据；普通开发机不会执行安装或注册表变更。

接手后进入 EA-5B2B：以本阶段冻结提交触发 `U2 Unsigned Disposable Lifecycle`，等待真实 NSIS 安装、升级、启动、候选注册、卸载和回滚全部完成，下载并校验证据后再更新完成状态。详见 [`UX50S_Default_App_Installed_Lifecycle_Harness_Audit_2026-08-10.md`](./UX50S_Default_App_Installed_Lifecycle_Harness_Audit_2026-08-10.md)。

## 2026-08-10 EA-5B2B 安装态验收完成

托管运行 `31368123651` 已对冻结产品提交 `328d16d` 完成真实 NSIS 验收：22 项生命周期检查与 18 项安装产物检查全部通过。逐格式候选只由用户在“格式能力”中主动触发，未选择格式不接管，Windows 默认值不变；中文/空格路径冷启动、单实例二次打开、卸载清理、用户数据保留和回滚恢复均通过。证据清单及安装态截图已入库。

接手后进入 EA-5C：汇总 29 类直接编辑、8 类只读预览、6 类显式转换和 37 类/85 扩展名候选边界，逐项回写总体验验收清单；确认没有剩余 P0/P1 阻断后，再决定下一个补丁版本的版本号、README、安装包与 Release。当前包未签名，不得将本次结果写成真实签名或企业发布候选证明。

## 2026-08-16 P1-B5B PDF 元数据后端

标题、作者、主题、关键词四字段已实现资料库内 PDF 可靠新副本后端：PDFDocEncoding/UTF-16BE Unicode 写入、空值真实删除、五类保留 Info 键逐对象等价、可达非 Info 对象保真、完整重写、预览摘要锁定、目标不覆盖和源 SHA-256 前后复核均已进入自动回归。自定义 Info、XMP、附件、签名、加密与 PDF/A 继续 fail closed；这不是匿名化或完整隐私清理。

命令已经注册，但 `PdfView` UI 仍按阶段合同关闭。接手后进入 P1-B5C，只在原 PDF 右侧工作区接入紧凑面板、草稿离开保护、预验证与另存复开，并完成真实 Tauri 宽窄屏、中文路径、pypdf 和 Poppler 证据；随后执行 P1 总收口，再进入下一补丁版本发布。详见 [`P1B5B_PDF_Metadata_Copy_Backend_Audit_2026-08-16.md`](./P1B5B_PDF_Metadata_Copy_Backend_Audit_2026-08-16.md)。

## 2026-08-16 P1-B5C PDF 元数据原工作区

四字段属性面板已经进入原 `PdfView` 侧栏与命令条，没有新建顶层窗口。打开面板会先读取现有字段作为无修改基线；输入变更进入统一“属性草稿”与离开保护，任意修改都会使旧预验证失效。验证通过后必须确认这不是匿名化，才能可靠另存并在同一工作区打开新副本。外部 PDF 保持只读，面板字号、间距、边框、按钮与既有水印/表单面板使用同一主题变量。

静态合同、TypeScript 类型检查和生产构建已通过，阶段状态为 `workspace-complete-desktop-evidence-pending`。接手后进入 P1-B5D，执行真实 Tauri 宽窄屏、中文字段、草稿保护、保存复开、源文件不变，并用 pypdf/Poppler 独立核对；证据通过后进行 P1 总收口。详见 [`P1B5C_PDF_Metadata_Workspace_Audit_2026-08-16.md`](./P1B5C_PDF_Metadata_Workspace_Audit_2026-08-16.md)。
> **2026-08-21 v1.0.12 官方更新观察准备：** 已绑定公开 `v1.0.11`/`v1.0.12` NSIS、Release Tag、大小和 SHA-256，并新增一次性托管 Windows 工作流。当前状态严格保持 pending；下一步推送工具提交，执行用户确认、下载摘要、同目录覆盖、自动重启、最新版状态与合成资料保留的真实观察，再导入脱敏证据。
> **2026-08-21 v1.0.12 官方更新观察收口：** GitHub 托管运行 `32441493681` 已从公开 v1.0.11 真实升级到 v1.0.12，12/12、0 失败。用户显式确认、官方 NSIS SHA-256、同目录覆盖、更新助手自动重启、最新版状态以及覆盖/卸载后的合成资料保留全部通过；三张截图已人工复核，九份脱敏证据已导入并受 SHA-256 清单保护。
> **2026-08-21 v1.0.13 候选冻结：** 版本范围为主界面真实版本/更新入口、用户可见术语清理、43 格式事实审计和 Windows 证据采集兼容性。package、Cargo、Tauri 与活策略已提升到 1.0.13；公开稳定版和 README 下载仍保持 v1.0.12。下一步必须完成 Quality Gate、无签名 MSI/NSIS、托管安装生命周期、候选证据、GitHub Release 与远端附件复核。
# 2026-08-21 v1.0.13 发布候选交接入口

v1.0.13 产品源码已冻结在 `520588b78607ca12160d27802a412d2a5474418b`。紧凑升级弹窗与设置左侧导航稳定性已通过真实宽窄窗口审计；完整 Quality Gate `32443494918`、托管安装生命周期 `32444502244` 均通过，后者为 22/22 生命周期、18/18 安装后工作区、0 失败。本地 MSI/NSIS 哈希与 `NotSigned` 边界已写入 `docs/evidence/v1.0.13-release/`。

接手后只需等待本候选证据提交的 Quality Gate，通过后发布 `v1.0.13`，上传 NSIS、MSI 与 `SHA256SUMS.txt`，重新下载并核验三个远端附件，再更新 README、发布回执与审计状态。不要终止当前用户运行的 Long编辑实例；本地烟测因单实例占用而安全阻断，不构成产品失败。

## v1.0.13 发布回执

`v1.0.13` 已于 `2026-08-21T04:31:14Z` 发布，标签绑定 `d46e9f6884734a668851ab6fc24111525184029b`。NSIS、MSI 与 `SHA256SUMS.txt` 已从 GitHub 重新下载，大小和 SHA-256 均与本地候选一致。下一步只执行官方 `v1.0.12 -> v1.0.13` 应用内更新观察；本次版本发布本身已经收口。

## 2026-08-21 v1.0.13 发布后窄侧栏修复

主窗口 900 × 720、侧栏 200 px 时，左下角资料库卡片已改为按侧栏实际宽度响应：标签保持单行，名称省略，版本徽标留在卡片内，非关键状态点与箭头在窄布局隐藏。隔离浏览器实际页面审计记录为卡片高 59.98 px、横向溢出 0、运行时错误 0，生产构建及相关静态检查均通过。

这是发布后的源码修复，尚未进入新的安装包；接手后可继续累计已验收的小范围体验改进，达到版本范围后再统一提升版本、更新 README 和发布 Release。详见 [`Post_v1.0.13_Sidebar_Footer_Responsive_Audit_2026-08-21.md`](./Post_v1.0.13_Sidebar_Footer_Responsive_Audit_2026-08-21.md)。

## 2026-08-21 小尺寸 UI 横向审计

900 × 720 与 720 × 640 两档真实页面审计已覆盖资料库、工作台、8 个设置分类、格式能力和两类图谱，共 26 个样本。资料库、工作台、格式能力与图谱未发现同类压缩缺陷；设置页修复了窄布局滚动位置残留、Grid 剩余高度拉伸导致标题上下浮动，以及靠右激活分类未自动进入视口的问题。修复后 16 个设置样本标题顶边均为 184 px，26/26 样本无横向溢出、文字竖排、控件裁切或运行时错误。

现有 11 类编辑器的 99 张 Tauri 视觉证据及命令条、滚轮导航、文本、结构化源码、工作簿和媒体响应式合同继续通过。接手后若继续累计发布后体验优化，应保留 `npm run audit:small-window-ui` 门禁；本次源码仍未进入新的安装包。详见 [`Post_v1.0.13_Small_Window_UI_Audit_2026-08-21.md`](./Post_v1.0.13_Small_Window_UI_Audit_2026-08-21.md)。

## 2026-08-21 侧栏信息架构收口

资料库侧栏已明确为“文件、搜索、目录、标签、关系、最近、备份”。原“保存”实际是常用搜索，现已改名并说明不会复制或修改文件；标签明确使用 Markdown 正文中的 `#标签名`；原“引用”移除窄栏内重复且易变形的局部图谱，只保留当前 Markdown 的链出、链入和进入完整知识图谱的入口。最近与备份能力保持不变。

隔离 Tauri 真实资料库审计验证了七个入口、标签索引、1 条链出/1 条链入、200 px 窄栏零横向溢出和零运行时错误。接手后继续把本轮发布后体验修复作为下一补丁版本候选范围，不单独打包；详见 [`Post_v1.0.13_Sidebar_Information_Architecture_Audit_2026-08-21.md`](./Post_v1.0.13_Sidebar_Information_Architecture_Audit_2026-08-21.md)。

补充验收后，入口最终顺序调整为“文件、目录、最近、备份、常用搜索、关系、标签”。“常用搜索”明确为记录并重放文件页关键词与格式条件；Markdown 专属标签移动到末位并优化了格式标识、添加区和结果列表。后端标签解析同步排除中英文句末标点，真实样本 `#product.` 现正确显示和检索为 `#product`。

## 2026-08-21 v1.0.14 候选范围

v1.0.14 汇总 v1.0.13 发布后的三组已验收修复：窄侧栏资料库卡片、26 个小尺寸管理界面，以及资料库侧栏信息架构和标签解析。现版本完整补丁门禁通过、生产依赖漏洞为 0；package、Cargo、Tauri 与当前发布策略已提升到 1.0.14。下一步构建无签名 NSIS/MSI、记录哈希、发布 GitHub Release 并重新下载核验远端附件。

## 2026-08-21 v1.0.14 发布后更新进度反馈

应用内更新已从整包内存读取改为受大小上限保护的分块下载与临时文件写入，并在下载、SHA-256 校验、启动安装三个阶段向前端发送真实进度。新版本弹窗与“设置 → 系统与更新”同时显示百分比和已下载/总容量；下载期间会锁定重复检查、发布详情和稍后提醒，避免并发操作覆盖安装状态。失败仍会删除未完成临时文件，官方 GitHub 来源、附件大小和 SHA-256 信任边界不变。

这是 `v1.0.14` 正式发布后的下一补丁源码改进，尚未进入现有 Release。接手后应在出现更高版本候选时，通过托管 Windows 更新生命周期真实观察进度递增、校验阶段、安装重启与失败清理，再随下一次 `+0.01` 版本统一打包发布。

## 2026-08-21 设置页悬浮光效修复

设置页右侧整栏卡片不再直接套用最高 `1.02` 的通用缩放，悬浮缩放已限制为 `1.002` 并固定顶部变换原点，避免宽屏下越出滚动容器后裁切光影。深色新拟态主题补齐了专用悬浮阴影，移除从浅色样式继承的高亮白色外发光，改为受边界约束的暗部投影、主题色柔光和内侧高光。主题与设置页契约现已锁定这两个边界。

## 2026-08-21 当前开发状态与接手顺序

当前远端主线为 `main@98b5a740e4c7a1e5433c764f6e0c3a825583e8f9`，本地与 `origin/main` 无领先或落后。公开稳定版仍为 [`v1.0.14`](https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.14)，已于 2026-08-21 发布；当前 package、Cargo 与 Tauri 版本仍保持 `1.0.14`。项目处于“已发布版本后的下一补丁增强积累”阶段，不是新的 Release 候选。

`v1.0.14` 发布后已完成两项源码增强：`26ffe90` 为应用内更新增加真实流式下载进度、容量和下载/校验/安装阶段反馈；`98b5a74` 修复设置页整栏卡片缩放越界及深色新拟态悬浮白光。两项完整补丁门禁均通过，GitHub Quality Gate 分别为 `32468774589` 与 `32470133663`，生产依赖漏洞为 0；这些改进尚未包含在现有 `v1.0.14` 安装包中。

接手后按以下顺序继续：

1. 在下一版本候选可下载后，使用真实 Windows 安装生命周期验证从 `v1.0.14` 更新时进度持续递增、SHA-256 校验阶段可见、安装后自动重启，且网络中断或校验失败会清理临时文件。
2. 在深色新拟态及核心主题下，以宽屏和窄窗口复核设置页右侧卡片悬浮，确认无白色硬光、横向裁切、滚动条抖动或内容位移。
3. 若不再发现阻塞问题，将上述两项作为 `v1.0.15` 候选范围；随后统一提升 package、Cargo、Tauri 与发布策略版本，执行完整 Quality Gate，构建无签名 NSIS/MSI 并记录 SHA-256。
4. 托管安装生命周期通过后再全面更新 README 和发布说明，发布 GitHub Release，并重新下载远端 NSIS、MSI 与 `SHA256SUMS.txt` 核对大小和摘要。

当前无已知代码阻塞项。不要提前把版本改为 `1.0.15`，也不要宣称上述发布后增强已进入 `v1.0.14`；版本冻结应发生在真实交互复核完成之后。

## 2026-08-26 M2A2 换机交接

当前开发版本为 1.0.15。M2A2 已完成工作台治理入口收敛：工作台只保留一个“需要处理”队列，关系覆盖率、关系类型、核心主题、改善建议和孤立对象详情位于知识图谱治理面板；概览与索引先返回，关系及重复文件分析后台执行。

真实 M0 中文路径资料库验证主内容 1105 ms、后台分析 1253 ms；1 断链、1 歧义、1 重复组、1 未引用批注均只在主队列出现，1280/760/480 无页面级横向溢出，运行时错误 0，整库 SHA-256 前后相同。证据见 [M2A2 审计](./Post_v1.0.15_M2A2_Workspace_Governance_Consolidation_Audit_2026-08-26.md)。

接手后直接进入 M2A3：合并常用 Canvas、收藏与最近文件并补待办筛选；继续使用 M0 固定资料库记录预期与实际差异。M2A3 通过后审计 M2 是否收口，再恢复 M1B2A。当前不是发布候选，releaseCandidate=false。

## 2026-08-26 M2 工作台收口交接

当前开发版本仍为 1.0.15，M2 已完成并收口。工作台现可通过键盘快速新建真实文件或打开文件，点击 Markdown 待办可定位并高亮原文行；加载、已配置空资料库和读取失败重试均有明确状态。

真实隔离 Tauri 审计使用 1011 个文件，首个可操作时间 801 ms；测试创建并打开 `未命名.md`，清理后资料库 SHA-256 与测试前逐字节一致。任务定位到固定第 3 行，720/480 窄窗口、失败恢复和两组运行时错误门禁均通过。证据见 [M2 工作台收口审计](./Post_v1.0.15_M2_Workspace_Closure_Audit_2026-08-26.md)。

接手后直接进入 M1B2A：使用真实 Microsoft Word、WPS 与 LibreOffice DOCX 样本，对页眉页脚、表格、图片布局、段落样式和超链接进行生产者对象选择审计。先记录当前与预期差异、未知关系保持和复开风险，再选择最小安全实现范围。本阶段不是发布候选，releaseCandidate=false。

## 2026-08-26 显式保存需求纠偏交接

需求复核确认 Markdown 的两秒自动源文件写入偏离了“所有格式只在点击保存后写入”的基本原则。当前已删除该写入链路，保留内存草稿、未保存状态和独立历史快照；设置页也已把相关选项明确为“历史快照间隔”。

真实 Tauri 前后对照已通过：旧提交 `87c6bd5` 在不点击保存、等待 3.5 秒后改变 fixture SHA-256 并清除脏状态；当前实现同样等待后源文件逐字节不变且脏状态保留，点击保存后才写入，重载可见，720x680 无页面横向溢出，运行时错误为 0。证据与复现命令见 [`Post_v1.0.15_Explicit_Save_Alignment_Audit_2026-08-26.md`](./Post_v1.0.15_Explicit_Save_Alignment_Audit_2026-08-26.md)。

接手后先建立 10,000 文件真实资料库的索引与搜索性能基线，覆盖首次/增量索引、查询、取消、重启恢复及工作台首个可操作时间。通过后再进入 M1B2A DOCX 生产者对象选择审计。当前仍为 1.0.15，`releaseCandidate=false`。
# 2026-08-27 开发版本身份对齐

当前开发目标为 `1.0.16`，运行时和当前公开版本仍为 `1.0.15`。`main` 已领先公开标签 `v1.0.15`；主界面与格式能力页必须明确显示开发线身份，package、Cargo、Tauri、公开策略和历史制品哈希只在 M4 发布冻结时原子提升。M1D 对象选择审计已完成，当前阶段为 M1D-A 大 JSON 渐进只读与流式搜索。接手后先运行 `npm run check:development-version-identity` 与 `npm run check:post-v115-m1d-selection`。详见 [`Post_v1.0.15_Development_Version_Identity_Alignment_Audit_2026-08-27.md`](./Post_v1.0.15_Development_Version_Identity_Alignment_Audit_2026-08-27.md) 与 [`Post_v1.0.15_M1D_Media_Structured_Selection_Audit_2026-08-27.md`](./Post_v1.0.15_M1D_Media_Structured_Selection_Audit_2026-08-27.md)。
> **2026-08-27 M1D 对象选择审计已通过：** 真实 10 MiB JSON 在 98,758 ms 后仍停留“正在读取并分析”，搜索与树形不可用；50 MiB JSON 在 699 ms 明确阻断。真实 WebView2 生成的 1080p/4K VP9 WebM 分别在 292/141 ms 加载，损坏 MKV 在 162 ms 显示清晰解码退路，运行时错误 0，JSON 源摘要不变。下一步固定为 M1D-A 大 JSON 渐进只读、分段导航与流式搜索；小 JSON 保持完整编辑，媒体逐帧/截图顺延至 M1D-B。详见 [`Post_v1.0.15_M1D_Media_Structured_Selection_Audit_2026-08-27.md`](./Post_v1.0.15_M1D_Media_Structured_Selection_Audit_2026-08-27.md)。

## 2026-08-27 当前状态审计与 M3 接手入口

当前权威主线为 `main@67eddb5a5637164932e951984b34fbc5972ecd39`，本地与 `origin/main` 一致；其他远端分支均落后且没有需要合并的独有提交。M0、M1、M2 和 10,000 文件索引基线已经完成，当前阶段固定为 **M3 知识图谱 2.0 选择审计**。运行时/公开版本仍为 `1.0.15`，开发目标为 `1.0.16`，`releaseCandidate=false`。

接手后先用 M0 固定 100/1000/5000 节点图谱记录真实 Tauri 修正前交互与性能，再优先实现“稳定对象/关系语义注册表 + 图例”；随后依次推进邻居聚焦、独立验证的最短路径、社区发现、视觉镜头和大图生命周期。不得先做纯光效，也不得提前进入 M4 或提升版本。完整结论与验收顺序见 [`Current_Development_Status_and_M3_Entry_Audit_2026-08-27.md`](./Current_Development_Status_and_M3_Entry_Audit_2026-08-27.md)。

## 2026-08-27 M3-0 真实图谱基线交接

M3-0 已完成真实 Tauri 100/1000/5000 节点修正前基线。1000 节点首次可见 638 ms、布局稳定 11654 ms并出现 84 个长任务；5000 节点首次可见 19378 ms、布局稳定 115802 ms、最长任务 9334 ms，截图确认标签密集重叠。三档选择、缩放、返回、零运行时错误和源文件不变通过，1000 节点 20 次进入退出仍可导航。

下一步直接进入 **M3A-1 稳定对象/关系语义注册表 + 用户可见图例**。统一 `GraphView`、`LocalGraph` 和导出语义，提供未知类型降级与固定排序；先完成合同、跨格式真实桌面证据和审计，再进入邻居聚焦。不要修改本次修正前证据。详见 [`Post_v1.0.15_M3_0_Knowledge_Graph_Real_Baseline_Audit_2026-08-27.md`](./Post_v1.0.15_M3_0_Knowledge_Graph_Real_Baseline_Audit_2026-08-27.md)。

## 2026-08-27 M3A-1 图谱语义与图例交接

M3A-1 已完成：11 类对象与 12 类关系的名称、顺序、方向、形状、线型和颜色进入统一注册表，全局图谱、局部图谱、导出与用户图例共用同一事实源，并为未知类型提供安全降级。

真实跨格式 Tauri 资料库生成 17 个节点、17 条边，11 类对象全部出现，普通引用、包含、嵌入、依赖、批注、支持 6 类关系按固定顺序显示；1280/720 两档无页面横向溢出、运行时错误为 0、源文件不变且返回资料库通过。接手后直接进入 **M3A-2 邻居聚焦与返回**，完成一至三跳聚焦、焦点范围说明和返回全图，不提前混入最短路径、社区或大图视觉。详见 [`Post_v1.0.15_M3A1_Graph_Semantics_and_Legend_Audit_2026-08-27.md`](./Post_v1.0.15_M3A1_Graph_Semantics_and_Legend_Audit_2026-08-27.md)。

## 2026-08-27 M3A-2 邻居聚焦交接

M3A-2 已完成并经需求复核补齐 1/2/3 跳切换。真实跨格式图谱在 1/2/3 跳下分别为 3 节点/3 边、6/7、8/9；范围条持续显示焦点、深度与数量，图例同步当前子图，返回全图后恢复 17/17。运行时错误为 0、源文件不变、资料库返回通过。

接手后进入 **M3A-3 独立验证的双节点最短路径**；先冻结算法输入/输出与无路径状态，再接 UI 和真实桌面证据，不提前进入社区发现。详见 [`Post_v1.0.15_M3A2_Neighbor_Focus_and_Return_Audit_2026-08-27.md`](./Post_v1.0.15_M3A2_Neighbor_Focus_and_Return_Audit_2026-08-27.md)。

## 2026-08-27 M3A-3 最短路径交接

M3A-3 已完成独立纯函数 BFS、独立距离 oracle 和双节点桌面工作流。真实跨格式图谱中 `NorthStar → Evidence` 为 3 跳、4 节点/3 边，返回后恢复 17/17；另一跨格式目标明确显示无路径。宽窄屏、零运行时错误和源文件不变通过。

当前接续点为 **M3A-4 关系证据回跳**：路径每条边必须展示全部 mention 的来源语法、方向、类型和上下文，并可回到来源对象位置；不要提前进入社区发现。详见 [`Post_v1.0.15_M3A3_Independently_Verified_Shortest_Path_Audit_2026-08-27.md`](./Post_v1.0.15_M3A3_Independently_Verified_Shortest_Path_Audit_2026-08-27.md)。

## 2026-08-27 M3A-4 关系证据回跳交接

M3A-4 已完成路径边全部证据展开与来源回跳。真实 3 边路径显示 3 条 mention，同一 `depends-on` 边的两次来源均保留；原始方向在反向路径遍历中不改写，无 mention 的结构边明确回到来源对象定位。点击证据实际打开 `Brief.md` 并高亮第 3 行，宽窄屏、零运行时错误和源文件不变通过。

当前接续点为 **M3A-5 社区发现与稳定性**：先定义可独立验证的确定性社区算法、稳定社区 ID、摘要与筛选，再接 UI 和真实桌面证据；不要提前进入 M3B 视觉镜头。详见 [`Post_v1.0.15_M3A4_Relation_Evidence_and_Source_Return_Audit_2026-08-27.md`](./Post_v1.0.15_M3A4_Relation_Evidence_and_Source_Return_Audit_2026-08-27.md)。

## 2026-08-28 M3A-5 社区发现与稳定性交接

M3A-5 已引入 Graphology Louvain，完成确定性无向加权投影、成员派生稳定社区 ID、主题摘要、只读筛选和显式返回。算法夹具连续 20 次和乱序输入结果一致；真实 17 节点/17 边图谱得到 5 个社区（4/4/3/3/3），模块度 0.670，同一资料库重新进入图谱后 ID 全部一致。筛选 4 节点/3 边并恢复 17 节点、宽窄屏、零错误、返回资料库和源文件不变均通过。

需求复核纠正了此前接续文档的遗漏：原始 M3A 在社区发现后仍要求双节点比较、邻居固定和选择历史，不能直接进入 M3B。当前接续点为 **M3A-6 双节点比较**；完成后继续 M3A-7 邻居固定与选择历史，再做 M3A 退出审计。详见 [`Post_v1.0.15_M3A5_Community_Discovery_and_Stability_Audit_2026-08-28.md`](./Post_v1.0.15_M3A5_Community_Discovery_and_Stability_Audit_2026-08-28.md)。

## 2026-08-28 M3A-6 双节点比较交接

M3A-6 已完成属性、共同/独有邻居和直接关系证据对照。纯函数合同明确无向邻居去重和端点排除，同时保留直接关系原始方向、平行边及全部 mention。真实两个 Canvas 节点得到共同 `System` 1 个、左右独有各 1 个和有向 `supports` 1 条；`NorthStar`/`Brief` 对照保留 `depends-on`、`links-to` 两条关系及 3 条 mention，并准确回到 `Brief.md` 第 3 行。宽窄屏、零错误、返回资料库和源文件不变均通过。

当前接续点为 **M3A-7 邻居固定与选择历史**：先冻结只属于当前探索会话的固定/历史状态、容量、去重和回退语义，再接 UI 与真实桌面证据；不得写回用户关系。完成后进行 M3A 退出审计，不直接进入 M3B。详见 [`Post_v1.0.15_M3A6_Dual_Node_Comparison_Audit_2026-08-28.md`](./Post_v1.0.15_M3A6_Dual_Node_Comparison_Audit_2026-08-28.md)。

## 2026-08-28 M3A-7 邻接固定与选择历史交接

M3A-7 已按原设计纠正为“将局部关系图固定到编辑器右栏并跟随活动标签”，不是坐标锁定或收藏。全局图谱新增会话内最多 20 条的选择历史，具备规范化去重、回退/前进、回退后分支截断与缺失节点安全恢复；固定偏好仅保存在设备本地，均不写回资料库。

真实 Tauri 审计完成 `1 → 17 → 0 → 17 → 1 → 17` 历史往返；`NorthStar.md` 的固定局部图谱为 6 节点/7 边，并能跟随切换到 `Brief.md`。首次审计暴露的 Windows `\\?\` 路径等价性缺陷已修复。宽窄屏、取消固定、零错误、返回资料库和源文件不变均通过。

当前接续点为 **M3A-8 语义探索退出审计**：组合复验 M3A-1 至 M3A-7 的状态互斥、返回路径、证据、安全与响应式边界，通过后才进入 M3B。详见 [`Post_v1.0.15_M3A7_Neighbor_Pinning_and_Selection_History_Audit_2026-08-28.md`](./Post_v1.0.15_M3A7_Neighbor_Pinning_and_Selection_History_Audit_2026-08-28.md)。

## 2026-08-28 M3A 语义探索退出交接

M3A-8 已完成并使 M3A 在原路线范围内收口。组合审计发现并修复了社区范围与邻居、路径、选择历史静默叠加的问题；当前五类探索入口统一互斥。真实 Tauri 同会话完成 3/3→8/9 邻居扩展、4 节点/3 边路径及三条边证据、4 节点社区、共同邻居 1 的双节点比较、历史单选恢复和 6 节点/7 边编辑器局部图谱。

范围序列为 `neighbor → path → community → comparison → history → global`，宽窄屏、零错误、源文件不变和返回资料库通过；M3A-1 至 M3A-7 的独立证据全部重新进入退出门禁。普通节点详情与局部图谱仍以首条 mention 摘要为主，`FR-GRAPH-004` 不扩大为全部完成。

当前接续点为 **M3B-0 专业视觉基线选择审计**：先审计当前社区、缩放层级、路径、导航、聚类镜头、主题和减少动效的真实差异，再选择最小视觉实现；不得直接做无语义背景光效。详见 [`Post_v1.0.15_M3A_Semantic_Exploration_Exit_Audit_2026-08-28.md`](./Post_v1.0.15_M3A_Semantic_Exploration_Exit_Audit_2026-08-28.md)。

## 2026-08-28 M3B-0 专业视觉基线交接

M3B-0 已完成实际代码、M3-0 大图证据和当前跨格式真实桌面的三方对照。固定缩放阈值使 28% 远景只剩无语义彩点，而 1,000/5,000 节点默认比例标签严重重叠；社区没有轮廓或远景摘要，网络边无曲线/平行边分离/关系标签，路径证据面板会覆盖路径主体。缩略导航、适应选择、聚类镜头、图谱全屏和图谱内 `reduced` 消费均未实现。运行时错误 0、源文件不变、宽窄屏和返回资料库通过。

当前接续点为 **M3B-1 语义缩放与社区远景**：建立缩放加密度驱动的远/中/近稳定层级，远景必须显示可识别且可进入的社区摘要；保留 M3A 语义与探索状态，先不要扩大到路径动画、缩略图或 M3C 性能重构。详见 [`Post_v1.0.15_M3B0_Professional_Visual_Baseline_Selection_Audit_2026-08-28.md`](./Post_v1.0.15_M3B0_Professional_Visual_Baseline_Selection_Audit_2026-08-28.md)。

## 2026-08-28 M3B-1 语义缩放与社区远景交接

M3B-1 已将固定缩放阈值替换为缩放/可见节点密度共同判定的远中近层级。远景绘制稳定社区摘要和聚合连接，中景只标注 8～28 个确定性关键节点，近景显示全部标题；社区可由 Canvas 或键盘入口进入既有筛选并返回，导出仍是实际节点/边。首次审计发现的 720×680 社区摘要右侧越界和状态栏拆行已修复，并新增全部摘要画布内门禁。

三主题、三档窗口、零错误、源文件不变和返回资料库通过。当前接续点为 **M3B-2 社区轮廓与语义层级**：围绕中近景成员建立不遮挡关系、主题适配且不移动真实节点的轮廓/色带；不要提前扩到路径动画、缩略导航或 M3C。详见 [`Post_v1.0.15_M3B1_Semantic_Zoom_and_Community_Overview_Audit_2026-08-28.md`](./Post_v1.0.15_M3B1_Semantic_Zoom_and_Community_Overview_Audit_2026-08-28.md)。

## 2026-08-28 M3B-2 社区轮廓与语义层级交接

M3B-2 已在中近景建立由稳定 Louvain 社区和成员当前坐标派生的确定性凸包色带。轮廓位于关系与节点下层，不修改坐标、不参与布局、不写入资料库；中景保留社区名/成员数，近景弱化为虚线边界，远景仍使用可进入的摘要。三主题、三档窗口均为 5 个轮廓且成员包覆门禁通过，运行时错误 0、源摘要不变并返回资料库。审计期间还修复了安全区不足时窄屏远景摘要偶发越界。

当前接续点为 **M3B-3 路径与关系视觉表达选择审计**：先对照路线图和实际代码冻结网络曲线、平行边分离、关系标签、选中路径方向表达及减少动效边界，再选择最小实现；不得提前宣称缩略导航、聚类镜头或 M3C 完成。详见 [`Post_v1.0.15_M3B2_Community_Contours_and_Semantic_Hierarchy_Audit_2026-08-28.md`](./Post_v1.0.15_M3B2_Community_Contours_and_Semantic_Hierarchy_Audit_2026-08-28.md)。

## 2026-08-28 M3B-3 选择审计与换机交接

远端 `main` 的功能基线为 `12fe433`，M3B-3 本次只完成事实审计与接续冻结。network 边仍为直线，同端点关系重叠，Canvas 无关系标签或路径专属表达；路径算法、3 条真实边证据、来源回跳、社区语义层级和资料库安全均保持。最新 Tauri 画面确认路径证据面板覆盖主体，图谱也尚未消费全局 `reduced` 偏好。

当前接续点为 **M3B-4 曲线/平行关系与静态路径标签**。换机后先执行 `git pull --ff-only origin main`、`npm ci`、`npm run check:development-version-identity`、`npm run check:post-v115-m3b3-path-relationship-visual-selection` 和 `npm run build`；工作区必须干净。详细事实、边界和命令见 [`Post_v1.0.15_M3B3_Path_and_Relationship_Visual_Selection_and_Handoff_Audit_2026-08-28.md`](./Post_v1.0.15_M3B3_Path_and_Relationship_Visual_Selection_and_Handoff_Audit_2026-08-28.md)。

## 2026-08-28 M3B-4 曲线关系与静态路径标签交接

M3B-4 已完成确定性 network 二次曲线路由、2 条真实平行/互反关系分离、曲线切线箭头、仅选中路径的 3 个静态关系标签，以及证据面板之外的响应式相机取景；Canvas 与 SVG/PNG 导出共用路由几何。真实审计先后暴露零曲率中心槽、按面积选错相机区域、窄屏面板实际遮住路径和标签间距不足，均按截图实际效果修正后重跑。

暗/浅/高对比三主题和 `1280×800`、`1000×700`、`720×680` 全部通过：17/17 全图、4 节点/3 边路径、3 个标签、3 条证据边、零运行时错误、资料库摘要不变并返回资料库。当前接续点为 **M3B-5 选中路径方向动效与减少动效合同**；先冻结 reduced/失焦/离开边界，不提前进入缩略导航或 M3C。详见 [`Post_v1.0.15_M3B4_Curved_Parallel_Relations_and_Static_Path_Labels_Audit_2026-08-28.md`](./Post_v1.0.15_M3B4_Curved_Parallel_Relations_and_Static_Path_Labels_Audit_2026-08-28.md)。

## 2026-08-28 M3B-5 路径方向动效与减少动效交接

M3B-5 已在活动最短路径上增加按用户起点到终点推进的流动层，同时保留独立的关系事实箭头和静态标签。真实 `NorthStar → Evidence` 路径包含 1 段顺事实、2 段逆事实关系，三段流动方向仍保持一致；非路径边不参与。应用或系统 reduced 会完全关闭流动，失焦/隐藏/离开均停止任务。

暗/浅/高对比 × calm/reduced 共 6 个真实 Tauri 会话、宽窄屏 Canvas 像素对照、失焦/恢复、3 标签/3 证据、零错误、源摘要不变和返回资料库全部通过。首轮证据方向计数不足、reduced 恢复字段语义相反和零时间增量归零问题已修正并重跑。当前接续点为 **M3B-6 导航与镜头系统选择审计**，先审计再选择最小镜头增量，不提前宣称 M3C 完成。详见 [`Post_v1.0.15_M3B5_Selected_Path_Direction_Motion_and_Reduced_Motion_Audit_2026-08-28.md`](./Post_v1.0.15_M3B5_Selected_Path_Direction_Motion_and_Reduced_Motion_Audit_2026-08-28.md)。

## 2026-08-28 M3B-6 导航与镜头选择审计交接

M3B-6 已完成真实代码与 Tauri 三档窗口对照，本阶段未修改产品运行代码。现有 `fitGraph` 可适配全部可见节点并尊重面板安全区域，社区可从 17 节点进入 4 节点/3 边过滤子图并返回；适应选择、缩略导航、聚类展开/折叠和图谱全屏均未实现。搜索聚焦会立即改变 Canvas，但因过滤结果重启力布局，260ms 后仍未稳定，不能宣称已有平滑或有界聚焦。

真实矩形测量还发现：1280/1000 下末端适配命令完整可见，720 下工具栏虽可横向滚动，但实测距离最大滚动仍差约 12px，末端按钮被裁切。当前接续点冻结为 **M3B-7 适应选择与减少动效安全聚焦**，并把 720px 命令完整可达列为入口验收；缩略图、聚类镜头、全屏和 M3C 继续延后。详见 [`Post_v1.0.15_M3B6_Navigation_and_Camera_System_Selection_Audit_2026-08-28.md`](./Post_v1.0.15_M3B6_Navigation_and_Camera_System_Selection_Audit_2026-08-28.md)。

## 2026-08-28 M3B-7 适应选择与安全聚焦交接

M3B-7 已完成适应当前可见选择、可中止的有界节点聚焦、详情面板安全取景和 reduced 即时到位。搜索查询不再无条件重启力布局，结构过滤仍保持重布局语义；新增相机纯函数为边界、点聚焦、缓动和插值提供独立 oracle。真实 calm 聚焦约 344ms/43 帧，连续替换目标取消旧任务 1 次；reduced 约 38ms/0 帧。两会话分别真实框选 3、4 个节点并适应选择，最终几何和完成后像素稳定。

1280/1000/720 下“适应选择”和“适合窗口”均完整可达，运行时错误 0、源摘要不变并返回资料库。当前接续点为 **M3B-8 剩余导航系统选择审计**：在缩略导航、聚类镜头和图谱全屏中只选择下一个最小增量，状态环与 M3C 继续延后。详见 [`Post_v1.0.15_M3B7_Fit_Selection_and_Reduced_Motion_Safe_Focus_Audit_2026-08-28.md`](./Post_v1.0.15_M3B7_Fit_Selection_and_Reduced_Motion_Safe_Focus_Audit_2026-08-28.md)。

## 2026-08-28 M3B-8 剩余导航选择审计交接

M3B-8 已完成且未修改图谱产品运行代码。真实 100/1000/5000 节点证据确认大图导航首先缺少全局方位；当前相机已有有界/reduced 安全过渡，适合用只读缩略图显示视口并导航。社区实际是 `17 → 4 节点/3 边 → 17` 的过滤子图，不是聚类折叠；Fullscreen API 虽可用，产品没有命令且不能解决方位。

真实 Tauri 三档窗口无页面溢出、运行时错误 0、源摘要不变并返回资料库。测试发现相机诊断初始为空、首次相机动作后才同步，因此下一阶段必须从实时内部状态初始化，不能要求用户先点“适合窗口”。当前接续点为 **M3B-9 有界语义缩略图与视口导航**；聚类折叠、全屏、状态环和 M3C 继续延后。详见 [`Post_v1.0.15_M3B8_Remaining_Navigation_System_Selection_Audit_2026-08-28.md`](./Post_v1.0.15_M3B8_Remaining_Navigation_System_Selection_Audit_2026-08-28.md)。

## 2026-08-28 M3B-9 有界语义缩略导航交接

M3B-9 已完成由可见节点派生的无标签语义缩略图、实时视口框和点击/拖动/方向键导航。点击共享现有有界且 reduced 安全的相机；拖动直接跟随指针；相机诊断在首次绘制即同步。投影纯函数对 5000 节点最多绘制 600 点，不修改布局或资料库。

暗色 calm、暗色/浅色/高对比 reduced 共四个真实 Tauri 会话覆盖 1280/1000/720：calm 为 `343ms/40帧`，reduced 为 `8～25ms/0帧`，详情/图例/状态栏/远景入口碰撞均为 0，运行时错误 0、源摘要不变并返回资料库。当前接续点为 **M3B-10 剩余专业视觉系统选择审计**，只从聚类折叠、全屏和节点状态外环中选择一个最小增量；M3C 继续延后。详见 [`Post_v1.0.15_M3B9_Bounded_Semantic_Minimap_and_Viewport_Navigation_Audit_2026-08-28.md`](./Post_v1.0.15_M3B9_Bounded_Semantic_Minimap_and_Viewport_Navigation_Audit_2026-08-28.md)。

## 2026-08-28 M3B-10 剩余专业视觉系统选择交接

M3B-10 已完成且未改图谱产品运行代码。`GraphNode.modifiedAt` 来自真实文件系统秒级时间，当前可见图度数已同步计算；治理侧栏则独立异步扫描，不能直接当作逐节点状态合同。代理聚类节点和产品全屏仍不存在。

真实暗色/reduced Tauri 覆盖 1280/1000/720，七档文件时间均唯一，知识脉搏为 17 对象/17 关系/100% 覆盖，运行时错误 0、源摘要不变并返回资料库。当前接续点为 **M3B-11 克制的近期修改与关系强度节点外环**，不得引入治理扫描；聚类折叠、全屏、治理外环和 M3C 继续延后。详见 [`Post_v1.0.15_M3B10_Remaining_Professional_Visual_System_Selection_Audit_2026-08-28.md`](./Post_v1.0.15_M3B10_Remaining_Professional_Visual_System_Selection_Audit_2026-08-28.md)。

## 2026-08-28 M3B-11 克制节点状态外环交接

M3B-11 已实现 7/30 天近期修改和当前可见图上四分位关系强度外环。状态由纯函数派生，度数均匀时不制造强弱；选择、悬停和路径节点压制外环，远景与思维导图隐藏，治理调用为 0，SVG/PNG 保持原有事实图导出。

四个真实 Tauri 会话、三档窗口、真实七档文件时间和 4 节点路径通过；实际为状态节点 8、选中后 7、路径/远景/思维导图 0，零运行错误且源摘要不变。当前接续点为 **M3B-12 专业视觉系统退出审计**，判断剩余聚类折叠和全屏是否继续，或结束 M3B 进入 M3C。详见 [`Post_v1.0.15_M3B11_Restrained_Recency_and_Relation_Strength_Node_Rings_Audit_2026-08-28.md`](./Post_v1.0.15_M3B11_Restrained_Recency_and_Relation_Strength_Node_Rings_Audit_2026-08-28.md)。

## 2026-08-28 M3B-12 专业视觉系统退出审计交接

M3B 已通过退出审计。四个真实 Tauri 会话以同一 17 节点/17 边资料库组合复验图例、语义缩放、社区、路径、相机、缩略图、状态环和三档响应式；普通与路径共 24 个视口布局均无页面溢出或已审计覆盖层碰撞，calm 动效推进、reduced 完全静止，运行时错误 0、源摘要不变并返回资料库。

首次退出门禁误把全局 2 条平行路由要求到无平行边的 3 边路径子图，并读取不存在的相机安全布尔字段；已按真实路由范围和坐标/视口几何修正后重跑。聚类折叠、图谱全屏和治理外环不进入 M3B。当前接续点为 **M3C-0 大图性能基线选择审计**：先用既有 100/1000/5000 节点真实夹具重新记录当前代码表现，再选择脏帧、空间索引、Worker 或层级细节中的最小实现。详见 [`Post_v1.0.15_M3B12_Professional_Visual_System_Exit_Audit_2026-08-28.md`](./Post_v1.0.15_M3B12_Professional_Visual_System_Exit_Audit_2026-08-28.md)。

## 2026-08-28 M3C-0 大图性能基线选择审计交接

M3C-0 已在独立真实 Tauri/WebView2 会话中完成 100/1,000/5,000 节点 Markdown 链图基线。100 与 1,000 节点首屏、稳定和交互预算通过；5,000 节点首次可见 `24722ms`，但稳定 `185195ms`、缩放 `8010ms` 超预算，最长长任务 `17237ms`。三个规模稳定后均约 `132` 次/秒绘制，失焦和返回资料库后分别为 `1/0`。

1,000 节点 20 次进出完成且 heap 未持续增长；三档零运行时错误、源摘要不变。测试已纠正探针放大、非墙钟等待、CDP 按键缺失和误入社区子图，并在不放宽预算的前提下完整重跑。当前接续点为 **M3C-1 稳定后脏帧刷新与生命周期循环控制**：只消除稳定状态无条件 `draw/RAF`，必须保留布局、相机、路径动效和交互唤醒；空间索引、Worker、裁剪/标签缓存和保存视图不并入。详见 [`Post_v1.0.15_M3C0_Large_Graph_Performance_Baseline_Selection_Audit_2026-08-28.md`](./Post_v1.0.15_M3C0_Large_Graph_Performance_Baseline_Selection_Audit_2026-08-28.md)。

## 2026-08-28 M3C-1 稳定脏帧与生命周期循环交接

图谱循环现只在布局未稳定、相机过渡或 calm 路径动效期间连续调度；选择、指针、过滤、缩放、平移、主题和尺寸变化显式请求脏帧。失焦、隐藏、返回资料库和卸载停止任务，焦点恢复不再重启布局。

真实 100/1,000/5,000 节点稳定绘制均从 `132` 降到 `0 次/秒`，恢复前后均为 `frame 121`；5,000 节点缩放 `65ms`，但布局仍 `186338ms`、最长任务 `15634ms`。三主题 calm/reduced 六会话证明路径动效与减少动效合同保持，20 次生命周期无持续 heap 增长，全部源安全和返回能力通过。当前接续点为 **M3C-2 大图主线程阶段剖析选择审计**，先量化构建/布局/语义/绘制，再决定 Worker/布局替换或裁剪/缓存。详见 [`Post_v1.0.15_M3C1_Settled_Dirty_Frame_and_Lifecycle_Loop_Audit_2026-08-28.md`](./Post_v1.0.15_M3C1_Settled_Dirty_Frame_and_Lifecycle_Loop_Audit_2026-08-28.md)。

## 2026-08-28 M3C-2 大图主线程阶段剖析选择交接

固定种子真实 Tauri 剖析确认 5,000 节点布局累计 `133038ms`、最大单次 `29481ms`，Canvas 累计 `948ms`、语义派生约 `1269ms`、后端构建 `7403ms`；布局约占已归因主线程成本 99%。100/1,000 节点稳定完成，5,000 节点在产品总预算内未稳定，预算截断后仍成功返回资料库；三档错误 0、源摘要不变。

测试已修正随机布局历史对照、计时包装闭合、过长等待、短聚焦和 middle 覆盖，探针记账约 `0.5µs/次`。当前接续点为 **M3C-3 Worker 承载的有界力布局内核**：移出 UI 主线程并限制密集单元斥力候选，保留 M3C-1 脏帧和陈旧任务取消；不得顺带实现裁剪/缓存或视觉重做。详见 [`Post_v1.0.15_M3C2_Large_Graph_Main_Thread_Phase_Profiling_Selection_Audit_2026-08-28.md`](./Post_v1.0.15_M3C2_Large_Graph_Main_Thread_Phase_Profiling_Selection_Audit_2026-08-28.md)。

## 2026-08-28 M3C-3 Worker 承载的有界力布局内核交接

模块 Worker、每节点每 tick 48 候选上限、可转移 TypedArray 和单调 job ID 已接入真实关系网络。100/1,000/5,000 节点稳定 `4777/3542/10964ms`；5,000 主线程派发/应用最大 `7.6/26.7ms`，不再出现 `29481ms` 同步布局。三档稳定绘制 0/s、交互/源安全/返回通过，1,000 节点活跃失焦取消与 20 次生命周期通过。

首轮测试竞态、`235.6ms` 对象克隆和最终 idle 状态误判均已按真实证据修正；100 节点冷开发首次可见 `2511ms` 仍作为诊断差异保留。当前接续点为 **M3C-4 大图性能退出审计**：验证过滤范围 SVG/PNG 导出、Worker/监听器清理，复核剩余 Canvas/社区语义长任务，再决定 M3C 是否退出；不要自动混入裁剪/标签缓存。详见 [`Post_v1.0.15_M3C3_Worker_Backed_Bounded_Force_Layout_Kernel_Audit_2026-08-28.md`](./Post_v1.0.15_M3C3_Worker_Backed_Bounded_Force_Layout_Kernel_Audit_2026-08-28.md)。

## 2026-08-28 M3C-4 大图性能退出审计交接

M3C-4 已通过，M3 完成语义、视觉与性能三线收口。真实 Tauri 的 100/1,000/5,000 节点分别在 `2376/4037/10631ms` 稳定，三档稳定绘制与空闲长任务均为 0，最大剩余 Canvas/语义阶段为 `421.8ms`；1,000 节点 20 次进出后 Worker `21/21`、ResizeObserver `21/21`，heap 增量 `16,035,268 bytes`，错误 0、源不变且返回资料库。

真实 Windows/Tauri 保存对话框完成 5,000/4,999 完整图和 72/71 社区过滤图的 SVG/PNG 四次导出。首轮 6.9 MB SVG 在 WebView2 图像解码转 PNG 时失败，已改为从同一图谱事实直接绘制有界 Canvas；最终完整 PNG 为 `2816×2916`、`6,255,432 bytes`。当前接续点为 **M4-0 跨格式工作流与版本候选入口审计**，先冻结对象定位、受控转换、返回上下文、临时产物与发布判断范围；保持运行时/公开 `1.0.15`、开发目标 `1.0.16`、`releaseCandidate=false`。详见 [`Post_v1.0.15_M3C4_Large_Graph_Performance_Exit_Audit_2026-08-28.md`](./Post_v1.0.15_M3C4_Large_Graph_Performance_Exit_Audit_2026-08-28.md)。
