# v1.0.20 无签名社区版发布审计

日期：2026-09-01

当前状态：**候选准备中，尚未发布。**

- 发布通道：`community-unsigned`。
- 当前边界：`releaseCandidate=false`；企业 Authenticode 候选继续独立，不由本社区版本冒充。
- 当前公开稳定版：v1.0.19；v1.0.20 Tag、Release、MSI/NSIS 和公开哈希尚不存在。
- 用户获取方式：完成全部门禁后，从 GitHub Release **手动下载安装**；无签名包可能显示未知发布者或 SmartScreen 提示。

## 本补丁范围

v1.0.20 只收口用户真实资料库暴露的知识图谱可用性问题：大量孤立节点远景、稳定拖拽/缩放、单击选择与双击打开分离、连接图视口裁剪、标签与节点视觉、状态环降噪、默认零选择和紧凑图谱工具入口。它不扩大图谱语义，不改变源文件写回边界。

## 晋级条件

必须依次通过完整 `ci:patch-release`、真实 Tauri 图谱证据、固定提交的 Windows MSI/NSIS 构建、安装生命周期、安装态路由、回滚管理、制品哈希冻结、README/Release Notes、annotated Tag、GitHub Release 和三个公开附件回下载复核。当前任一结果不得继承 v1.0.19 作为 v1.0.20 证据。
