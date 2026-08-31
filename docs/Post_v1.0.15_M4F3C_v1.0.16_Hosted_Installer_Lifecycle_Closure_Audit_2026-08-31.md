# M4F-3C v1.0.16 托管安装包与生命周期关闭审计

日期：2026-08-31

结论：精确产品提交 `757d54309ddb35f445344d909fa4c7ba2567bc58` 已在 GitHub 托管 Windows 完成双安装包构建、`1.0.15 → 1.0.16` 升级、安装态工作区、卸载保留与管理回滚；M4F-3 关闭，进入 M4F-4，仍未创建 Tag 或 Release。

## 不可变身份

- 编排提交：`d78985d5ad10268b7555bd7a07a3ca778b9ae2b1`。
- 产品提交：`757d54309ddb35f445344d909fa4c7ba2567bc58`。
- 上一公开提交：`317b667679fff4e8e29ce2a0ca94f8e480764d13`（`v1.0.15`）。
- GitHub Actions：[运行 33322246630](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/33322246630)，46分49秒，全绿。
- Actions artifact：ID `9735798998`，名称 `v116-candidate-lifecycle-33322246630`，ZIP 206,211,967 bytes，SHA-256 `987e90b41e608c9d70629eecb1f7dce9893b0dfb5c30025036512fdb6da02c24`，GitHub 当前标示 2026-09-13T17:08:20Z 到期。

## 安装包独立复核

从成功运行下载 artifact 后，对文件本体重新计算哈希，与托管回执一致：

- MSI `Long编辑_1.0.16_x64_zh-CN.msi`：73,887,744 bytes，SHA-256 `e3fa4fe3e49406e1f2785496fad4fc002527f9945fd9239e22e0dca9869da215`，`NotSigned`。
- NSIS `Long编辑_1.0.16_x64-setup.exe`：65,788,796 bytes，SHA-256 `e1a688509279d191b4f39011336612cc6d47149bb5ab61d33c0a48ea091502ff`，`NotSigned`。
- 升级基线 NSIS `Long编辑_1.0.15_x64-setup.exe`：65,444,141 bytes，SHA-256 `30bab7b311877a3fa3e94ff75dd4058cb1f9ab9c557d65331dde5642adcd0c32`。

这些是 M4F-3 托管候选产物事实，不是 GitHub Release 附件；M4F-4 仍需形成最终 artifact manifest、校验和文件和发布说明，之后才能决定候选晋级。

## 生命周期结果

- R5I 22/22：旧版新装、受控升级、关联边界、Unicode/空格路径冷启动、单实例交接、受控降级检测与当前版恢复、静默卸载、用户数据保留、旧版回滚、备份恢复和索引重建全部通过。
- R5J 18/18：安装态启动、TXT/JSON 保存重开、三生产者 DOCX 超链接、知识网络脉搏、建议、观察会话、主题 `Graph?root=` 居中、回执复核、默认应用候选和性能导出全部通过；代表路由 11/11。
- R5L 7/7：正式配置读取、管理备份、隐私预检、索引删除重建、回滚后备份恢复、索引恢复和代表文件重开全部通过。
- 知识网络夹具得到 11 个对象、9 条关系、11 个已连接对象、0 个孤立对象、100% 覆盖；主题路由为 `#/graph?focus=overview&root=...`。
- 管理备份 13,996 bytes、5 个条目、1 个脱敏资料库；文档正文、密钥、系统凭据、绝对用户路径、可重建缓存正文和外部资料库内容均排除。

## 失败历史与路线纠偏

前三次运行没有被删除或包装成波动：`33264898797` 发现 M2A2 后旧工作台验收路径，`33267563652` 发现治理面板首挂载不扫描，`33319332897` 发现主题居中未持久化 `root` 深链。第四次运行逐项越过这些位置并完成全链，证明纠偏与最初 M2A2、G11/G16 路线一致。

## 换机证据交接

仓库内 `docs/evidence/post-v115-m4f3-v1016-hosted-installer-lifecycle/` 保存 29 个结构化回执和必要截图；不包含用户源内容，也不提交 200 MB 安装包。`import-manifest.json` 保留下载 artifact 原始 1,552,423 bytes / SHA-256 树 `da466efc170b487b95c5a6fbfbd4f9558d23058ff9080a19a7156c8b20181d25`，并由 M4F-4 增加跨平台规范树：JSON 固定缩进和 LF、图片原字节，共 1,549,514 bytes / `8488388c57a5646454a8d6ab7723ddcdbe135ce5259ede436d89b990ed045ad0`。这样既保留远端原始来源回执，也不会因 checkout 换行转换导致换机门禁误报。

如需在 artifact 到期前重新下载：

```powershell
gh run download 33322246630 --repo Longyuyeee/Long_MarkDownReader --dir <新目录>
```

## 当前进度与唯一接续点

九道发布门禁完成 7/9：产品冻结、版本迁移、完整质量门禁、R5F/R5G、双安装包、托管安装生命周期和安装态工作区均完成；剩余 M4F-4 的最终哈希/`NotSigned`/发布说明审计，以及绑定产品提交的 Tag、GitHub Release 与远端附件回下载复核。

唯一下一步为 **M4F-4 v1.0.16 最终 artifact manifest、SHA256SUMS、发布说明与发布就绪审计**。本审计保持 `releaseCandidate=false`，不得直接创建 `v1.0.16` Tag 或 Release。
