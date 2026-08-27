# v1.0.15 后 M1B2C DOCX 原生往返与收口审计

日期：2026-08-27
状态：通过，M1B2 收口
版本：保持 `1.0.15`，`releaseCandidate=false`

## 1. 阶段目标与结论

本阶段不增加 DOCX 编辑对象，只验证 M1B2B 生成的三份真实输出能否经过 Microsoft Word、WPS Writer、LibreOffice Writer 原生保存、退出、独立进程复开，再由 Long编辑反向读取。

M1B2C 已通过。三种来源乘以三种原生生产者形成 `3x3` 矩阵，9 份文件均完成原生保存和独立复开；Word/WPS 的首段文本、样式名、段落、表格、内联图片和节数量前后一致，`RepairMode=false`。LibreOffice 使用隔离配置保存后，由全新配置复开并渲染为 3 份非空 PDF。9 份原生输出随后均由 Long编辑复读，目标段落样式可识别、读取不改文件摘要、960x720 无横向溢出、运行时错误 0。M1B2 至此收口。

## 2. 预期、实际与修正

| 检查项 | 修正前预期 | 真实实际 | 修正后处理 |
| --- | --- | --- | --- |
| 原生保存 | COM `SaveAs2` 可直接生成新文件 | Word 在不可见另存流程等待 | 先复制到隔离目标，再由原生程序打开目标并执行 `Save`；源摘要单独校验 |
| 独立复开 | 保存退出后可立即创建第二个 COM 实例 | Word 偶发 `80080005` 服务冷却竞态 | 仅对 COM 创建做 6 次、2 秒间隔的有限重试；仍要求第二进程成功 |
| 样式 ID | 三生产者应逐字保持 OOXML 样式 ID | LibreOffice 将 Word `ab` 规范化为 `IntenseQuote`，将 WPS `1` 规范化为 `Normal` | 按明确生产者语义 ID 验收；显示名和目标语义保持，不把规范化误报为丢失 |
| PowerShell 运行时 | PowerShell 7 与 Windows PowerShell 5.1 行为一致 | 5.1 无 `ProcessStartInfo.ArgumentList`，且默认 ANSI 读取 UTF-8 JSON | 使用安全命令行转义与显式 UTF-8 读写，两代运行时均可执行 |
| 桌面地址 | 第二段可使用任意 Vite 端口 | E2E Tauri 二进制固定加载 `14200` | 两段测试按顺序复用已释放的 `14200` |
| WebView 启动 | 端口出现即代表页面就绪 | 极少数启动得到空白 WebView | 基础夹具生成允许一次完整进程重启；内容与文件断言不放宽 |
| 证据隐私 | 可保留所有原生输出 | Office 输出可能带本机身份元数据 | 原始 9 份文件只留在临时目录，仓库仅保存脱敏指标、摘要和截图 |

## 3. 真实验收结果

| 原生生产者 | 版本 | 来源文件 | 原生保存/独立复开 | Long编辑反读 |
| --- | --- | ---: | --- | --- |
| Microsoft Word | `16.0` | 3 | 3/3 | 3/3 |
| WPS Writer | `12.1.0.28043` | 3 | 3/3 | 3/3 |
| LibreOffice Writer | `26.2.4.2` | 3 | 3/3，PDF `38,600–78,022 B` | 3/3 |

样式反读结果：

- Word/WPS 原生保存路径保持 `ab / 1 / BodyText`。
- LibreOffice 原生保存路径得到 `IntenseQuote / Normal / BodyText`，分别对应原有 `Intense Quote / Normal / Body Text` 语义。
- 9 份文件读取前后 SHA-256 不变；三张截图均大于 120 KB，人工复核无面板遮挡、按钮越界或页面级横向溢出。

执行入口与证据：

- `npm run audit:post-v115-m1b2c-docx-closure`：生产构建、Long编辑写回、原生 `3x3` 往返和 Long编辑反读总入口。
- `npm run check:post-v115-m1b2c-docx-closure`：3 个生产者、9 个文件对、摘要、样式、响应式、运行时错误和隐私边界门禁。
- [`docs/evidence/post-v115-m1b2c-docx-closure/`](./evidence/post-v115-m1b2c-docx-closure/)：脱敏 JSON 与三张真实 Tauri 截图。

## 4. 需求对齐与能力边界

- 对齐“编辑只在点击保存后写入”：M1B2B 输出仍来自显式确认保存，本阶段原生复开不改变产品保存逻辑。
- 对齐“真实测试要有预期与实际差异”：记录并修正 LibreOffice 样式 ID 规范化、COM 冷却、PowerShell 版本和固定端口差异，没有用内部自读替代外部结果。
- 对齐“复杂 Office 有界编辑”：段落样式只允许切换当前文件已有样式；页眉页脚、浮动图片、合并结构、域链接和未知高级对象继续只读。
- 本阶段不扩大到完整 Word 等价编辑，不提升版本，不打包，不更新 README 或 Release。

## 5. 下一步

按权威路线图进入 **M1C ODS/ODP 基础编辑可行性审计**：先用真实 LibreOffice/WPS 文件盘点 ODF 包结构、样式继承、公式命名空间、文本/备注和未知对象保持风险，再决定最小安全编辑子集。若不能证明安全覆盖，保持只读或只提供可靠新副本，不先开放 UI。
