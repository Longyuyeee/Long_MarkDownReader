# A10 DOCX 安装态执行器审计

> 最终安装态结论已由 `docs/A11_DOCX_Installed_Hyperlink_Audit_2026-08-05.md` 取代；本文件保留为执行器准备与早期失败记录。

日期：2026-08-04

阶段：UX-33J harness

结论：一次性 Windows 安装执行器已对齐当前版本和三生产者 DOCX，真实远端执行尚未完成。

## 本步完成

- GitHub U2 一次性 Windows 流水线不再硬编码 `1.0.0`，而是从冻结产品 checkout 读取实际提交和 `package.json` 版本，并把版本显式传给安装生命周期脚本。
- 安装后的真实 Tauri WebView2 烟测新增 Word、WPS Writer、LibreOffice Writer 三份原生超链接 fixture：Word/LibreOffice 检查两个链接文字目标、草稿、撤销/重做、隔离验证和保存边界；WPS 检查字段链接为零个编辑目标。
- 证据同时绑定产品提交、无签名 NSIS SHA-256、fixture SHA-256 和净化后的临时路由。只使用仓库合成 fixture，不包含用户内容，也不在宿主机执行安装器。
- 新增 `check:ux33j-installed-docx-harness`；前端生产构建、U2 hosted workflow 合同和 DOCX 三生产者合同通过。

## 当前边界

旧 R5J/U2 证据属于 `1.0.0` 与提交 `6f3ce50`，不能证明当前 `1.0.3`。因此 UX-33 仍为进行中，本检查点也不产生新的安装态通过结论。

首次 hosted run `30897488050` 已成功构建提交 `22ac691` 的 `1.0.3` 无签名 NSIS 和 `0.6.2` 回滚包，但在安装后烟测进入 DOCX 前失败：旧脚本假设启动 hash 必须已经是 `#/workspace`。当前修复改为显式导航到工作台后检查组件。失败运行已上传与产品提交绑定的安装器，后续只允许在 `product_ref=22ac691` 时复用，不能把脚本修复提交冒充安装器源码。

## 下一步

先推送本执行器，再以该提交作为 `product_ref` 触发 `U2 Unsigned Disposable Lifecycle`。只有远端 runner 完成真实安装、首次启动、installed WebView 三生产者检查和卸载，并且下载证据通过本地复核后，才写入 UX-33J 最终结论。
