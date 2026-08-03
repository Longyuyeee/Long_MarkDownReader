# V1.0.2 未签名社区版发布审计

审计日期：2026-08-03  
当前状态：v1.0.2 社区版已发布  
发布渠道：`community-unsigned`  
版本：`1.0.2`

## 结论

v1.0.2 的代码范围已经完成 P0、UI-1、UI-2、UI-3、UI-4 与新品牌图标收口，可以进入补丁质量门禁、手动安装包构建和 GitHub Release 发布。能力矩阵继续保持 `releaseCandidate=false`，不把社区补丁状态误写为企业签名发布候选。

## 发布方式

本版本采用手动下载安装：发布 NSIS、MSI 与 SHA-256 清单。安装包没有 Authenticode 签名，Windows 可能显示“未知发布者”。

原 Tauri 自动更新私钥在当前发布工作站不可用。为保持既有信任边界，本次保留原公钥，不生成、不上传 `latest.json` 与 `.sig`，也不宣称自动更新可用。用户需要从官方 GitHub Release 下载 v1.0.2。

## 已对齐项目

- package、Cargo、Tauri、能力矩阵与社区发布策略统一为 `1.0.2`。
- 应用内、Windows、macOS、iOS、Android 与 README 图标统一使用实心金色 `L` 母版。
- 41 类格式、10 套发布能力配置和复杂格式降级边界保持不变。
- v1.0.0 安装生命周期证据作为历史基线继承，v1.0.1 作为本补丁覆盖安装基线。
- README 和发布说明明确手动分发、未知发布者、SHA-256 与自动更新限制。

## 质量回执

- `npm run ci:patch-release` 本地通过；GitHub Quality Gate `30795402967` 在提交 `740250b87a6e35b25c65eb87edc33f0dd7a1bf3d` 上通过。

## 安装包回执

候选来源提交：`3a5ce4e7171f05456c82469249c6bcaa5b5d3677`  
候选 GitHub Quality Gate：`30795936184`，结论 `success`

- `LongEdit_1.0.2_x64-setup.exe`：53,427,942 bytes，版本 `1.0.2`，`NotSigned`，SHA-256 `893cc3a9f848e62e76e03b82707b1840baf1564e8e422a36d461a73361a11880`。
- `LongEdit_1.0.2_x64_zh-CN.msi`：58,224,640 bytes，`NotSigned`，SHA-256 `b980e3d118b7fcd7eb50cf4296f783e810f28ad914680bdab5c7dbaa46e34add`。
- Release 附件目录共 3 个文件：EXE、MSI、`SHA256SUMS.txt`；`.sig` 与 `latest.json` 数量为 0。

## 发布回执

- 标签：`v1.0.2`
- 标签提交：`9f5c08149f8a12875e4be5b773383307dacc50a2`
- Release：https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.2
- 发布时间：`2026-08-03T08:43:05Z`
- 最终候选 Quality Gate：`30797978299`，结论 `success`
- Release 状态：非 Draft、非 Pre-release
- 附件：NSIS、MSI、`SHA256SUMS.txt`，GitHub digest 与本地 SHA-256 一致

审计结论：v1.0.2 手动社区发布已完成。后续进入安装反馈与稳定性观察，不再把本版本描述为待发布候选。
