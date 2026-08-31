# M5-0 v1.0.17 范围选择审计

日期：2026-08-31

状态：**范围选择通过；产品能力与二进制版本未改变**

## 开发目标

v1.0.16 的发布和官方更新链已经完整收口。M5-0 不直接实现新功能，而是从真实代码、延期能力和现有测试基础中，只选择一个与已验证工作流相邻、可用真实生产者测试闭环的最小切片。运行时和公开版本继续保持 `1.0.16`，开发目标保持 `1.0.17`，`releaseCandidate=false`。

## 真实代码盘点

### ODP 有界幻灯片正文

- `odf.rs` 已有 64 MiB 文件、ZIP/XML、MIME、路径、压缩比、DOCTYPE、脚本、外链、嵌入对象和签名风险门禁。
- `odf_content.rs` 已有最多 2,000 张幻灯片的正文、备注、图片数解析，以及 `odp-slide` / `odp-notes` 精确定位。
- `OdfContentReaderView.vue` 已提供幻灯片列表、正文/备注只读显示、搜索、定位和视图恢复。
- `odf_edit.rs` 的真实包隔离测试已把 ODP 标记为 `bounded-slide-text-candidate`，但生产代码只有 ODS 单元格 inventory/patch；格式注册表中 ODP 仍是 `preview-only / writer=null / saveMode=none`。

### 其他候选

- YAML、XML、TOML 三个生产视图中 Schema 集成 token 均为 0；要实现高级 Schema 模式，仍需 provider 信任、文件映射、引用解析、诊断定位、离线与隐私边界。
- 图谱已有稳定社区与相机基础，但当前 `GraphView.vue` 的 fullscreen、`requestFullscreen` 和 cluster-collapse token 均为 0；代理节点身份、选择/历史恢复、相机持久化和响应式退出均未建立。

因此二者都不是比 ODP 正文更小、更相邻的下一切片。

## 真实测试：预期与实际

在临时目录重跑：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-post-v115-m1ca-odf-feasibility-audit.ps1 -EvidenceOutput <temporary-path>
```

| 项目 | 预期 | 当前实际 | 修正 |
| --- | --- | --- | --- |
| ODF 安全基础 | ODS/ODP 包可隔离且源文件不变 | Rust 20 通过、0 失败、1 个显式 artifact 测试忽略；真实 ODP 摘要不变 | 可复用安全包基础 |
| ODP 独立打开 | LibreOffice 能打开真实 ODP | LibreOffice 26.2.4.2 独立导出 19,403 bytes PDF | 正文候选继续评估 |
| 正文与备注 | 已解析的正文和备注可一起进入编辑候选 | 正文可解析、2 张幻灯片可定位；作者备注经 LibreOffice 往返后仍未保留 | M5-1 只审计正文，备注继续只读 |
| 实现邻近度 | ODF 隔离层已足够直接开放编辑 | 缺少 ODP 对象 inventory、旧目标摘要、patch、writer、保存回执和 UI | 先做生产者保真与对象选择，不写产品功能 |

测试使用项目自有 ODP fixture，15,864 bytes，SHA-256 `8ef886d0370d18a497ceb7811ed845a1f4d73064ae4a20cf37e0e1eb22554f52`；不包含用户文件或绝对路径。

## 选择结论与需求边界

唯一接续点为 **M5-1 ODP 幻灯片正文生产者保真与对象选择审计**。

M5-1 只允许：

1. 用项目自有内容建立 LibreOffice 与 Microsoft PowerPoint ODP 输出；可用的其他生产者只作为附加证据，不可用或超时必须明确记录。
2. 盘点可稳定识别的简单幻灯片正文对象、对象身份、XML 范围、样式/列表/字段/形状复杂度和生产者差异。
3. 独立复开并核对正文语义与源摘要，形成允许编辑、只读保持、整包阻断三类候选。
4. 保持备注、母版、动画、媒体、图表、嵌入对象、复杂形状以及源覆盖关闭。

M5-1 不修改产品 UI、不增加 ODP writer、不提升注册表能力，也不提升 package、Cargo 或 Tauri 版本。只有生产者保真和对象选择退出审计通过后，才能决定是否进入 M5-2 有界正文可靠副本实现；若真实生产者结果不一致，则 ODP 继续只读并返回候选选择。

## 开发目标审计

- 目标是选择一个最小 v1.0.17 切片：已完成，只选择 ODP 正文生产者保真。
- 需求是基于真实代码而不是文档愿望：已完成，注册表、前端、Rust parser/edit 层均已复核。
- 需求是真实测试并记录预期/实际差异：已完成，Rust 与 LibreOffice 基线已重跑，备注丢失继续作为阻断事实。
- 需求是不提前宣传或提升版本：已满足，ODP 仍为只读，运行时/公开版本仍为 1.0.16。

M5-0 可以收口并推送；下一步只执行 M5-1。
