# v1.1.21 跨库复制：安装验证完成，待正式发布

当前开发目标：`1.1.21`；当前运行时版本：`1.1.21`；当前公开版本：`1.1.20`。当前阶段：**v1.1.21 跨库复制候选**。社区渠道 community-unsigned 已达到发布条件；企业 RC 的 `releaseCandidate=false` 保留。

固定产品为 `ab85459975e304a4f5d6cc777bcc80185fd5a4b2`。原构建 [39215635202](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/39215635202) 的完整质量、1073 项原生功能（5 项既有忽略）、1 项性能、MSI/NSIS 构建与固定回执通过。首次安装检查受真实 GitHub 403 共享 IP 限流阻断；检查脚本的后续准备失败也完整保留，见 [开发记录](V1_1_21_Cross_Library_Copy_Development_2026-10-19.md)。没有把失败运行整体登记为通过，也没有重建或更换安装器。

原字节安装器在两个独立 Windows 临时环境 [39227582947](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/39227582947)、[39227582961](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/39227582961) 均完整通过，包含本版 10 项、历版 254 项、NSIS 生命周期 22 项、工作区 18 项与 11 路由、管理恢复 7 项及版本身份 4 项。正式接受第一轮的完整证据，另一轮独立结果另存 API 与日志，不混合不同运行来补齐通过项。

本版实际验证包括只读预览、目录自动创建与重名避让、实时草稿和前序草稿模型保留、图片与循环笔记链接、空目录与内部元数据排除、源变化后的部分失败、仅重试未完成项、警示取消与明确选择，以及重复查询同一计划不新增副本。导出的原始 MD/PNG/TXT 通过独立摘要、BOM/CRLF、相对引用和循环链接核对。完整安装器清单见 [artifact-manifest](evidence/v1.1.21-release/artifact-manifest.json)。MSI 完成构建与摘要核对，不宣称单独完成 MSI 全生命周期。

下一步仅发布上述原字节安装器、验证公开附件并同步 README。公开下载仍为 1.1.20；20→21 应用内更新观察独立 pending。安装任务不直接操作用户日常软件或资料。
