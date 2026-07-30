# R2 Windows 安装与生命周期审计

日期：2026-07-30
阶段：R2
结论：Windows 安装身份、文件关联边界、旧数据迁移和桌面证据已形成可重复工程闭环；当前仍不是发布候选。

## 本步完成

- MSI 与 NSIS 继续作为 Windows 安装目标；NSIS 明确为当前用户安装，禁止版本降级。
- Cargo 多二进制包固定 `default-run = "tauri-app"`，防止安装器误打包 XLSX 审计工具。
- 固定 WiX Upgrade Code 为 `7bf71eea-e39f-54b9-a7e6-4922e93094a6`，与 Tauri 对既有产品名计算的历史默认值一致。
- 安装器只登记 `.md`、`.markdown` 两种安全白名单，不关联旧 Office/WPS 外部依赖格式。
- 删除直接改写 `HKCU\Software\Classes\.md` 的 PowerShell 行为；设置页只打开 Windows“默认应用”，由系统和用户决定默认程序。
- `com.mistyedit.mdhelper` 旧标识迁移改为结构化报告。仅旧目录存在时迁移；新旧目录同时存在时保留两边并报告，不覆盖用户数据；失败不再静默吞掉。
- 卸载策略不包含自定义数据删除：外部知识库永不由卸载器处理，应用配置和缓存保留，后续由应用内清理与备份功能管理。
- 发布能力页阶段已从 R1 对齐到 R2。

机器事实源为 `shared/windows-lifecycle-policy.json`，专项契约为 `scripts/check-r2-windows-lifecycle-contract.mjs`。

## 验证结果

- 数据迁移 Rust 回归：`2/2` 通过，覆盖安全迁移与冲突保留。
- `npm run check:format-contract`：通过，R2 契约与桌面证据检查已进入共享门禁。
- `npm run build`：通过。
- 真实 Tauri Debug WebView2：云白/暗色、1280/1024/760 三档视口，共 9 项检查、4 张截图通过；覆盖搜索、外部依赖筛选、详情展开、紧凑布局和默认应用入口。
- `npm run tauri -- build --debug --bundles msi,nsis`：通过，实际生成 MSI 与 NSIS 两种安装包。
- 完整 `npm run ci:check` 在安装入口修正前通过；修正 `default-run` 后的最终复跑中，全部契约和 Rust 功能测试仍为 `408 passed; 2 ignored; 1 filtered out`，但既有 XLSX 性能门禁受本机持续负载影响，三轮独立复跑分别在 page 或 patch 阶段越过阈值，最低失败采样为 `patch=5653 ms`。阈值未放宽，交由 GitHub 干净环境复核。
- 最终独立补跑 100 MiB PDF 范围基准为 `139 ms`，生产依赖审计为 `0 vulnerabilities`。
- 实现提交 `032ec11` 的 GitHub Quality Gate 已在干净环境完整通过，耗时 `10m06s`：<https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/30533681730>。远端结果关闭了本地 XLSX 性能波动疑点。

桌面证据位于 `docs/evidence/r2-windows-lifecycle/`。

## 当前边界

- 本批安装包是未签名 Debug 包，只证明配置和打包链可用，不代表正式发布制品。
- 没有在当前开发机执行安装、升级和卸载，以免污染开发环境。
- 正式发布前仍需在可抛弃 Windows 10/11 环境完成干净安装、旧版升级、降级拒绝、卸载保留和文件关联恢复矩阵，并完成代码签名。
- `releaseCandidate` 继续为 `false`。

## 下一阶段

下一代码阶段为 **R3：数据韧性与诊断**：

1. 建立索引状态检查、损坏识别、安全重建和重启恢复。
2. 增加用户配置与应用元数据的备份导出/导入，不打包外部知识库正文。
3. 增加隐私净化诊断包，默认排除文档内容、凭据、完整路径和缓存正文。
4. 为恢复、备份、诊断建立机器契约和失败注入测试。
5. R3 后进入 R4 发布工程，完成签名、可抛弃 VM 安装生命周期矩阵和正式发布清单。
