# M8-4 / v1.0.20 跨电脑接续审计

日期：2026-09-01

暂停结论：**知识图谱产品修复与 v1.0.20 原子版本迁移已完成，最终产品候选已冻结；公开发布链主动暂停，尚未构建或发布 v1.0.20。**

## 1. 当前事实

- 分支：`main`
- 冻结产品候选：`654ae5aa4c08e60c9fd5b91811cc938f91e0c3c2`
- 当前运行时/开发目标：`1.0.20`
- 当前公开稳定版：`1.0.19`，Tag 为 `v1.0.19`
- 发布状态：`v1.0.20-community-release-quality-gate-pending`
- `releaseCandidate=false`；不存在 v1.0.20 Tag、GitHub Release 或对外下载附件。
- 候选工作流：`.github/workflows/v120-candidate-lifecycle.yml`，只能接收精确 40 位候选提交，升级基线固定为 `v1.0.19`。

## 2. 已完成的开发

1. M8-1 修复分数 DPR 下 Canvas 尺寸抖动、pointer capture 拖动、单击选择/双击打开分离、左上角筛选与图例叠压、大量孤立节点远景噪声。
2. M8-2 使用真实 Windows/Tauri 和用户问题对应的大资料库规模验证 540 个孤立节点场景。
3. M8-3 完成连接图视口裁剪、`Set` 选中查找、状态环最多 24 个、屏幕恒定标签与碰撞规避、平方根近景尺寸、克制节点材质、默认零选择和统一“图谱工具”入口。
4. M8-4 已把 package/Cargo/Tauri 及 37 项活动发布合同原子同步到 1.0.20，并把旧 M4～M7 审计合同扩展为可识别合法 M8 后继阶段；历史功能断言仍保留。
5. README 及 v1.0.20 Release Notes 已写入“准备中”事实，尚未改成已发布下载页。

关键提交：

- `e8e8a795`：密集图交互稳定性与首轮可用性修复。
- `cfc41699`：M8 真实可用性审计与接续点。
- `db454f8d`：连接图性能、标签、节点视觉与工具入口重构。
- `bae8f4e2`：紧凑工具栏与主题合同对齐。
- `654ae5aa`：v1.0.20 原子版本、候选工作流、发布前文档及后继审计兼容。

## 3. 最终真实观察与质量结果

最终候选 `654ae5aa…` 已在 Windows/Tauri/WebView2、1440×900、DPR 1.25、暗色主题下复跑 180 节点/540 连接图：

- Canvas draw 峰值：`4.5 ms`；修复前同基线为 `7.1 ms`，下降约 37%。
- 超过 50 ms 的 Canvas draw：`0`。
- 布局 Worker compute 峰值：`1.6 ms`；apply 峰值：`0.7 ms`。
- 默认选中节点：`0`；运行时错误：`0`。
- 工具弹层：248 px、13 个命令、全部单行。
- 全图、300% 近景与工具弹层三张截图均已人工复核；证据位于 `docs/evidence/post-v119-m8-3-connected-graph-after/`。

质量门实际结果：

- `npm run check:current-development-audit`：完整通过。
- `npm run build`：通过，6,276 modules transformed。
- `cargo check --locked --manifest-path src-tauri/Cargo.toml`：通过。
- `ci:patch-release` 中所有本地构建、静态合同、历史能力审计和 Rust 检查均通过。
- 最后一步 `npm audit --omit=dev` 两次因 `registry.npmjs.org` 在 TLS 建连前断开而未取得审计结果；这是当前唯一未闭合的质量门，不能记录成“0 vulnerabilities”。换机后必须在网络正常环境重跑，托管候选工作流也会从固定提交重新执行完整门禁。

## 4. 尚未执行的发布工作

以下工作全部为待办，不能从 v1.0.19 继承证据：

1. 在网络正常环境完成 `npm audit --omit=dev`，并从头通过 `npm run ci:patch-release`。
2. 推送后以候选 `654ae5aa4c08e60c9fd5b91811cc938f91e0c3c2` 调度 `v120-candidate-lifecycle.yml`。
3. GitHub Windows runner 构建 1.0.20 MSI/NSIS，并完成 22/22 安装生命周期、18/18 安装态检查、11/11 路由、7/7 管理回滚。
4. 下载托管制品，冻结 ASCII 公共文件名、大小、SHA-256、`artifact-manifest.json` 和 `SHA256SUMS.txt`。
5. 把社区发布策略推进到发布就绪；将 README/Release Notes 从“准备中”更新为真实制品事实。
6. 创建指向冻结产品候选的 annotated `v1.0.20` Tag，发布 GitHub Release 和 MSI、NSIS、SHA256SUMS 三个附件。
7. 从公开地址回下载三项附件并逐项复核大小与 SHA-256；随后另行观察官方 v1.0.19 → v1.0.20 应用内更新。

## 5. 换机接续顺序

```powershell
git pull --ff-only origin main
git status --short
npm ci
npm audit --omit=dev --registry=https://registry.npmjs.org
npm run ci:patch-release
gh workflow run v120-candidate-lifecycle.yml --ref main -f candidate_commit=654ae5aa4c08e60c9fd5b91811cc938f91e0c3c2
```

调度后应使用 `gh run list --workflow v120-candidate-lifecycle.yml` 获取 Run ID，并等待成功证据；失败时先保留运行日志，不得直接 Tag 或发布。候选产品提交固定为 `654ae5aa…`，后续仅文档/证据提交不得悄然替换候选代码身份。

## 6. 隐私与发布边界

仓库证据使用合成 Markdown 节点，不包含用户资料库正文或本地绝对路径。v1.0.20 仍为无 Authenticode 签名的社区通道，未来发布时必须保留 Windows 未知发布者提示、仅从官方 GitHub 下载以及 SHA-256 校验说明。
