# A19 UX-38C1 表格网格体验审计

## 阶段结论

UX-38C1 已完成，关闭 CSV/TSV 范围内的 UX-11、UX-13、UX-14、UX-15；UX-38 数据表格总项继续进行。

- 冻结控制从布尔“首列”升级为 0 至合理上限的列数步进器，前 N 列按累计列宽定位。
- 行号、冻结表头和冻结数据格使用不透明主题表面，冻结边界保留清晰阴影。
- 行号只选择，删除由明确命令和应用内确认触发，取消不会改动内存或磁盘数据。
- CSV/TSV 转换前说明 `.table.json` 副本名称、目录、用途和原文件不变；完成后可打开或在文件树定位。
- Table 工具栏按工作区容器宽度换行，不再只按浏览器总宽度判断。

## 实机验收

真实 Tauri Debug WebView2 使用隔离的 40 行、10 列 CSV 与 TSV：

- 三列冻结后横向滚动超过 500px，行号和三列位置保持稳定，背景 alpha 为 1。
- 行号选择、应用内删除确认与取消路径通过，无 ACL Promise 错误。
- 创建前未生成副本；确认后仅生成一个 `.table.json`，文件树刷新和定位成功。
- 1000x720 窄窗口布局稳定，标题和工具分行，控件文字未被竖向挤压。
- 运行时错误和阻断界面均为 0，CSV/TSV 源文件 SHA-256 不变。

三张截图已人工复核通过。证据位于 `docs/evidence/ux38c-table-grid`，绑定产品提交 `f43ac3268db99691c31464881e18b165c19b0d5a`；不含用户资料或完整本机路径，`releaseCandidate=false`。

## 验证命令

- `npm.cmd run audit:ux38c-table-grid`
- `npm.cmd run check:ux38c-table-grid-experience`
- `npm.cmd run check:ux38-format-experience-matrix`
- `npm.cmd run check:current-development-audit`
- `npm.cmd run build`

## 下一步

进入 UX-38C2。使用真实 XLSX 和 ODS 复测打开、加载与异常状态、冻结区域不透明性、紧凑布局、主题和窄窗口；同时覆盖从知识图谱返回后的 CSV/TSV/XLSX 活动文件、滚动位置和 Sheet 上下文，决定 UX-12、UX-32 是否可关闭。
