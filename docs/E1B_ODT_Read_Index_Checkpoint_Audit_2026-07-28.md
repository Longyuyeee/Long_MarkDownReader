# E1B ODT 只读预览与索引检查点审计

> 审计日期：2026-07-28
> 阶段状态：实现完成，生产者发布门禁未通过
> 产品状态：`.odt` 未进入共享格式注册表，用户侧能力未开放
> 下一入口：E1B 生产者门禁收口，不进入 E1C

## 1. 本批完成内容

1. 新增 `src-tauri/src/formats/odt.rs`，所有输入先经过 E1A `inspect_odf_package`。
2. 有界提取标题、段落、列表项、基础表格、内部图片引用和文档元数据。
3. 固定 64 MiB 文件、50,000 结构块、800 万字符、50,000 表格行、100,000 单元格、1,024 重复计数和 256 图片引用等语义预算。
4. 加密正文直接阻断；数字签名、脚本/宏、外链和嵌入对象只报告并忽略，不执行、不跟随。
5. 新增 WorkspaceGuard 只读命令、图片签名验证和 32 项/12 MiB 预览预算。
6. 完成 ODT Library 只读工作面、文内搜索、标题大纲、风险提示、实时搜索、持久索引和 `odt-block` 定位代码。
7. 新增 `shared/odt-read-contract.json` 与 `check:odt-read-contract`，把实现状态和发布门禁分开锁定。
8. LibreOffice Writer 26.2.4.2 已生成真实 ODT，完成 MIME、隐私、同生产者重开和 Rust 真实 fixture 解析。

## 2. 生产者门禁审计

| 生产者 | 结果 | 证据与结论 |
|---|---|---|
| LibreOffice Writer 26.2.4.2 | 通过 | `writer8` 原生 ODT；第二隔离 profile 可重开并转文本；SHA-256 清单和真实 fixture 已提交 |
| Microsoft Word 2021 | 阻断 | 普通自动化启动和独立 `/safe` 实例均可进入对象模型，但 `SaveAs2(..., 23)` 对已有文档和纯文本新文档都持续等待，未产生文件 |
| WPS Writer 12.1.0.26895 | 阻断 | `SaveAs2(..., 23)` 生成 OLE 复合文档头 `D0 CF 11 E0`，不是 ODT ZIP，已拒绝并删除；本机缺少 WPS ODF add-in |

WPS 官方文档说明，打开和保存 ODF 需要安装 ODF add-in：
<https://help.wps.com/articles/odf-ods-odp-document-in-wps-office>

## 3. 为什么没有开放 `.odt`

最初 E1B 设计要求 LibreOffice、WPS Writer、Microsoft Word 三生产者真实 fixture 全部通过后，才能把 `.odt` 登记为只读支持。本批没有降低门槛：

- 解析器、命令、UI 和索引代码已经完成，但共享注册表仍不包含 `.odt`。
- `shared/odt-read-contract.json` 固定 `implementationComplete=true`、`releaseGatePassed=false`。
- E1A 的“产品能力未开放”门禁继续通过。
- 不存在 ODT 编辑、创建、另存或写回适配器。

## 4. 已验证结果

```text
npm run build
npm run check:format-contract
npm run check:odf-package-contract
npm run check:odt-read-contract
cargo test --manifest-path src-tauri/Cargo.toml formats::odt --lib
```

专项 Rust 测试 `3/3`：合成语义覆盖、外链/重复攻击边界、LibreOffice 真实生产者 fixture。

完整 `ci:check` 已通过：

- Rust 功能测试：`366/366`
- Rust 性能测试：`1/1`
- 100 MiB PDF 范围基准：`115 ms`，单次请求约 `255.9 KiB`
- 生产依赖审计：`0` 漏洞

本检查点没有伪造 ODT 桌面截图：由于发布门禁未通过，`.odt` 尚未注册为产品能力。真实桌面打开、搜索和定位证据属于门禁关闭后的验收项。

实现提交 `afb26ec` 的 GitHub Quality Gate 已通过：
<https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/30342388476>

## 5. 下一步

1. 修复或重新安装 Microsoft Word 的 OpenDocument Text 导出过滤器，生成并同生产者重开真实 Word ODT。
2. 为 WPS Writer 安装与当前版本匹配的 ODF add-in，再次验证格式 23 输出必须为 `PK` ZIP 且 MIME 首项正确。
3. 三生产者矩阵全部 `verified` 后，把 E1B 契约改为完成，并登记 `.odt` 为 `preview-only`。
4. 执行真实桌面打开、搜索、定位、明暗主题和紧凑窗口证据。
5. 只有上述门禁全部通过，才进入 E1C ODS/ODP 只读预览与索引。
