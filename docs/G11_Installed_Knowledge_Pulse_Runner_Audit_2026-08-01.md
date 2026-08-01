# G11 已安装知识网络脉搏验收器审计（2026-08-01）

## 结论

G11 的已安装产物验收器已经接入一次性 Windows 生命周期。固定合成资料库新增两篇互有关联的 Markdown 笔记和一个带 `supports` 关系的 Canvas；已安装应用必须在首页显示非空知识网络脉搏，并从热点主题准确跳转到同一对象居中的知识图谱。

当前仅完成验收器集成，尚未针对本提交完成 GitHub 托管执行。因此状态为 `installed-knowledge-pulse-runner-integrated-hosted-execution-next`，`releaseCandidate=false`。

## 新增门禁

- 首页至少显示 5 个知识对象、3 条关系，覆盖率至少 60%，且已连接对象多于孤立对象。
- 关系类型必须包含 `depends-on` 与 `supports`。
- 热点列表必须非空；点击首个热点后，图谱详情中的对象 ID 和标题必须与热点一致，路由必须携带 `root`。
- 输出首页脉搏截图、居中图谱截图和脱敏 JSON；固定声明 `sourceUserContentIncluded=false`。
- Workspace 与 Graph 仅新增稳定的 `data-testid`/对象 ID 属性，不改变用户交互和视觉层级。

## 证据边界与下一步

本阶段 fixture 是合成管理资料，不是用户正文。下一步用当前提交触发 U2 GitHub 托管工作流，下载并核验 `installed-knowledge-network-evidence.json` 与两张截图，再更新机器事实源为已执行状态并独立推送。Windows Server 托管结果仍不能替代签名 Windows 10/11 客户端发布门禁。
