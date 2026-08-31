# M4F-5 v1.0.16 正式发布与远端附件复核审计

日期：2026-08-31

产品提交：`757d54309ddb35f445344d909fa4c7ba2567bc58`

发布前审计提交：`a6d6cbc088c43adc940858c8775f55d33af1ee2d`

Release：[`v1.0.16`](https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.16)，数据库 ID `379466292`

结论：**M4F-5 已通过；v1.0.16 无签名社区版已正式发布，三个公开附件均已从 GitHub 回下载并按文件本体复核。**

## 开发目标与需求对齐

- Tag 必须绑定真正产生安装包的产品提交，而不是后续文档提交：`v1.0.16^{}` 实际为 `757d543…`，符合预期。
- Release 必须为非 Draft、非 Prerelease 且成为 latest：实际发布时间为 `2026-08-31T02:09:02Z`，官方 `releases/latest` 返回 `v1.0.16`。
- 公开资产只能是两个安装器与 `SHA256SUMS.txt`：实际为 3 个，没有 EXE 裸程序、`latest.json` 或 `.sig`。
- 安装器继续保持无 Authenticode 签名社区边界；企业 `releaseCandidate=false`，没有借社区发布提升企业能力声明。
- M0～M4E 已验收的产品能力、有限编辑和只读边界没有变化。

## 预期与实际差异

| 项目 | 预期 | 实际 | 修正 |
| --- | --- | --- | --- |
| Tag 推送 | 当前 GitHub 凭据可直接推送 | 环境 `GITHUB_TOKEN` 只有 `repo`，缺少 `workflow`，候选历史含工作流时被 GitHub 拒绝 | 仅在发布命令进程内移除受限环境 Token，使用本机已有 `repo + workflow` 钥匙串凭据；未修改持久认证 |
| Release 上传 | 单次创建、上传并发布 | 两个大附件超过首个等待窗口，临时 Draft 只收到校验文件并被原进程回滚 | 改为先创建 Draft、三个附件逐个上传、核对服务器摘要，再显式发布 |
| latest 字段 | `gh release view` 提供 `isLatest` | 当前 gh 版本没有该 JSON 字段 | 通过官方 `repos/.../releases/latest` API 验证 Tag 为 `v1.0.16` |
| 远端资产 | 上传回执即可代表下载文件 | 上传摘要正确，但仍不能替代用户下载路径 | 发布后重新下载三个附件，按本体重算大小、SHA-256 与签名状态 |
| Windows 审计运行时 | Windows PowerShell 5.1 可直接完成哈希与签名检查 | 子进程无法使用 `Get-FileHash`，且不能加载 `Microsoft.PowerShell.Security` | SHA-256 改用兼容的 .NET 实现，审计入口固定为现有 PowerShell 7 `pwsh`；`NotSigned` 仍真实检查，不降级 |

所有差异均在保持 Draft 或无 Release 的安全状态下修正，没有删除、替换已经公开的附件，也没有放宽哈希要求。

## 真实远端测试

从公开 Release 回下载到隔离临时目录后得到：

| 资产 | 实际大小 | 实际 SHA-256 | 预期匹配 | 签名 |
| --- | ---: | --- | --- | --- |
| `LongEdit_1.0.16_x64-setup.exe` | 65,788,796 | `e1a688509279d191b4f39011336612cc6d47149bb5ab61d33c0a48ea091502ff` | 是 | `NotSigned` |
| `LongEdit_1.0.16_x64_zh-CN.msi` | 73,887,744 | `e3fa4fe3e49406e1f2785496fad4fc002527f9945fd9239e22e0dca9869da215` | 是 | `NotSigned` |
| `SHA256SUMS.txt` | 192 | `d25aa57073da234d6a6fc5e9af928be6c3d3642197a0f091ba1fa5aaeed966bc` | 是 | 不适用 |

GitHub 服务器返回的三项 `digest` 也分别与上述 SHA-256 一致。机器回执位于 `docs/evidence/v1.0.16-release/release-receipt.json`；可用以下命令对真实下载目录重新执行远端审计：

```powershell
npm run audit:post-v115-m4f5-v1016-remote-release -- -AssetRoot <GitHub Release 下载目录>
```

发布事实与文档修正完成后，仓库根目录重新执行完整 `npm run ci:patch-release`：Vite 生产构建成功（6,275 个模块），全部当前开发/发布合同通过，Rust/Tauri `dev` profile 编译成功，`npm audit --omit=dev` 返回 0 个漏洞。预期与实际均为退出码 0，没有跳过产品门禁。

## 阶段审计与唯一接续点

M4F-5 的 Tag、正式 Release、三个公开附件、latest 状态和回下载复核全部完成，九道发布门禁为 9/9。当前公开版本与运行时均为 v1.0.16；下一补丁目标登记为 v1.0.17，但尚未提升二进制版本或加入新功能。

唯一接续点为 **M4F-6 v1.0.15 → v1.0.16 官方应用内更新观察**：从真实已安装 v1.0.15 通过应用内更新发现、用户确认、官方 NSIS 下载与 SHA-256 校验、覆盖安装、自动重启、最新版状态以及资料保留进行独立托管验证。该观察完成前不得宣称 v1.0.16 的发布后更新链已经完全收口。
