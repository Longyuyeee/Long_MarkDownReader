# U1 未签名内部候选安装包审计

日期：2026-08-01

版本：`0.7.0`

产物源提交：`953494c50360d232e0848d0bab80e0defd3c53d4`

## 结论

U1 已完成构建与登记。两个安装包均来自隔离、无本地修改的 E5 提交，已经记录大小、SHA-256 和 Authenticode 状态；它们只能作为内部候选包，`releaseCandidate=false`。

| 类型 | 文件 | 大小 | SHA-256 | 签名 |
| --- | --- | ---: | --- | --- |
| MSI | `Long编辑_0.7.0_x64_zh-CN.msi` | 56,524,800 | `d1e8d90b99bc5611a6b14c819913810af254a3ddcccd1ffc7cac21b4cc95e17d` | `NotSigned` |
| NSIS | `Long编辑_0.7.0_x64-setup.exe` | 52,101,715 | `a00236f7921f331ef690a75ba8a6417cbbc88c0b97bbbff14a1d8cd5957c072e` | `NotSigned` |

本机产物位于忽略目录 `src-tauri/target/release/bundle/u1-unsigned/953494c`，二进制不提交 Git；提交的只有脱敏清单。

## 隔离构建

主工作区存在用户未提交的 PPTX 修改，因此本次没有直接在主工作区打包。构建从提交 `953494c` 创建独立 detached worktree，执行：

```powershell
npm run tauri -- build --bundles msi,nsis
```

这样保证安装包不包含 `.claude/settings.local.json` 或 `src-tauri/src/formats/pptx.rs` 的本地修改，也不覆盖原有 R5H/R5N 产物。

## 运行预检

尝试在隔离 AppData 和临时库中启动同一构建的 release 可执行文件。当前用户会话已有另一份 LongEdit 正在运行，release 单实例机制让候选进程退出，因此结果记录为 `blocked-existing-single-instance`。

本次没有关闭现有用户进程，没有执行 MSI/NSIS，没有修改安装注册表，也没有把该阻塞误报为运行通过。

## 下一阶段：U2

U2 在没有现存 LongEdit 进程、没有产品注册的一次性 Windows 环境中执行：

1. 重新核对 NSIS 哈希；
2. 安装并验证启动、统一工作区、TXT/JSON 保存重开和代表性格式路由；
3. 验证文件关联、管理备份、知识索引恢复、卸载和数据保留；
4. 产出脱敏证据并卸载；
5. 继续保持未签名、内部使用和 `releaseCandidate=false`。

U2 不替代 R5N 的真实签名与 Windows 10/11 双通道，只是把未签名内部候选的生命周期先收口。
