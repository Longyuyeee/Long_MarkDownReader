# U2A Markdown 文件关联修复审计

日期：2026-08-01

状态：`remediated-awaiting-disposable-rerun`

发布状态：`releaseCandidate=false`

## 结论

首次 GitHub 托管 U2 生命周期运行（run `30652497740`）成功复现构建当前 0.7.0 与回滚 0.6.2 安装包，但在文件关联检查处失败。失败不是托管环境噪声，而是发现了一个真实契约偏差：产品声明由 Windows 和用户决定默认应用，但 Tauri NSIS 默认文件关联宏会直接写入 `.md` 与 `.markdown` 的默认 ProgID；原生命周期脚本则错误地只检查 `OpenWithProgids`。

本阶段完成以下修复：

- 新增 NSIS 安装/卸载 hook；安装时恢复安装前默认 ProgID，只登记 `LongEdit.Markdown` 为“打开方式”候选。
- 卸载时删除 LongEdit 的 OpenWith 登记和备份值，继续由 Tauri 清理 ProgID 命令。
- 生命周期执行器现在记录安装前 `.md`、`.markdown` 默认值，并验证升级后及卸载后均未变化。
- 生命周期执行器同时验证 LongEdit ProgID 的打开命令真实指向隔离安装目录。
- R2 静态门禁现在强制要求 hook 配置和安装/卸载两端行为，避免再次出现“声明正确、安装包行为漂移”。

## 本地验证

- `node scripts/check-r2-windows-lifecycle-contract.mjs`：通过。
- `run-r5i-isolated-install-lifecycle.ps1`：PowerShell 语法解析通过。
- `npm run tauri -- build --bundles nsis --debug`：通过；证明自定义 NSIS hook 能进入真实打包流程并由 `makensis` 编译。
- 本机存在用户正在运行的 LongEdit，未执行安装、卸载或注册表变更；动态结论必须由下一轮一次性 Windows runner 给出。

## 审计边界与下一步

本修复只纠正 Markdown 文件关联和 U2 验证真实性，不扩大格式能力，也不提升发布候选状态。下一步使用包含本修复的冻结产品提交重跑 GitHub 托管 U2 生命周期；只有完整安装、升级、路由、保存重开、降级拒绝、卸载、关联恢复、数据保留和回滚全部通过，才能把 U2 标记为完成。
