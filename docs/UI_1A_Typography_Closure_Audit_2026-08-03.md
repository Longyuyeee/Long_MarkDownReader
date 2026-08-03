# UI-1A 字号基线收口审计

审计日期：2026-08-03

基线：`main@6d93b66`

## 结论

UI-1A 已完成。全局 36 个样式源中的 398 条原始 `7–10px` 字号声明已迁移到 `--text-compact: 11px`，当前 49 个 Vue/SCSS/CSS 样式源不存在小于 11px 的未登记界面字号。

这一步只收口字号基线，不代表 UI-1 整体完成。下一步仍是 UI-1B：建立并迁移共享工具栏、文件身份、状态、字段、分段控件和空状态组件。

## 需求对齐

- 普通正文继续使用 12px 及以上令牌。
- 辅助文字下限统一为 11px，不再保留 7–9px 微字号。
- Workbook、PDF、WorkspaceHome、DiagramStudio 四个高风险页面已纳入同一全局规则。
- `check:ui-typography` 已加入补丁发布门禁，后续新增微字号会直接失败。

## 验证回执

- `check:ui-typography`：通过，49 个样式源，0 条未登记微字号。
- `check:ui-consistency`：通过。
- `check:managed-file-routing`：通过。
- `check:graph-product-contract`：通过。
- `npm run build`：通过。
- 浏览器 1280×720：运行时最小字号 11px，无页面级溢出。
- 浏览器 1024×720：运行时最小字号 11px，无控件重叠或页面级溢出。

## 下一步

执行 UI-1B 共享组件治理；完成后再进行 UI-1 总审计和阶段收口。
