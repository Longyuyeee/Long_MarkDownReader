# UI-1 字号与共享组件收口审计

审计日期：2026-08-03

实现基线：`main@d9513a5`

## 结论

UI-1 已完成。UI-1A 将界面最小字号统一到 11px；UI-1B 建立共享工具栏、文件身份、状态栏、字段、分段控件和空状态六类结构组件，并迁移 Workbook、PDF、WorkspaceHome、DiagramStudio 四个高风险工作区。

本阶段没有改变文件格式能力、保存策略或颜色语义。下一阶段为 UI-2 颜色与状态语义治理。

## 需求对齐

- 49 个原有样式源与 6 个共享组件样式均不存在小于 11px 的界面字号。
- Workbook 使用共享工具栏、文件身份、状态栏和分段控件。
- PDF 使用共享工具栏和文件身份。
- DiagramStudio 使用共享工具栏、文件身份、状态栏和字段。
- WorkspaceHome 使用共享工具栏和空状态。
- 页面原有业务类名继续保留，迁移不改变功能入口和编辑行为。

## 机器合同

- `check:ui-typography`：禁止小于 11px 的原始字号。
- `check:ui-shared-components`：验证六类组件存在，并验证四个高风险页面已经接入。
- 两项合同均已加入 `ci:patch-release`。

## 验证回执

- `npm run build`：通过。
- `check:ui-typography`：通过，55 个样式源，0 条未登记微字号。
- `check:ui-shared-components`：通过。
- WorkspaceHome 运行时检查：共享 `HEADER` 和 `MAIN` 空状态语义正确，无页面溢出。
- DiagramStudio 运行时检查：共享工具栏和文件身份已渲染，工具栏无控件重叠或横向溢出。

## 下一步

进入 UI-2：统一界面 chrome 的颜色令牌和加载、空状态、错误、只读、有限编辑、外部依赖、保存成功等状态语义。
