# v1.1.11 社区发布审计（已封板，已公开发布）

2026-10-18：公开/运行时 **1.1.11**，下一目标 **1.1.12**。[v1.1.11 正式 Release](https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.1.11) 已于 2026-10-17 17:36:25 UTC（北京时间 2026-10-18 01:36:25）公开。原安装及独立同包复核、封板 main CI、发布和公开回下载全部通过；没有重新打包或替换安装器。

## 固定身份与实际执行

- 产品/实际标签提交：`9b5adba245d3c24d6c891e3b0c4e7a7e326ca6ed`。
- [原构建与完整安装 39049461150](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/39049461150)：success，质量门、完整 Rust、MSI/NSIS、不可变收据及完整安装五门通过。
- [独立同包复核 39052642943](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/39052642943)：success；驱动 `4e6dee94337818a4e14ecdae68eff82c491310d7`，未重新打包。
- 安装 EXE SHA-256：`7c873747cbc14edbff20ceeb18d8a742675c7e3a9dc0a9ccf01242f77c35b500`；两轮绑定相同 EXE/安装器/产品来源。
- 完整原生 **1005 功能 + 1 性能 = 1006 通过、0 失败、5 既有 ignored**；性能独立项总计 8112ms，未修改预算。
- 本版 **12** + 历版 **122** = **134** 功能通过；另有 **22** 生命周期、**18** 工作区、**11** 路由、**7** 管理恢复、**4** 身份，以及同一 EXE 真正退出/重启通过。

原始报告/截图在 [候选完整证据](evidence/v1-1-11-candidate-lifecycle/)，严格导入清单与安装器收据在 [发布证据](evidence/v1.1.11-release/)。[原构建证据](evidence/v1111-installed-closure/build-39049461150/)与[完整收尾台账](V1_1_11_Installed_Release_Closure_2026-10-17.md)保留失败候选和纠偏，不将它们冒充成功。

## 原安装器摘要（仅发布这些字节）

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| LongEdit_1.1.11_x64_zh-CN.msi | 77058048 | `57050ce34f14e27cf5684d829b8f4c7c83e6896de0a9ea89fd7574035fda0cfb` |
| LongEdit_1.1.11_x64-setup.exe | 68009709 | `7bc394a20893176103956d2a8cd310ea4fb9fcc04f70896eafaab91230c2b644` |
| SHA256SUMS.txt | 192 | `040415f5cef369dabe3d23569fc28e12ae916b5350df10bb6f26bab2b545807f` |

## 用户场景与实际页面核对

原生图谱场景 **463 节点、371 关系**，180 份隔离生成 Markdown 的前后摘要全部一致；不是模拟接口。刷新后相机/选择/位置接续，真实暂移资料库产生的失败保留旧图并可重试；初次读取失败不伪装为空库。局部返回、思维导图、搜索定位、长中文标签、单击选择/双击打开与拖拽保留选择均通过，实际 Markdown 正文可见，不只核对路由或 tab。六次视角接续差异均小于 0.01，标签重叠检查通过，无全局页面异常。

已实看最终复核的主题定位、搜索、失败保留、局部图、思维导图、初次错误、正文打开与真正重启原图。浏览器正式组件的 12 个风格/深浅组合及三种窄/短窗另在[开发审计](V1_1_11_Graph_Development_2026-10-17.md)登记；不混为安装证明。性能数据有改善也有波动，不宣称所有密集场景都更快。

管理恢复实际核对两份集合逐字段一致；后续索引阶段为 517 源文件、520 对象、371 关系，缓存 3192960 字节，恢复前后一致（与前一图谱快照阶段区分）。真正重启保留 41 个场景文件、首尾阅读位置 340/457，实际原生版本 1.1.11。

## 发布与边界

[封板 main CI 39053737887](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/39053737887) success，对应证据提交 `1c56863621a510ed0357224d08d09c60c2da4352`。固定产品标签已推送；[发布与公开回下载 39054431188](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/39054431188) success，实际 Release ID **415962363**，非草稿、非预发布。三个附件大小、公开回下载 SHA-256 与 GitHub digest 均精确匹配上表；[原始 API/回下载/运行证据](evidence/v1.1.11-release/publication/)及[正式收据](evidence/v1.1.11-release/release-receipt.json)已严格导入。README 保留开头图标与介绍、全部旧版摘要行，当前下载与哈希更新，新增摘要仍在末尾；Release 正文逐字（仅规范换行）与仓库发布说明对齐。最终文档推送后的 main CI 在 [Quality Gate](https://github.com/Longyuyeee/Long_MarkDownReader/actions/workflows/quality-gate.yml) 按该提交核对，不为把自身 CI 编号写回而重复制造新提交。

`community-unsigned` / `NotSigned` 未知发布者、企业 `releaseCandidate=false`、应用内自动更新 `1.1.10-to-1.1.11-pending` 分别保持。手动下载安装、安装生命周期和应用内更新是不同证据，不能互相代签；社区可发布不代表企业签名验收或自动更新通过。本机未运行安装器/改注册表/接管日常桌面，用户两份排序文件未修改/提交。

封板文档质量门首次指出新版审计遗漏“手动下载安装”边界措辞；已补回完整边界说明，保留首次日志，不修改质量合同或产品断言。

发布后身份/阶段核对指出收口计划未用既定格式列全三个当前版本字段和发布阶段；已按真实公开/运行时 1.1.11、开发目标 1.1.12、已发布阶段补齐，两次原失败日志保留。README/Release/原始字节专项及完整当前开发审计均已通过，合同未改。

下一既定版本为 [1.1.12 本地备份深化](V1_1_12_Local_Backup_Preimplementation_Audit_2026-10-17.md)，尚未实现；后续路线已至 1.1.20，不重复新立项。
