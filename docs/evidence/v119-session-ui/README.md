# v1.1.9 正式工作现场页面证据

生产 App / WorkspaceHome / WorkSessionBar / WorkSessionTransferDialog，隔离生成资料与模拟 IPC/文件选择。不是设计示意，也不是原生/安装态验收。未接管本机桌面；正常主题/弹窗动效保留。

- `legacy-compat-final/`：最终 8 主场景、12 布局、0 页面异常；导入/去重/配额、默认隐私导出/已有目标拒绝、重定位/草稿、保存中阻止、部分恢复/位置存储失败、六风格宽窄及切库过期。最终深色原图已实看。
- `edges-second/`：7 边界场景、0 异常；跨库且全缺失导入、取消、预检变化二次确认、记录 CAS、标签存储失败回滚、130 个旧现场标签分批接续与精确草稿对象保留、360×540 底部可达。短窗原图已实看。
- `contracts-final.log`：35 项模型/服务测试通过，含旧现场/隐私/40 位置及重启、回滚和旧 160 标签兼容；`typecheck.log` 类型通过。
- `legacy-regression/` 保留早期原现场 UI 流程；`original-final/` 最终原入口回归通过，`quality-gate.log` 完整 `ci:patch-release` 退出 0、生产依赖 0 漏洞，仅既有原生 dead-code 警告。
- 早期 `browser-first/` 原图暴露主题切换过渡的浅底浅字；`theme-reading-ground/` 区分过渡与最终状态，生产 CSS 统一表面后 `theme-transition-fixed/`/最终批次正常；没有禁用动效换通过。
- `edges-first/` 失败原样保留：新增夹具缺必填参考 query，产品校验正确拒绝；补齐合法输入及多项 locator 后重跑，不削弱校验。

候选补审：`edges-empty-compat/` 最终 **8** 边界场景通过，补旧空现场的搜索/参考恢复；`candidate-final/` 正式 **8 主场景 / 12 布局 / 0 异常** 再次通过。`release-contract-final.log` 本版及上版 **9** 安装报告/来源正反合同通过，内存构造验证输入不算实际安装。`candidate-quality-first/second` 等失败原样保留，问题分别为候选文档披露、历史允许版本/阶段枚举未扩展；不改旧摘要、数量或业务断言。`candidate-quality-final.log` 最终完整门退出 0 / 生产依赖 0 漏洞；仅既有 dead-code 警告。

脚本：`scripts/test-v119-session-ui-browser.mjs` / `test-v119-session-edge-browser.mjs`，测试文件不参与生产构建。
