# D2 跨格式安全降级审计

日期：2026-07-31
版本：`v0.7.0`
阶段：D2

## 结论

D2 已完成。39 类注册格式全部且仅一次归入 6 条安全通道，现有能力边界没有扩大：

1. 26 类源码和轻量格式：带签名冲突保护的原文件保存；
2. LOG、ODS、ODP：严格只读预览；
3. PDF：批注/OCR sidecar，页面操作只生成新副本；
4. DOCX、PPTX：仅可靠另存新副本；
5. DOC/XLS/PPT 与 WPS/ET/DPS：外部应用交接或显式新目标转换；
6. XLSX：仅开放已验证子集的有界写回。

新增共享契约 `shared/safe-degradation-contract.json`，并以
`check:d2-safe-degradation-contract` 同时核对格式注册表、发布能力矩阵、writer
边界及真实实现证据。契约已接入总格式门禁。

## 已验证边界

- 允许覆盖的格式必须保留 `expectedSignature`/签名冲突保护；外部修改时拒绝写入，前端保留未保存草稿。
- `none` 与 `sidecar` 格式不得注册源文件 writer。
- ODS/ODP 预览前后复核源字节；LOG 不提供保存能力。
- PDF 批注和 OCR 只写 sidecar；页面提取、插入、合并和重排只写不存在的新目标，并复核源文件不变。
- DOCX/PPTX 拒绝源覆盖、已有目标、过期签名和未经复读验证的输出；失败副本会被清理。
- 旧 Office 转换只接受不存在的新目标；WPS 原生格式仅交给用户确认的兼容应用。
- XLSX 继续执行签名冲突和高级对象阻断，不因本阶段扩大等价编辑承诺。

## 阶段判断

本机可完成的 C 阶段知识图谱产品化、D1 统一体验和 D2 安全降级回归已经收口。
产品能力可以进入冻结与真实样本回归阶段，但仍不能标记为 RC：

- 正式代码签名证书与 Windows 10/11 已签名安装生命周期证据缺失；
- WPS ODF/ODT 与 XLSX 数组公式的剩余外部生产者证据仍需在对应环境补齐；
- “完整 Office/WPS 等价编辑”仍属于独立高级项目，不是当前基础版收尾条件。

## 后续入口

1. D3 最终产品验收：按核心用户流程执行真实文件回归、性能与失败恢复抽查，冻结本阶段能力矩阵。
2. 外部环境到位后补齐 R5N 已签名 Windows 10/11 生命周期证据，并保持 fail-closed。
3. 按可用生产者补齐 WPS ODF/ODT 和 XLSX 数组公式矩阵，不使用合成证据替代真实结果。
4. 当前阶段冻结后，再单独评估完整 Excel、复杂 Office/ODF 和 WPS 原生等价编辑的范围与成本。

## 验证命令

```powershell
npm run check:d2-safe-degradation-contract
npm run check:format-contract
npm run build
```
