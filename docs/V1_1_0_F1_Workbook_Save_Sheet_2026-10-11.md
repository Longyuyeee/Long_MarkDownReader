# F1 保存期间切换工作表修复

日期：2026-10-11；基线 `5d91bbc8`；目标 1.1.0，未封板。

## 用户路径与修改前证据

检查实际模板：公式栏、撤销/重做按钮和主要格式控件在 saving 时禁用，但工作表标签仍可点击。本轮选择真实可达路径：Sheet1 修改后点击保存，在回执前点击 Sheet2。扩展后台 fixture 为两张表，使用实际 WorkbookView 的 DOM 点击和模拟延迟 IPC。

修改前运行 `test-workbook-save-browser.mjs` 失败，断言实际活动表为 `Sheet1`、期望 `Sheet2`，证明保存成功强行跳回提交前工作表。没有用“测试通过”代替缺陷复现。

## 修复

- 回执确认仍属于当前工作簿后，按用户此刻选中的工作表重新加载，而不是强制恢复保存发起时的工作表；保留原有切表功能和布局。
- `selectSheet` 进入新加载代次时重置该代次的 pageLoading。旧工作表读取仍在途时不能用旧 busy 标记阻止新代次读取；原有 generation 判断继续隔离迟到结果和错误。

没有改变后续草稿清理与撤销语义，没有增加保存期间输入禁用，也没有修改 Rust 或真实 XLSX 写入逻辑。

## 验证

- 后台实际组件测试先失败、修复后通过：普通编辑、失败重试、保存期间切 Sheet2、回执后仍在 Sheet2。
- 新增读取交错场景：在 Sheet2 保存，切到 Sheet1 后暂缓其读取；先完成保存回执，确认新代次发起第二次读取；先完成新读取，再让旧读取失败。页面正确显示 Sheet1、已保存和原内容，未显示过期错误，无 pageerror。
- `node --test scripts/test-workbook-save-ownership.mjs`：9 项通过（5 项当前实现检查及 4 项历史复现/对照）。当前实现检查新增断言回执重载用户选择的 Sheet2。
- `npx vue-tsc --noEmit`、`git diff --check` 通过。无 Rust 变更，本轮未运行 Rust 测试。

已实际查看后台页面截图：[保存期间 Sheet2](evidence/v110-workbook-save-browser/04-sheet2-during-save.png)、[保存后仍为 Sheet2](evidence/v110-workbook-save-browser/05-sheet2-after-save.png)、[交错读取后 Sheet1](evidence/v110-workbook-save-browser/06-sheet1-after-pending-read.png)。原有三个截图随双工作表 fixture 重新生成。全程未接管桌面。

## 未完成与下一步

本轮仅覆盖上述工作表/保存/读取交错，后台原生接口仍为模拟，不能视为真实 XLSX 落盘验收。保存后选择位置和滚动位置恢复未在本轮优化。

继续核对键盘撤销/重做（按钮禁用不代表快捷键受同样保护）、剪贴板异步结果、格式对话框与对象操作等真实入口，处理同本工作簿提交批次与后续草稿/撤销历史。不要把本轮工作表修复当成全部草稿风险解除。随后补跨实例重开及原生后台验证，再接跨窗口确认和归档执行/恢复。当前不封板、不升级版本、不发布。
