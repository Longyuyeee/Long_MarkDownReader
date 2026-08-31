# M6-5B v1.0.18 托管安装生命周期关闭审计

审计日期：2026-08-31

结论：**M6-5 已通过并关闭；允许进入 M6-6，尚不允许发布。**

## 不可变身份与远端回执

- 产品候选：`5988c03c0167b00cb86ed9a5f3cfe85f0b280a6a`，版本 `1.0.18`。
- 升级基线：`v1.0.17` / `2b6235d420ceffd291dab72c4af17caffe464333`。
- 工作流提交：`6d208bcf7d0ba430b7df478718fe636fe91c6e34`。
- GitHub Actions：[运行 33378338422](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/33378338422)，结论 `success`。
- Artifact：ID `9754106849`，名称 `v118-candidate-lifecycle-33378338422`，ZIP 206,527,433 bytes，SHA-256 `357fc9987296ffabd438f9e9a2968130009e826757a316c1858292d116010b71`。

## 托管安装器

- MSI：`Long编辑_1.0.18_x64_zh-CN.msi`，73,863,168 bytes，SHA-256 `379dc0ca3fc7cf362af6d29818b95ad98f38d03ae5ce78bdb53ceace20cb2955`，ProductVersion 1.0.18，`NotSigned`。
- NSIS：`Long编辑_1.0.18_x64-setup.exe`，65,784,946 bytes，SHA-256 `477d1423909d660d5c60d238805b54248ac9f667b9f956036589ea55bf9e719d`，ProductVersion/FileVersion 1.0.18，`NotSigned`。
- 上一版 NSIS：`Long编辑_1.0.17_x64-setup.exe`，65,796,563 bytes，SHA-256 `372b41277b1384297ebe791e36e1d185bf920e660c9890f500fd2bbaa1e8ccdc`，版本 1.0.17，`NotSigned`。

## 实际验收结果

- R5I 安装/升级/降级/卸载/保留：22/22 通过。
- R5J 安装态文件与知识工作区：18/18 通过。
- 安装态真实路由：11/11 通过。
- R5L 管理备份、索引与回滚：7/7 通过。
- 失败数：0；`sourceUserContentIncluded=false`。
- 14 张关键截图逐张人工复核，未见裁切、崩溃、回退占位或旧版本文案。

## 预期与实际差异

预期托管安装包保持冻结源码、版本、签名边界和行为语义，不要求与本地 M6-4 非确定性构建逐字节相同。实际托管 MSI/NSIS 的大小和摘要均与本地观察值不同，但候选提交、1.0.18 身份、`NotSigned` 和全部行为门禁一致，因此差异被接受；M6-6 只晋级托管产物，不混用本地摘要。

下载 artifact 中的 29 个结构化回执与必要截图已导入 `docs/evidence/post-v117-m6-5-v1018-hosted-installer-lifecycle/`。原始下载字节树摘要为 `0225c919bf3c061af6b1da64ba336feb2583b0ae4bd78fc1c28e1c3a2513fb6d`；仓库内 JSON 规范化后的 29 文件、1,545,170 bytes 证据树摘要为 `1dbb47325812f166608921528bb88f08275decf980450a7d36e1dfc8d12b3013`。安装器与内嵌 ZIP 未提交仓库。

## 接续边界

唯一接续点为 **M6-6 v1.0.18 最终产物清单与发布就绪审计**：建立公开 `LongEdit_*` 名称、`SHA256SUMS.txt` 和最终 artifact manifest，并再次通过完整发布门。M6-6 全绿前 `releaseCandidate=false`，不得创建 `v1.0.18` Tag 或 GitHub Release。
