# C0-2B/C DOCX 生产者矩阵接入门禁审计

> 审计日期：2026-07-27
>
> 阶段范围：WPS Writer 与 LibreOffice Writer 真实生产者证据接入框架
>
> 结论：接入门禁、C0-2B 与 C0-2C 均已完成；真实生产者矩阵为 3/3

## 1. 本批目标

此前 C0-2A 的 Microsoft Word fixture、清单和 CI 校验分散在 Word 专用路径中，WPS 与 LibreOffice 只有文档说明。此次建立三生产者统一事实源和独立 CI 门禁，使后续真实环境证据必须通过同一套来源、隐私、哈希和重开约束。

本批不生成合成 WPS/LibreOffice 文件，不下载或伪装办公软件，不把 `pending` 改为 `verified`。

## 2. 矩阵事实源

新增：

- `fixtures/docx/producers/matrix.json`

矩阵固定要求：

| ID | 生产者 | 当前状态 |
| --- | --- | --- |
| `microsoft-word-16` | Microsoft Word | `verified` |
| `wps-writer` | WPS Writer | `verified` |
| `libreoffice-writer` | LibreOffice Writer | `verified` |

`pending` 条目必须声明真实环境依赖，且不能携带未验证的同名清单或 fixture。`verified` 条目必须同时具备清单和 DOCX。

## 3. 独立 CI 门禁

新增：

- `scripts/check-docx-producer-matrix.mjs`
- `npm run check:docx-producer-matrix`

门禁对每个 `verified` 条目检查：

- 清单 schema、ID、生产者和文件名；
- 产品版本、文件版本、生成时间和生成器；
- 隐私匿名化说明与可再分发说明；
- 原生产者重开必须为 `true`；
- 实际 DOCX SHA-256 必须与清单一致；
- 基础结构期望必须完整；
- fixture 不得为空壳。

门禁对每个 `pending` 条目检查：

- 真实环境依赖说明存在；
- 未出现未验证的清单或 DOCX；
- 不能通过删除矩阵条目缩小三生产者范围。

该检查已接入 `npm run ci:check`。

## 4. 运行时与 Rust 对齐

C2E0 `audit_docx_save_readiness` 不再硬编码生产者状态，而是读取矩阵事实源生成：

- `producerEvidence`
- `missingProducerEvidence`
- `producer_evidence_missing:*` blockers

Rust 回归固定验证 Word/WPS/LibreOffice 均为 `verified`，并分别解析三份版本化 fixture。

## 5. 当前判定

当前矩阵门禁输出：

`DOCX producer matrix gate passed: 3/3 verified; pending: none`

Microsoft Word、WPS Writer `12.1.0.26895` 与 LibreOffice Writer `26.2.4.2` 均已完成真实生成、隐私处理、原程序重开、哈希清单与 Rust 解析回归。WPS 证据详见 `docs/C0_2B_WPS_Writer_Producer_Fixture_Audit_2026-07-27.md`，LibreOffice 证据详见 `docs/C0_2C_LibreOffice_Writer_Producer_Fixture_Audit_2026-07-27.md`。

C0-2 已收口，但 C2E 可靠另存和用户可见 DOCX 保存仍需独立完成无覆盖写入、写后复读、三生产者重开和真实桌面验收。

## 6. 最终仓库门禁

- DOCX 相关定向回归 `12/12` 通过；
- DOCX 生产者矩阵门禁通过并报告 `3/3 verified`；
- Rust 功能测试 `312/312` 通过，性能测试 `1/1` 通过；
- 前端生产构建、Vue 类型检查和全部契约检查通过；
- 真实 Tauri 桌面证据检查 `35/35` 通过，27 张截图证据完整；
- 生产依赖审计为 0 个漏洞；
- Tauri Debug 无打包构建成功生成桌面应用。

构建只保留既有的大分包体积警告，不影响本批验收。
