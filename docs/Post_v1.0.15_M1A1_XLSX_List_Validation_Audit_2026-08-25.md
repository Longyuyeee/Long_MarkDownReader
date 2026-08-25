# M1A1 XLSX 列表验证交互真实审计

日期：2026-08-25
状态：通过，已形成独立用户价值；不单独提升版本

## 目标与边界

本阶段只解决 XLSX 内嵌列表数据验证“底层可校验、界面却只能手输”的断层。用户选中受支持的单元格后，可以直接打开候选列表并选择；选择只进入草稿，仍须点击“保存”才写回工作簿，并继续支持撤销与重做。

本阶段不解析命名区域、跨 Sheet 引用或动态公式产生的候选项，也不改变数组公式、透视表和外部数据门禁。它不是完整 Excel 等价编辑声明。

## 预期与实际差异

| 检查项 | 修正前实际 | 预期 | 修正后实际 |
| --- | --- | --- | --- |
| 列表验证读取 | 可读取 `"Active,Paused,Closed"` | 保持 | 保持 |
| 非法值 | 手输后由保存链拒绝 | 保持严格拒绝 | `Unknown` 被拒绝，文件字节不变 |
| 单元格交互 | 仅有 3 px 提示点，必须手输 | 选中 B2 后出现下拉选择 | 显示三项候选、当前值和选中标记 |
| 保存边界 | 手输进入草稿 | 下拉选择也必须显式保存 | 选择 `Closed` 后源 SHA-256 不变；点击保存后才变化 |
| 重开结果 | 合法手输值可复读 | 下拉选择值可复读 | 刷新桌面应用并重开 `Details!B2` 后为 `Closed` |
| 小窗口 | 无对应交互 | 弹层不越界 | 860×700 下完整包含于视口 |
| 运行稳定性 | 无对应交互 | 0 运行时错误 | 0 运行时错误、无错误边界 |

差异已关闭。策略事实位于 `shared/post-v115-m1a1-xlsx-validation-policy.json`，机器证据位于 `docs/evidence/post-v115-m1a1-xlsx-validation/`。

## 真实测试

1. `npm run check:post-v115-m1a1-xlsx-validation`
   - 检查真实 XLSX 样本、交互入口、列表语义与显式保存合同。
2. `cargo test --locked --manifest-path src-tauri/Cargo.toml commands::workbook::tests::enforces_literal_list_validation_and_preserves_table_parts -- --nocapture --test-threads=1`
   - 使用 `compatibility-baseline.xlsx` 的真实 `Details!B2`；非法值被拒绝，合法值保存复读，未编辑的 `xl/tables/table1.xml` 保持。
3. `npm run audit:post-v115-m1a1-xlsx-validation`
   - 启动真实 Tauri/WebView2，复制并打开真实 XLSX，选择 `Closed`，检查保存前后 SHA-256、应用刷新后复读、宽窄屏弹层和运行时错误。
4. `npm run build`
   - Vue 类型检查与 Vite 生产构建通过。

审计脚本首轮因当前 PowerShell 会话缺少 `Get-FileHash` 未进入产品交互，已改为 .NET SHA-256；第二轮发现用清空路由模拟重开不符合应用保留工作区的设计，改为真实刷新 WebView 后复开。最终断言未放宽，完整流程通过。

## 视觉复核

- `xlsx-validation-picker-wide.jpg`：1440×900，三项候选完整、当前值清晰。
- `xlsx-validation-picker-narrow.jpg`：860×700，弹层未超出视口，工具栏与资料库未变形。

## 下一步

进入 M1A2，先用真实工作簿审计条件格式、表格对象和大表性能的当前差异，优先选择一个能完成“编辑、保存、重开、未编辑部件保持、宽窄屏稳定”的子能力。没有 Excel/WPS/LibreOffice 独立生产者证据的高级对象继续保持有限能力或阻断。
