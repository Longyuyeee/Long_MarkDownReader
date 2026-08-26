# M1A4A XLSX 条件格式可视编辑器真实审计

日期：2026-08-26

状态：通过；下一步 M1A4B

## 阶段目标

把基础 XLSX 条件格式从五轮以上文字输入改为一次可理解的可视编辑，并使用真实工作簿验证范围、规则、样式、写盘和复开结果。高级规则继续使用既有入口；对象草稿、撤销和显式保存不在本子阶段冒充完成。

## 预期与修正前实际

| 项目 | 预期 | 修正前实际 |
| --- | --- | --- |
| 基础规则编辑 | 单一表单展示类型、比较方式和阈值 | 至少五轮文字输入，要求用户填写内部英文值 |
| 样式 | 五种可见色板并提供结果预览 | 输入 `red_fill` 等内部名称，无预览 |
| 入口 | 普通选区或条件格式单元格均可进入数据工具 | 数据工具启用条件遗漏条件格式选区 |
| 单格范围 | 显示 `B2` | 显示 `B2:B2` |
| 560×720 | 弹窗受控并可内部滚动 | scoped Teleport 样式未命中，底部超出 23.5 px |
| 证据汇总 | Windows PowerShell 可读取 UTF-8 中文 JSON | 默认系统编码导致乱码和 `ConvertFrom-Json` 失败 |

## 实现与真实修正

- `cellIs` 和 `expression` 使用统一中文表单；八种比较方式、一/二阈值、停止后续规则和五种样式一次呈现。
- 样式选择同步显示 `128` 示例和自然语言规则摘要。
- `colorScale`、`dataBar`、`iconSet` 保留“高级规则”入口，没有削弱既有能力。
- 数据工具上下文加入条件格式选区，真实 `Summary!B2` 可以进入编辑器。
- 单格范围规范为单地址；Teleport 弹窗采用全局最大高度与 `overflow-y:auto`。
- 真实审计脚本显式使用 UTF-8 读取证据，并直接验证弹窗 `scrollHeight > clientHeight` 和 `overflowY=auto`。

## 真实测试结果

输入为仓库真实 `compatibility-baseline.xlsx`，脚本复制到临时资料库后操作 `Summary!B2`。规则由 `greaterThan 1000` 改为 `between 1000 / 2000 / green_fill`。

- 表单编辑期间临时 XLSX SHA-256 不变；点击“应用并写入文件”后摘要变化。
- 刷新真实 Tauri 应用并重新打开，比较方式、两个阈值和绿色样式全部复读一致。
- 仓库 fixture 摘要保持不变，临时目标确实变化。
- 1280×800 与 560×720 截图已人工复核；窄屏边界为 `16,12,544,708`，弹窗 `clientHeight=696`、`scrollHeight=744`、`overflowY=auto`。
- 运行时错误 0，未出现错误边界；证据状态为 `accepted`，`differenceResolved=true`。

证据：[`docs/evidence/post-v115-m1a4a-xlsx-conditional-editor`](./evidence/post-v115-m1a4a-xlsx-conditional-editor)

验证命令：

- `npm run build`
- `npm run check:post-v115-m1a4a-xlsx-conditional-editor`
- `npm run audit:post-v115-m1a4a-xlsx-conditional-editor`

## 阶段结论与下一步

M1A4A 已关闭，但 M1A4 尚未关闭。当前按钮仍明确写作“应用并写入文件”，条件格式对象操作没有进入工作簿统一撤销栈，也没有等待顶部显式保存。

下一步 M1A4B 应先审计条件格式和 Table 的当前立即写盘调用，再建立内存对象草稿、撤销/重做、脏状态、显式保存、签名冲突和失败回滚。真实验收必须证明：保存前临时源摘要不变，撤销可恢复对象草稿，保存后复开一致，仓库 fixture 不变，高级未知对象仍被保持或阻断。
