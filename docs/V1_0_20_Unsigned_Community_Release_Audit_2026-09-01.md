# v1.0.20 无签名社区版发布审计

日期：2026-09-01

当前状态：**已正式发布，远端附件复核通过；官方应用内更新观察待 M8-9 执行。**

- 发布通道：`community-unsigned`。
- 当前边界：社区版双包均为 `NotSigned`；企业 Authenticode 候选继续独立，不由本社区版本冒充。
- 当前公开稳定版：[v1.0.20](https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.20)，Tag 精确解析到 `a08ab6a5471f9f8b163403edadb554ea6446c3f4`。
- 用户获取方式：从官方 GitHub Release **手动下载安装**；无签名包可能显示未知发布者或 SmartScreen 提示，请核对 `SHA256SUMS.txt`。

## 本补丁范围

v1.0.20 只收口用户真实资料库暴露的知识图谱可用性问题：大量孤立节点远景、稳定拖拽/缩放、单击选择与双击打开分离、连接图视口裁剪、标签与节点视觉、状态环降噪、默认零选择和紧凑图谱工具入口。它不扩大图谱语义，不改变源文件写回边界。

## 晋级条件

上述条件均已完成：本机与托管完整 `ci:patch-release` 通过；真实 Tauri 图谱证据通过；[运行 33461982887](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/33461982887) 从固定提交构建 Windows MSI/NSIS，并通过 22/22 生命周期、18/18 安装态、11/11 路由和 7/7 回滚管理，失败 0。annotated Tag、GitHub Release 和三个公开附件回下载复核均完成。两次托管失败分别暴露浅检出缺少历史 Tag 和历史证据 CRLF 字节未固化，均在不放宽检查的前提下修正后从完整门禁重跑。
