# v1.1.8 搜索完整性：社区版发布审计

## 封板结论

**v1.1.8 已封板并公开发布。** [完整同包复核 39013468078](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/39013468078)、[最终驱动完整 CI 39013469737](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/39013469737)与[发布及公开回下载 39013950570](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/39013950570)均 **success**。PR #57 已合并；封板证据提交 `fc0b65dc` 已推送。标签 v1.1.8 精确指向验收源码 60476b3e，未移动旧标签或重建替换安装器。

[正式 Release](https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.1.8) 非草稿、非预发布，公开三附件下载的大小/SHA-256 与原始构建逐项一致。真实运行、Release API、回下载与导入收据保存在 `evidence/v1.1.8-release/publication/`、`release-receipt.json` 和 `publication-import-manifest.json`，经拒绝不明/失败/错误源码及摘要的导入器核验后才登记已发布。README 已切换正式下载，图标和介绍保留，更新摘要仍在末尾。下一目标 1.1.9，不将计划称作实现。

## 固定身份与真实安装证据

产品源码 **60476b3e0663fca4f933271dfe56446ec33ffec9**，原构建 **39009632854**。该运行整体失败在首轮驱动，但质量门、完整原生与独立性能、安装器构建和摘要四个步骤全部成功；不将整体冒称成功。后续三个驱动修正没有改 `src/` 或 `src-tauri/`，最后成功运行复用原始安装器与公开 1.1.7 旧包重新完成全生命周期。

| 检查层级 | 最终结果 |
| --- | --- |
| 本版搜索原生 IPC/磁盘、实际 WebView 输入、Office 定位 | 10 + 6 + 4 = 20 通过 |
| 1.1.0—1.1.7 功能继承 | 8/8/9/8/8/11/13/12 = 77 通过 |
| NSIS 安装、覆盖升级、降级检测与恢复、卸载保留数据、回滚 | 22 通过 |
| 安装工作区及实际页面 | 18 项、11 条路由通过 |
| 管理数据备份/恢复、索引重建与复开 | 7 通过 |
| 运行时版本、侧栏、设置与更新查询身份 | 4 通过 |

原始报告、截图与摘要清单保存在 `evidence/v1-1-8-candidate-lifecycle/`、`evidence/v1.1.8-release/import-manifest.json`；安装态校验器重新核对源码、安装器、EXE、驱动、原始 JSON 摘要及精确检查 ID，禁止缺报告或 Debug 冒充。EXE SHA-256 **46b8da91951882ec17fa5e4fb8f79832365c29ae3609356af17c2ed4400daa13**。本机没有安装、改注册表或接管桌面，所有原生输入在 GitHub 托管 Windows 的一次性环境。

| 安装器 | 字节 | SHA-256 |
| --- | ---: | --- |
| LongEdit_1.1.8_x64_zh-CN.msi | 76,779,520 | `e8fe3697f4a279beb191902c1f9de314e63acb7e03e839f605869e74694e0785` |
| LongEdit_1.1.8_x64-setup.exe | 67,798,543 | `69ec121088e98fa58b5a10b0abde339ddc7676c242196b576b08033f08950481` |

## 原图审查与失败保留

已实际查看最终原图：续载失败及底部重搜仍保留 80 文件与 dirty 草稿，修改时间排序、显式只读参考、跨库草稿拦截、PDF 第 1 页批注 3、Word 分页后的块、PPT 第 1 页对象和第 2 页备注、Inventory→Details 连续工作表均与原始报告一致。另核对真实 1/1 库完成的零结果、TXT 主区打开、移动/本地图片接续、保存冲突和历史备注页面，没有将混合范围未查全算作空结果。

前三轮失败 **39009632854 / 39012486660 / 39013084620** 分别是 Windows 短长路径身份、旧标题节点定位和混合不可读范围的“真正空结果”前置假设，原图、日志和报告均保留在 `evidence/v118-installed-closure/`。只修驱动前置/精确打开按钮；未删除困难样本、放宽业务断言、清草稿或注入假结果。详见[收尾记录](V1_1_8_Installed_Release_Closure_2026-10-17.md)。

## 发布边界与下一步

未签名 `community-unsigned` 社区版，不是企业签名 RC。Windows 可能显示“未知发布者”，用户应从官方 Release 手动下载安装并核对 SHA-256。下一目标按既定路线做 1.1.9 工作现场可迁移、根目录映射和失效项恢复，UI 改动仍先示意并实看，不扩展新平台/新格式。

开发身份策略仍为 `releaseCandidate=false`；社区发布策略中的 `releaseCandidate=true` 表示本社区渠道已经具备发布证据，不等于企业签名 RC。封板证据提交后的 main CI **39013946089 failure**，原因是重写本审计时漏写前一项明确披露；产品、安装器和同包复核未受影响。此处补回实际策略语义并保留失败原日志，完整质量门重新核对，不删除披露检查。

发布后最终本地 `npm run ci:patch-release` **通过，生产依赖 0 漏洞**，只有既有 dead-code 警告；发布导入/安装证据/搜索反馈/更新边界等相关 **32 项通过**，完整当前开发审计与版本身份检查通过。闭合原日志在 `evidence/v118-installed-closure/publication-final-{quality,audit,contracts}.log`。README 开头图标、正式附件地址、历史行和末尾更新摘要另行检查通过；首轮检查命令的 PowerShell 引号语法错误保留为 `publication-readme-check-before.log`，修正命令后检查，没有为检查改坏产品或 README。

安装继承保留 1.1.0—1.1.7 所有任务，本版另有 20 项真实搜索/Office 检查。MSI 只做构建/摘要验证，不称完整 MSI 生命周期；NSIS 覆盖安装不称应用内自动更新验证。此前官方 1.1.6→1.1.7 更新观察保持 pending，本版 1.1.7→1.1.8 也需发布后独立观察。
