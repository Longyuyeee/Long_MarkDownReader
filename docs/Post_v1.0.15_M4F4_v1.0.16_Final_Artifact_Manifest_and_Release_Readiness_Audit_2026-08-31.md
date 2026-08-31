# M4F-4 v1.0.16 最终产物清单与发布就绪审计

日期：2026-08-31

阶段：M4F-4

产品候选：`757d54309ddb35f445344d909fa4c7ba2567bc58`

托管运行：`33322246630`
结论：**无签名社区候选已通过最终发布就绪审计；进入 M4F-5，尚未创建 Tag 或 GitHub Release**

## 开发目标与范围审计

本阶段只完成最终 artifact manifest、公开文件名映射、`SHA256SUMS.txt`、跨机器证据可重复性和发布说明对齐。不修改候选产品行为，不重新解释 M4A～M4E 的能力范围，不创建 `v1.0.16` Tag、GitHub Release 或公开下载附件。

预期发布附件固定为两份安装包加一份校验和文件：

| 类型 | 托管源文件 | 公开附件 | 预期大小 | 预期 SHA-256 |
| --- | --- | --- | ---: | --- |
| NSIS | `Long编辑_1.0.16_x64-setup.exe` | `LongEdit_1.0.16_x64-setup.exe` | 65,788,796 | `e1a688509279d191b4f39011336612cc6d47149bb5ab61d33c0a48ea091502ff` |
| MSI | `Long编辑_1.0.16_x64_zh-CN.msi` | `LongEdit_1.0.16_x64_zh-CN.msi` | 73,887,744 | `e3fa4fe3e49406e1f2785496fad4fc002527f9945fd9239e22e0dca9869da215` |
| 校验和 | — | `SHA256SUMS.txt` | 192 | `d25aa57073da234d6a6fc5e9af928be6c3d3642197a0f091ba1fa5aaeed966bc` |

## 预期与实际差异

| 检查点 | 预期 | 第一次实际 | 修正 |
| --- | --- | --- | --- |
| M4F-3 换机证据 | 任意检出环境可重算 | Windows checkout 后 12 个 JSON 因 LF→CRLF，原始字节树从 `da466e…` 变为 `6b64a8…`，门禁失败 | 保留下载 artifact 的原始 `1,552,423 bytes / da466e…` 回执；仓库复验改为 JSON 固定 2 空格缩进+LF、图片原字节的规范算法，下载源与工作树共同得到 `1,549,514 bytes / 848838…` |
| 文件名 | manifest 与公开资产一致 | 托管源为 `Long编辑`，发布准备脚本输出 `LongEdit`，候选策略只有一个文件名字段 | 同时记录 `sourceFileName` 和 `fileName`，只重命名，不改变安装包字节 |
| artifact 数量 | 两个安装包加独立校验和 | 旧社区检查器继承 v1.0.15，要求 manifest 有 3 个 artifact，但候选只有 2 个，逻辑无法同时满足 | manifest 固定 2 个 installer，`checksumFile` 独立验证 |
| 运行烟测 | 使用 v1.0.16 实际结果 | 旧检查器要求历史 `blocked-existing-single-instance` | 改为 M4F-2 已真实通过的 `passed-real-tauri-debug-webview2`、6/6 检查、11/11 路由和 TXT/JSON 保存重开 |
| 用户文档 | 显示当前候选状态 | README 仍写 M4F-1 和“安装包待构建” | 更新为托管生命周期与 M4F-4 已通过，同时明确 Actions artifact 不是公开下载 |
| Windows 审计编排 | 中文源文件和空 Tag 输出可稳定判断 | PowerShell 5.1 首轮把脚本内中文文件名误读为乱码；第二轮真实产物已全通过，但无 Tag 时命令返回 `$null`，直接 `.Trim()` 失败 | 从 UTF-8 JSON 读取中文源文件名；Tag 输出先显式转字符串，再完整重跑 |

这些差异均属于发布证据与合同问题，没有通过改变产品验收目标或安装包哈希规避失败。

## 真实产物复核

从 GitHub Actions artifact `9735798998` 下载 206,211,967-byte 归档并直接检查文件本体：

- NSIS 实际为 65,788,796 bytes、`e1a688…`、`NotSigned`，与预期一致。
- MSI 实际为 73,887,744 bytes、`e3fa4f…`、`NotSigned`，与预期一致。
- 同一下载中的 29 份 M4F-3 证据原始摘要与导入回执一致；规范化后与仓库检出证据一致。
- 公开名称副本与托管源逐字节相同，生成的 `SHA256SUMS.txt` 与仓库最终文件一致。
- 本阶段检查时本地不存在 `v1.0.16` Tag，GitHub API 返回 `release not found`。

最终机器事实位于：

- `shared/post-v115-m4f4-v1016-final-artifact-manifest-release-readiness-policy.json`
- `docs/evidence/v1.0.16-release/artifact-manifest.json`
- `docs/evidence/v1.0.16-release/SHA256SUMS.txt`

真实下载验证使用 `npm run audit:post-v115-m4f4-v1016-final-release-readiness -- -ArtifactRoot <artifact目录>`；不提供目录时，脚本从不可变运行自动下载并在临时目录验证。

完成上述修正后，仓库根目录真实执行 `npm run ci:patch-release`，实际结果为：Vite 生产构建成功（6,275 个模块）、当前开发审计及全部发布合同通过、Rust/Tauri `dev` profile 编译成功，`npm audit --omit=dev` 返回 0 个漏洞。预期与实际均为完整门禁退出码 0，没有以跳过测试或放宽产品行为合同换取通过。

## 需求对齐与发布边界

- M0～M4E 的能力、限制和用户价值不变。
- 社区无签名候选现为 `releaseCandidate=true`，表示可以执行公开发布；企业能力矩阵与开发策略继续 `releaseCandidate=false`，不宣称商业签名或企业 RC。
- 当前公开版本仍为 `v1.0.15`；自动更新在 v1.0.16 正式发布前不会发现候选。
- 最终安装包仍为 `NotSigned`，Release 必须保留未知发布者/SmartScreen 和 SHA-256 核对提示。
- Actions artifact 将于 2026-09-13T17:08:20Z 到期；M4F-5 应在到期前完成，或从同一候选重新生成并重新执行完整生命周期。

## 阶段审计与唯一接续点

M4F-4 开发目标已满足，九道门禁完成 8/9。唯一接续点为 **M4F-5 v1.0.16 Tag、GitHub Release 与远端附件回下载复核**：

1. 使用本阶段真实验证目录中的两个公开名称安装包与 `SHA256SUMS.txt`。
2. Tag/Release 必须明确绑定候选产品提交和最终审计提交之间的事实关系，不能把审计提交冒充安装包源码。
3. 创建非 Draft、非 Prerelease 的 `v1.0.16` Release，并使用本文件对应的发布说明。
4. 从远端重新下载三个附件，逐项核对名称、大小和 SHA-256。
5. 写入 release receipt、更新公开版本/README/社区策略，执行最终审计后提交并推送。

M4F-5 完成前不得宣布 v1.0.16 已发布。
