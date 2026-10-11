# F1 标准 Markdown 引用解析

2026-10-11，接续 `d03be570`。无 UI 修改，无归档执行入口，无升版。

## 变更

普通链接与图片不再用正则截取目标，改用精确锁定的 pulldown-cmark 0.13.0 默认 CommonMark 解析事件与源码偏移。提取完整目标和原文行号，支持尖括号空格路径、平衡括号、转义及已定义引用式链接。保留未使用的引用定义作为保守候选。HTML 属性正则仅运行于解析器识别的 HTML 范围，不扫描普通代码文本。

核对了已下载 crate 的 src/lib.rs、src/parse.rs 中 Link/Image、OffsetIter、reference_definitions 和 LinkDef 接口。Cargo.lock 仅新增 pulldown-cmark、unicase 及主包依赖边，没有升级原有锁定包；关闭默认特性，不启用渲染器。没有对外发送用户文档。

## 范围审计

本步只改标准 Markdown 链接/图片与 HTML 片段范围。Wiki/PDF 自定义语法仍沿用现有提取器，不能据此声称这些语法中的代码示例均已排除。HTML 属性仍不是完整 DOM 解析；动态 CSS/HTML、非 Markdown 入链、应用编辑器扩展语法及跨库引用未覆盖。

默认 CommonMark 与应用编辑器的全部扩展不等价，不能把 parser 输出当作全应用引用真相。resolution 仍是证据；complete=false、canExecute=false 保持不变。引用重写、移动附件、草稿执行时复查和标签/索引更新未完成。

解析可能同时返回引用使用点与定义点，二者作为不同证据保留，不作去重删除。没有全量语料性能或完整依赖安全审计，不宣称封板。

## 验证

新增测试：空格/括号/引用定义与使用行号；标准链接和 HTML 示例位于行内、围栏、缩进代码中不作为引用；转义括号和跨行 HTML 行号。沿用既有相对路径、Wiki、PDF 和全体归档回归。

首轮 58 通过 / 1 失败：旧样本在普通段落后紧接引用定义，CommonMark 不将它识别为定义。保留原四候选及行号断言，新增 unparsed_reference_candidate 保守分类（resolution 不支持），并补代码区域排除，未把疑似引用静默丢弃或降低旧期望。该类候选仍有正则局限，不能据此认为全部语法准确。

最终 `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib archive -- --nocapture`：59 passed / 0 failed，新增 3 项（总数含既有名称筛选附带的 2 项压缩包测试）；git diff --check 通过。

## 接续

继续核对应用扩展语法与不支持情况、设计安全链接迁移策略，接草稿/身份门禁和用户恢复流程。UI 修改前后实际查看页面，新状态先补示意审批。

**尚未封板**；运行及公开 1.0.26，目标 1.1.0，F1 用户归档闭环未开放。
