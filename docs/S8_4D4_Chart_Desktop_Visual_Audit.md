# S8-4D4 图表桌面视觉与往返审计

更新日期：2026-07-23
状态：已完成

## 1. 审计范围

本阶段验证 LongEdit 已开放的标准柱形图、折线图、饼图和散点图安全子集，不把语义预览声明为 Excel 像素级渲染等价。

- 真实 XLSX fixture：`src-tauri/tests/fixtures/workbook/chart-visual-matrix.xlsx`
- 可重复生成器：`src-tauri/examples/generate_chart_visual_fixture.rs`
- 机器清单：`src-tauri/tests/fixtures/workbook/chart-visual-matrix.json`
- 命令边界回归：四类图表逐项修改标题、保存并重新解析
- 桌面环境：真实 Tauri Debug WebView，使用隔离临时知识库

## 2. 视觉矩阵

| 场景 | 柱形 | 折线 | 饼图 | 散点 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 专业浅色 | 截图 | 截图 | 截图 | 截图 | 四类预览、标题、图例、标签和系列颜色可辨 |
| 专业深色 | 截图 | 共享渲染契约 | 共享渲染契约 | 共享渲染契约 | 柱形代表场景通过，主题切换后工作面与预览无重叠 |
| 高对比 | 截图 | 共享渲染契约 | 共享渲染契约 | 共享渲染契约 | 柱形代表场景通过，焦点、边界和系列颜色可辨 |

证据文件：

- `docs/evidence/s8-4d4/professional-light-column.jpg`
- `docs/evidence/s8-4d4/professional-light-line.jpg`
- `docs/evidence/s8-4d4/professional-light-pie.jpg`
- `docs/evidence/s8-4d4/professional-light-scatter.jpg`
- `docs/evidence/s8-4d4/professional-dark-column.jpg`
- `docs/evidence/s8-4d4/high-contrast-column.jpg`

## 3. 桌面保存与重开

在隔离知识库中打开 fixture 后，将柱形图标题从 `Quarterly revenue` 修改为 `Quarterly revenue verified`。桌面端显示保存成功，随后结束 Debug 应用进程、重新启动并再次打开工作簿，标题仍为修改后的值。

- 保存后证据：`docs/evidence/s8-4d4/desktop-edit-saved.jpg`
- 进程重启后证据：`docs/evidence/s8-4d4/desktop-reopen-verified.jpg`

Debug 专用环境变量 `LONGEDIT_E2E_LIBRARY`、`LONGEDIT_E2E_THEME` 和独立开发端口只用于隔离桌面验收，不改变 Release 配置或用户知识库。

## 4. 结论与边界

S8-4D4 退出条件已满足：四类标准图表具备真实包 fixture、命令边界往返、真实 Tauri 保存重开和三主题代表场景证据。截图文件已进入工作簿契约门禁，缺失或异常缩小时会阻断检查。

本阶段没有开放组合图、三维图、逐点/自定义标签、高级主题色绑定、渐变/图片/图案填充、高级轴格式或 Excel 像素级渲染。这些结构继续只读保真。下一主阶段进入 S8-5 页面布局与保护编辑。
