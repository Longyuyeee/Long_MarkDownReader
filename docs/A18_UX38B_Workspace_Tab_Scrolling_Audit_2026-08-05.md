# A18 UX-38B 工作区标签滚动审计

## 阶段结论

UX-38B 已完成，UX-09、UX-10、UX-17 关闭；UX-38 全格式验收总项继续进行。

- 标签采用 176px 固定宽度和 156px 最小保护宽度，不再因文件增多无限压缩。
- 标签栏隐藏浏览器原生滚动轨道，保留纵向滚轮、Shift+滚轮和触控板横向输入。
- 左右浏览按钮按边界启停，并提供边缘反馈；激活远端标签会自动进入可视区。
- 活动标签使用 roving tabindex，左右方向键可切换标签并保持焦点。

## 实机验收

隔离测试库包含 TXT、JavaScript、TypeScript、Python、JSON、JSONC、YAML、XML、TOML、LOG、HTML、SQL 共 12 个文件。真实 Tauri Debug WebView2 验证结果：

- 12 个标签全部存在，最小标签宽度 176px，最小文字区域 107px。
- 纵向滚轮、Shift+滚轮、右侧箭头均成功改变横向位置。
- 远端标签激活后自动显露；1000x720 窄窗口布局稳定；方向键切换成功。
- 原生滚动条隐藏，运行时错误 0，阻断错误界面 0。
- 审计前后 12 个源文件 SHA-256 一致。

三张截图已人工复核通过，未发现标签压缩、原生滚动条、控件重叠或编辑区挤压。证据位于 `docs/evidence/ux38b-workspace-tabs`，绑定产品提交 `055935e73d857446d9cdc5211ddc98eaad313553`；不含用户资料或完整本机路径，`releaseCandidate=false`。

## 验证命令

- `npm.cmd run audit:ux38b-workspace-tabs`
- `npm.cmd run check:ux38b-workspace-tabs`
- `npm.cmd run check:ux38-format-experience-matrix`
- `npm.cmd run check:current-development-audit`
- `npm.cmd run build`

## 下一步

进入 UX-38C 数据表格格式族验收。优先覆盖 Table、CSV/TSV、XLSX、ODS 的真实打开、加载与错误状态、内存编辑与显式保存、主题和冻结层不透明性、窄窗口布局、键盘操作及返回上下文；不把已有功能或旧证据直接等同于本轮完整通过。
