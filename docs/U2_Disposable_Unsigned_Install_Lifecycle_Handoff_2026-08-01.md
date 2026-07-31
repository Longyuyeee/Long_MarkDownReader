# U2 一次性 Windows 未签名安装生命周期交接

日期：2026-08-01

状态：`handoff-ready-current-host-execution-blocked`

产品产物提交：`953494c50360d232e0848d0bab80e0defd3c53d4`

发布状态：`releaseCandidate=false`

## 当前结论

U2 的执行输入、生命周期脚本和 Sandbox 配置生成器已经就绪，但当前主机不是安全的一次性执行环境，因此没有运行安装器。

预检确认：

- U1 NSIS 安装包存在且 SHA-256 与清单一致；
- 安装包 Authenticode 为 `NotSigned`；
- 0.6.2 回滚安装器存在；
- 当前有 1 个 LongEdit 安装注册和 1 个正在运行的 LongEdit 进程；
- Windows Sandbox、Hyper-V `New-VM`、VMware、VirtualBox 和 QEMU 均不可用；
- 主机安装修改保持禁止。

## 已修正的交接缺陷

Sandbox 生成器以前总是使用仓库当前 HEAD 作为证据源提交。安装包构建完成后再提交审计文档，会导致产品产物和证据错误绑定。

现在生成器优先读取安装包清单中的 `sourceCommit`，所以 U1 安装包始终绑定 `953494c`，即使交接脚本位于后续提交。生成配置不再要求当前主机必须安装 Windows Sandbox；只有使用 `-Launch` 真正启动时才要求 Sandbox 存在。

## 在一次性 Windows 机器执行

机器必须没有现存 LongEdit 注册或进程，并具备 Windows Sandbox；仓库与 U1 本地候选目录需要一并安全传输。

```powershell
npm run audit:u2-disposable-install-environment
npm run prepare:u2-windows-sandbox -- -Launch
```

生成器会把仓库只读映射到 Sandbox，把输出目录可写映射到：

`docs/evidence/u2-disposable-install-lifecycle/sandbox-output`

生命周期覆盖旧版安装、受控升级、首次启动、文件关联、右侧工作区 TXT/JSON 保存重开、代表性格式路由、管理备份恢复、知识索引恢复、降级拒绝、卸载、关联恢复和用户数据保留。

## 接受标准

- `lifecycle-result.json` 完整且所有检查通过；
- 证据中的产品源提交为 `953494c`；
- 当前安装包哈希与 U1 清单一致；
- 没有真实用户内容、机器名、用户名或凭据；
- 卸载后恢复安装前状态；
- 结果只能证明未签名内部候选生命周期，不得晋级 RC。

U2 成功后，将同一产品基线交给 R5N，取得真实签名材料并完成 Windows 10/11 两条已签名运行通道。

## GitHub Hosted Runner 通道

当本机没有虚拟化能力时，可手动触发 `.github/workflows/u2-unsigned-lifecycle.yml`。该通道在一次性 `windows-latest` runner 中分别构建产品提交 `953494c` 与回滚标签 `v0.6.2`，验证当前安装包为未签名，然后执行相同生命周期脚本。

无论生命周期成功还是失败，工作流都会上传当前/回滚安装包、构建回执和已产生的证据，便于审计 guest-only 问题。Hosted Runner 结果只计入 U2 未签名内部验证，不可替代 Windows 10/11 客户端和正式签名证据。
