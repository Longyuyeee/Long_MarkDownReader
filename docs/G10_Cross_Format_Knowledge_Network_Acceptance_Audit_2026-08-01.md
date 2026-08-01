# G10 跨格式知识网络验收审计（2026-08-01）

## 结论

G10 已完成代表性跨格式资料库的文件级验收。系统会在隔离的真实文件系统目录中写入 Markdown、PDF 及批注、表格、Canvas、OPML 和 PPTX 文件，再经产品实际的统一建图函数生成知识网络脉搏。验收要求知识对象类型、关系语义、覆盖率和热点排序同时成立。

本阶段证明的是“真实落盘、合成内容”的确定性集成能力，不是用户真实资料库证据，也不是已安装安装包的界面观察。因此状态为 `representative-cross-format-library-pulse-accepted-installed-observation-next`，`releaseCandidate=false` 不变。

## 验收范围

- 11 类图谱对象：Markdown、PDF、PDF 批注、表格、表格视图、Canvas、Canvas 节点、OPML、OPML 节点、PPTX、PPTX 幻灯片。
- 5 类管理关系：`annotates`、`contains`、`depends-on`、`embeds`、`supports`。
- 至少 16 个对象、12 条关系，关系覆盖率不低于 75%。
- 已连接对象必须多于孤立对象；热点主题按连接数降序排列，最多返回 6 项。
- PPTX 使用仓库内真实 PowerPoint 生产者 fixture；其余内容由测试写入隔离临时资料库，测试结束后清理。

## 审计结果

新增 Rust 集成回归 `representative_cross_format_library_produces_a_useful_knowledge_pulse`，它不绕过解析器，也不手工构造 `GraphData`：所有对象和关系都由 `build_link_graph` 从磁盘内容解析，再由 `knowledge_graph_pulse` 汇总。

机器事实源为 `shared/g10-cross-format-graph-acceptance-policy.json`，`npm run check:graph-product-contract` 已串联 G10 检查器，防止后续误删格式、关系、量化门槛或夸大证据等级。

## 未闭环边界

- 尚未在当前已安装产物中观察 Workspace Home 的知识网络脉搏并验证热点点击居中跳转。
- 尚未在用户明确授权并完成隐私处理的真实资料库中评估关系质量、噪声和推荐价值。
- Windows 10/11 签名安装运行、签名材料和人工发布批准仍缺失，本阶段不能替代 R5N 发布门禁。

## 下一步

进入 G11：让一次性 Windows 安装生命周期使用带关系的代表性管理资料库，在已安装应用中截图并记录首页覆盖率、关系类型、热点主题以及热点到居中图谱的跳转结果。证据仍须标记为合成数据。G11 通过后，再设计需用户明确同意的真实资料库观察方案；不采集正文，不把本地绝对路径写入仓库。
