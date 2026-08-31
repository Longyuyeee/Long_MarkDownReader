# v1.0.18 M6-5 换机开发交接

记录时间：2026-08-31 17:42（Asia/Hong_Kong）

交接结论：**开发已暂停在 M6-5 托管安装生命周期运行中；不要重复开发 M6-4，不要重复触发托管运行，也不要创建 v1.0.18 Tag 或 Release。**

## 1. 仓库与不可变身份

- 仓库：`https://github.com/Longyuyeee/Long_MarkDownReader.git`
- 分支：`main`
- 暂停时本地与远端共同 HEAD：`6d208bcf7d0ba430b7df478718fe636fe91c6e34`
- v1.0.18 产品候选源码：`5988c03c0167b00cb86ed9a5f3cfe85f0b280a6a`
- M6-4 候选打包与证据提交：`ebe2ae0874a0986d364dc08e57e85211721fc27b`
- M6-5 工作流入口提交：`6d208bcf7d0ba430b7df478718fe636fe91c6e34`
- 当前公开版本/Tag：`1.0.17` / `v1.0.17`
- 当前运行时/开发目标：`1.0.18` / `1.0.18`
- 当前 `releaseCandidate=false`，`v1.0.18` Tag 和 GitHub Release 均不存在。

产品候选固定为较早的 `5988c03…` 是有意设计：后面的 `ebe2ae0…` 和 `6d208bc…` 只增加候选回执、文档和托管编排，不得混入候选二进制。

## 2. 已完成的真实开发与验证

M6-0～M6-4 已完成。v1.0.18 的产品增量是知识图谱独立有界全屏生命周期，以及发布证据一致性修正。44 个当前身份文件已经从 1.0.17 原子迁移到 1.0.18。

完整真实质量结果：

- Rust 全仓：548 通过、0 失败、5 个明确忽略。
- `npm run ci:patch-release`：6,275 个前端模块、43 类格式/91 个扩展名、Rust locked check、生产依赖 0 漏洞全部通过。
- 本地 MSI：`Long编辑_1.0.18_x64_zh-CN.msi`，74,186,752 bytes，SHA-256 `f1f5c147c9ff8b04c5f8b8a486fdb6cdd32abedd771e19d092c54c2f5185be01`，ProductVersion 1.0.18，`NotSigned`。
- 本地 NSIS：`Long编辑_1.0.18_x64-setup.exe`，65,934,312 bytes，SHA-256 `96db31068a1b00732ab289474ab000ee465d4565a9150d8cb8a055a8ac96869f`，ProductVersion/FileVersion 1.0.18，`NotSigned`。
- 当前 Tauri Debug WebView2：6/6 检查、11/11 路由、TXT/JSON 保存后离开与重开全部通过；两张截图已人工复核。
- M6-4、V1 社区发布边界、全部当前开发合同和 `git diff --check` 均已通过。

本地安装包只是 M6-4 观察值，不是最终公开资产。M6-5 会在 GitHub Windows 从同一产品候选源码重新构建；由于安装包非确定性，托管大小/哈希允许不同，但版本、源码、`NotSigned` 和行为门禁必须一致。

## 3. 暂停时正在运行的云端测试

- GitHub Actions 运行：[33378338422](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/33378338422)
- 工作流：`.github/workflows/v118-candidate-lifecycle.yml`
- 工作流 HEAD：`6d208bcf7d0ba430b7df478718fe636fe91c6e34`
- 输入候选：`5988c03c0167b00cb86ed9a5f3cfe85f0b280a6a`
- 升级基线：公开 `v1.0.17` / `2b6235d420ceffd291dab72c4af17caffe464333`

暂停时的预期是完成 v1.0.18 MSI/NSIS、v1.0.17 NSIS、22 项安装生命周期、18 项安装态工作区、11 条路由和 7 项管理回滚，失败数必须为 0。

暂停时的实际状态是 `in_progress`：编排源码、精确候选、上一公开版本检出、身份核验、Node 设置和候选依赖安装已经成功；正在执行 `Build frozen candidate MSI and NSIS`。生命周期尚未开始，最终是否通过未知。停止的只是本机 `gh run watch`，没有取消 GitHub 运行。

## 4. 换机后的第一组动作

在新电脑克隆或更新仓库后，先执行只读核对：

```powershell
git fetch origin --tags
git switch main
git pull --ff-only origin main
git status --short
git rev-parse HEAD
gh run view 33378338422 --json status,conclusion,headSha,url,jobs
```

