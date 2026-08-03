# V1.0.3 未签名社区版发布审计

版本：`1.0.3`  
当前状态：安装热修复已构建并完成本机覆盖安装验证，本地补丁质量门禁通过，等待 GitHub Quality Gate 与 Release 发布回执。

本补丁只关闭两个 v1.0.2 安装态回归：动态组件样式因打包 CSP 改写失效，以及启动时外部应用发现反复调用 `reg.exe`。修复未扩大格式、Excel、Office 或主题能力承诺。

发布渠道保持 `community-unsigned`，企业候选边界保持 `releaseCandidate=false`。由于自动更新私钥不可用，用户继续通过官方 GitHub Release **手动下载安装**。

验证结果：

- 源代码基线：`9e6f290a6fc569b301e04e5fc2a8e4bee71a9ce9`
- NSIS：53,463,488 bytes，SHA-256 `2b01ec0a51f9b9423eec1febc897c26567536394c20fc340da25576dcb87973c`
- MSI：58,269,696 bytes，SHA-256 `a3a421974c6ef9be2a583267e76554dbcd69c3354089e64365d0f179f82671b8`
- Windows 200% 缩放安装态：Naive UI 样式通过，18px 图标，0 个超大 SVG。
- v1.0.2 到 v1.0.3 覆盖安装成功；15 秒启动观察中 `reg.exe` 启动次数为 0。
- 安装包未做 Authenticode 签名；自动更新私钥仍不可用，因此只发布 NSIS、MSI 和 `SHA256SUMS.txt`。

发布后需补写 GitHub Quality Gate、标签、Release URL 和最终提交回执。
