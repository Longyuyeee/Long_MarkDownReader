# M7-4 v1.0.19 原子版本迁移与候选打包审计

日期：2026-08-31

当前状态：**通过；原子迁移、完整质量门、真实双包与本机 WebView2 烟测已完成。**

## 原子迁移回执

基于 M7-3 已通过的提交 `a21041bb4062886e6152918ce0851cfefb1b002f`，使用仓库既有受控清单同步 **44** 项当前运行身份：package/lock、Cargo/lock、Tauri、37 个活动共享合同、开发策略和社区发布策略均切到 `1.0.19`。

公开事实保持 `v1.0.18`，公开 Tag 提交仍为 `5988c03c…`；`v1.0.19` Tag/Release 不存在，`releaseCandidate=false`。社区策略已重置所有候选门为 false，旧 v1.0.18 Release 回执没有冒充当前候选证据。

## 候选回执

- 精确候选源码：`9655b02142b64bd8e7f1ad4056a4b9c6f0367990`。
- `npm run ci:patch-release`：通过；6,275 前端模块、Rust locked check、生产依赖漏洞 0。
- 托管 MSI：75,386,880 bytes，SHA-256 `04aca041970120b0685cb1d30ee95e5102b6fdd60b59394f3ecac45a00b863f0`，`NotSigned`。
- 托管 NSIS：66,777,917 bytes，SHA-256 `996e12218a24e1689947ec0c358720cc84cc136ffb2ac581fe31682fb8516582`，`NotSigned`。
- 本机真实 Tauri：6/6 检查、11/11 路由，TXT/JSON 保存—离开—复开通过，未包含用户内容。

本机构建生成了独立 MSI（75,640,832 bytes，SHA-256 `4d807c…18b3`），但 NSIS 工具缓存的 32 位加载器以 `0xC0000135` 失败。纠偏后不把本机半套产物冒充双包成功，而是以 GitHub 托管 Windows 从固定候选提交重建、随后通过完整安装生命周期的双包作为后续晋升对象。

## 下一动作

M7-4 已接受并进入 M7-5；公开 v1.0.18 与 `releaseCandidate=false` 边界保持不变。
