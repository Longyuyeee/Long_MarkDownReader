# Long编辑 v1.0.16

v1.0.16 聚焦专业格式工作流、行动工作台、知识图谱 2.0 与跨格式可靠输出。Quality Gate、安装包、Windows 生命周期、最终 artifact manifest、GitHub Release 和三个远端附件回下载复核均已通过。

本版本安装包由产品提交 `757d54309ddb35f445344d909fa4c7ba2567bc58` 构建；发布前最终产物与就绪审计提交为 `a6d6cbc088c43adc940858c8775f55d33af1ee2d`。`v1.0.16` Tag 绑定前者，后者仅记录安装包本体复核、公开名称、校验和与发布边界，不改变二进制内容。

## 主要变化

- XLSX、PPTX、DOCX 与 ODS 增加有界对象编辑、草稿、撤销重做、显式保存或可靠副本能力，并保留生产者兼容和源文件安全边界。
- 大 JSON 使用渐进只读、分段导航和流式搜索；资料库视频增加逐帧、PNG 截图、播放位置记忆与同名 VTT/SRT 字幕。
- 工作台围绕继续工作、今天要做和需要处理收敛，支持 Markdown 待办与内部 Table 布尔任务行的确认写回、恢复和精确定位。
- 知识图谱增加稳定语义、邻居/路径/社区/比较探索、专业视觉层级、相机导航、语义缩略图和 5,000 节点 Worker 有界布局。
- 搜索、图谱和关系上下文共享对象定位；四条受控转换与投影工作流均披露目标、编号策略、损失边界并保护来源。

## 发布验证

- M0～M4E 的真实文件、真实 Tauri 桌面、来源摘要、独立复开和结构化性能证据已经收口。
- v1.0.16 的完整补丁 Quality Gate、当前候选运行烟测、无签名 MSI/NSIS、托管 Windows 生命周期、最终 artifact manifest 和 `SHA256SUMS.txt` 已经通过；`v1.0.16` Tag、GitHub Release 与三个远端附件回下载复核也已完成。
- 最终附件必须记录真实大小、SHA-256 与 `NotSigned`，不得复用 v1.0.15 的候选或发布回执。

## 安装与更新

- v1.0.15 → v1.0.16 的正式发布后应用内更新已在一次性 Windows 上通过 12/12 生命周期检查：用户确认后下载并校验官方 NSIS，同目录覆盖、自动重启、最新版状态和资料保留均符合预期。
- 社区安装包不含 Authenticode 商业签名，Windows 可能显示“未知发布者”或 SmartScreen。
- 只从官方 GitHub Release 下载，并核对同页 `SHA256SUMS.txt`。

## 能力边界

- 不宣称完整 Excel、Word、PowerPoint、OpenDocument 或 PDF 等价编辑。
- ODS 公式、自定义样式和 ODP 编辑保持关闭；外部 Office/ODF 生产者证据不足的能力继续 fail closed。
- 大 JSON 渐进模式只读；视频与部分媒体格式依赖 WebView 和系统解码器。
- YAML/XML/TOML 高级 Schema 模式、图谱聚类折叠、全屏和治理环等延期项未混入本版本。
