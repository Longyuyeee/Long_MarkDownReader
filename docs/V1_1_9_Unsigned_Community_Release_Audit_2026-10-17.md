# v1.1.9 社区版发布审计（已封板、已公开）

**[v1.1.9 正式 Release](https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.1.9) 已公开**，发布时间 2026-10-17 18:55:40（北京时间）。发布与公开回下载 **39026697077 success**，三个附件大小、SHA-256 和 GitHub digest 与原验收包一致；不是重新打包。原始 API、工作流、收据与回下载结果已严格导入 `evidence/v1.1.9-release/publication/`。运行时/公开均 **1.1.9**，下一开发目标 **1.1.10**。

本版 UI、相对路径元数据与恢复保护实现见[开发审计](V1_1_9_Work_Session_Development_2026-10-17.md)，正式页面与失败保留见[页面证据](evidence/v119-session-ui/README.md)。

## 固定源码与通过的证据

产品与标签固定源码 **b92c18a1705cf787a05c2b3a97e78feeb29d46fb**。原构建 **39020293589** 整体 failure，但完整质量门、完整 Rust 回归、MSI/NSIS 生成及不可变收据四项构建门成功。后续未修改产品或重建安装器；独立同包复核 **[39025506534](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/39025506534) success**，驱动 **61b94e5fdd06a6db07eb5159df44749838f31293**，不是把原失败运行改称成功。

| 范围 | 实际结果 |
| --- | --- |
| 本版工作现场：原生选择、导入/导出、去重/重定位、草稿与隐私、40 阅读位置、重载与窗口权限 | 12 项通过 |
| 1.1.0—1.1.8 功能继承 | 8/8/9/8/8/11/13/12/20，共 97 项通过 |
| NSIS 安装、1.1.8 升级、降级安全与恢复、卸载保留数据及回滚 | 22 项通过 |
| 安装工作区、页面路由、管理恢复、版本身份 | 18 / 11 / 7 / 4 通过 |
| 真正退出并启动同一已安装 EXE/同一配置 | 41 项现场记录，首尾位置 340 / 457，通过 |

原始报告/原图归档 `evidence/v1-1-9-candidate-lifecycle/`，逐文件大小/摘要见 `evidence/v1.1.9-release/import-manifest.json`。严格验证器已核对源码、版本、安装器、EXE、驱动和各代完整报告；EXE SHA-256 **819bb01004143d4502983ae7e5a4b8a6ec5fa9f868986d1b50a2a804c6cc0b16**。真实磁盘 42 份源文件在明确手动保存前摘要不变，dirty 精确对象及当前活动文稿保留；40 份阅读元数据在首次/末份、WebView 重载和真正进程重启均实际消费，不靠模拟数字。

| 安装器 | 字节 | SHA-256 |
| --- | ---: | --- |
| LongEdit_1.1.9_x64_zh-CN.msi | 76,877,824 | `e7206f10787df5587f6ec2e7e71a6ccfcd958fd6a5fdfcb9324551f89d999443` |
| LongEdit_1.1.9_x64-setup.exe | 67,870,194 | `d9d7497867c6461bdf30f8fd36d138cf070c999baddf29969375f9e14a96b126` |

## 实际页面与失败保留

已实看本次成功运行的导入弹窗、阅读位置、进程重启、文件移动、保存历史、修改时间搜索排序和工作簿定位原图。正式 UI 的六风格/宽窄短窗另外分层保留；不将本地模拟 IPC 当作真实安装。

此前失败及纠正逐轮保留在 `evidence/v119-installed-closure/` 和[收尾台账](V1_1_9_Installed_Release_Closure_2026-10-17.md)：真实 HWND 定位、跨进程 Edit 读取、文件名通知、启动和桥就绪、保留筛选后的场景准备、滚动行坐标竞争。未清 dirty、关闭动效、伪造路径、删难样本或放宽业务断言。最终驱动额外通过 19 项合同和 5 项真实浏览器输入检查；它们是驱动检查，不替代安装证据。本机未运行安装器、改注册表或接管桌面，原生操作仅在自有的一次性远端环境。

## 发布边界与下一步

开发策略 `releaseCandidate=false` 表示没有企业 RC 提升；社区发布策略 `releaseCandidate=true` 表示社区渠道具有封板证据，二者不是矛盾，也不代表 Authenticode 签名完成。标签已固定上述产品，发布相同安装器并公开回下载核对三附件；README 更新摘要放在末尾。下一版按[标签与集合接续审计](V1_1_10_Tag_Collections_Preimplementation_Audit_2026-10-17.md)实施，仍保留先示意、实际页面核对和全部功能。

未签名 `community-unsigned` 社区包保留“未知发布者”警示，用户可从正式 GitHub Release 手动下载安装并核对 SHA-256，自动更新观察独立。MSI 摘要验证不称完整 MSI 生命周期；覆盖安装不称应用内更新通过。当前安装及发布进度见[收尾台账](V1_1_9_Installed_Release_Closure_2026-10-17.md)。

封板时完整 `npm run ci:patch-release` **退出 0 / 生产依赖 0 漏洞**，当前开发审计通过；原始日志 `evidence/v119-installed-closure/freeze-{quality,audit}.log`。驱动 CI **39025508640**、main CI **39026105794**、封板证据 CI **39026136426** 均 success；PR **#60 / #61** 分别合入 main **8866da6f / 48104dfb**。证据/发布文档独立提交，不移动产品或安装器；发布及公开回下载已经真实完成，原始收据不可改写。

发布导入后最终完整质量门 **退出 0 / 生产依赖 0 漏洞**，当前开发审计通过，相关发布/安装/输入合同 **16 项通过**；原始日志 `evidence/v119-installed-closure/publication-final-{quality,audit,contracts}.log`。另用只读脚本核对 README 开头图标/介绍不变、历版行保留、更新摘要在末尾、正式附件路径和摘要、Release 正文及下一目标一致。首轮正文比较仅因 Windows Actions 的 CRLF 与本地 LF 不同而失败，原日志 `publication-readme-before.log` 保留；只规范比较换行，不重写原 API/发布正文、安装器或原始收据，复核通过。
