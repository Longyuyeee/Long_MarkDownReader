# V1.0.2 未签名社区版发布审计

审计日期：2026-08-03  
当前状态：质量门禁与安装包构建准备中  
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

## 待完成回执

- `npm run ci:patch-release` 本地与 GitHub Quality Gate。
- v1.0.2 NSIS/MSI 构建、文件签名状态与 SHA-256 检查。
- GitHub 标签、Release URL、附件列表和最终提交回执。
