# v1.0.5 无签名社区发布审计

状态：**Quality Gate 与安装包证据待完成**

渠道：`community-unsigned`

企业候选边界：`releaseCandidate=false`

## 当前结论

v1.0.5 已完成源码版本同步和发布前代码审计，可以进入冻结提交、Quality Gate、MSI/NSIS 构建与哈希复核。v1.0.4 的 18/18 安装生命周期、15/15 安装态功能和 11/11 路由证据仅作为上一公开版本历史基线，不继承为 v1.0.5 当前安装证据。

## 发布要求

- 必须从冻结提交构建 NSIS 和 MSI，并记录版本资源、大小、SHA-256 与 `NotSigned` 状态。
- 必须等待同一源码提交的 GitHub Quality Gate 通过。
- 无 Authenticode 证书时允许按用户既定决策发布社区版，但 README 与 Release 必须提示未知发布者和 SHA-256 校验。
- v1.0.4 用户需手动下载安装 v1.0.5 一次；v1.0.5 起启用固定 GitHub Release 与 SHA-256 的受控自动更新。
- 不生成或上传旧 Tauri 更新器的 `latest.json`、`.sig`，也不伪造遗失的私钥签名。

## 发布前状态

当前不得标记 GitHub Release 已发布。完成安装包、运行烟测、远端附件复核后，再写入源码提交、Quality Gate 运行、附件哈希、Release URL 和发布时间。