预期 `main` 至少包含 `6d208bc…`，工作区为空。不要因为本地没有 `target` 安装包就重新构建或重新触发；`target` 本来不提交。

- 若运行仍是 `queued` / `in_progress`：只等待 `gh run watch 33378338422 --interval 30 --exit-status`。
- 若运行 `failure`：先用 `gh run view 33378338422 --log-failed` 取得真实失败，记录“预期—实际—差异—修正”，修复后提交推送，再触发一次新的精确候选运行。不得覆盖或伪造失败回执。
- 若运行 `cancelled`：确认不是仍有同候选运行后，才重新触发。
- 若运行 `success`：不要立刻发布，按下一节导入和审计。

## 5. 成功后的严格接续顺序

1. 查询运行 artifact 元数据，下载名为 `v118-candidate-lifecycle-33378338422` 的原始 ZIP 到仓库外临时目录；记录 artifact ID、服务端大小和下载 ZIP 的 SHA-256。
2. 独立核验托管 MSI/NSIS 和上一版 NSIS 的实际大小、SHA-256、产品版本及 `NotSigned`；核对 `installer-build-receipt.json`。
3. 核对 R5I `22/22`、R5J `18/18`、安装态路由 `11/11`、R5L `7/7`、失败 `0`，确认候选提交为 `5988c03…`、上一公开提交为 `2b6235d…`，且不含用户源内容。
4. 参考 `scripts/import-post-v116-m5-6-v1017-hosted-evidence.mjs` 新增 M6-5 专用导入脚本；只导入结构化回执和必要脱敏截图，不提交安装器、内嵌 ZIP、临时绝对路径或用户内容。
5. 人工查看所有关键截图，写入真实预期/实际差异；把 `shared/post-v117-m6-5-v1018-hosted-installer-lifecycle-policy.json`、M6-5 审计、开发对齐、README 和 Release Notes 更新为实际结果。
6. 扩展 M6-5 检查器，运行阶段检查、V1 社区发布检查、当前开发全量审计和 `git diff --check`；全部通过后独立提交并推送。
7. 进入 **M6-6 v1.0.18 最终产物清单与发布就绪审计**：只晋级通过托管生命周期的 MSI/NSIS，生成公开 `LongEdit_*` 名称、`SHA256SUMS.txt`、最终 artifact manifest，并再次审计发布说明和边界。
8. M6-6 全绿后才进入 **M6-7 Tag、GitHub Release 与远端附件回下载复核**。Tag 必须绑定产品候选 `5988c03…`，Release 必须为非 Draft、非 Prerelease，三个附件必须从公开地址重新下载核验。
9. 发布后单独执行 **M6-8 v1.0.17 → v1.0.18 官方应用内更新观察**；验证发现、显式确认、官方 NSIS SHA-256、覆盖安装、自动重启、最新版状态和资料/配置保留。完成前不能宣称整个 v1.0.18 更新链收口。

## 6. 禁止跨越的边界

- 不要重新实现或重测已经收口的 M6-4，除非新证据证明回归。
- 不要把本地 M6-4 哈希写成托管或最终发布哈希。
- 不要在 M6-5 成功证据导入和 M6-6 发布就绪审计前创建 `v1.0.18` Tag/Release。
- 不要提交 `src-tauri/target`、下载的安装器、Actions ZIP、用户资料或含本机绝对路径的证据。
- 不要把 `releaseCandidate=false` 改为 true；它代表企业签名候选边界，社区无签名发布也必须等全部门禁完成。

## 7. 关键文档入口

- M6-4 完整审计：`docs/Post_v1.0.17_M6_4_v1.0.18_Atomic_Version_Transition_and_Candidate_Packaging_Audit_2026-08-31.md`
- M6-5 托管入口审计：`docs/Post_v1.0.17_M6_5_v1.0.18_Hosted_Installer_Lifecycle_Audit_2026-08-31.md`
- 当前开发对齐：`docs/Development_Alignment_and_Closure_Plan_2026-08-02.md`
- v1.0.18 社区发布边界：`docs/V1_0_18_Unsigned_Community_Release_Audit_2026-08-31.md`
- v1.0.18 发布说明：`docs/RELEASE_NOTES_v1.0.18.md`
- 当前机器策略：`shared/development-version-policy.json`、`shared/v1-community-release-policy.json`、`shared/post-v117-m6-4-v1018-candidate-packaging-policy.json`、`shared/post-v117-m6-5-v1018-hosted-installer-lifecycle-policy.json`
