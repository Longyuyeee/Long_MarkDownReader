# E1A OpenDocument 包验证器阶段审计

> 审计日期：2026-07-28
> 产品基线：LongEdit `v0.7.0`
> 代码基线：`cd5c61d docs: complete office format compatibility audit` + 本批 E1A
> 阶段状态：E1A 已完成；下一开发入口为 E1B ODT 只读预览与索引

## 1. 交付结论

E1A 已为 `.odt/.ods/.odp` 建立共用的可信 ODF 包边界，但没有把三种格式提前登记为产品支持。核心入口为 `formats::odf::inspect_odf_package`，输入仅为源字节和预期扩展名，输出为可序列化包统计及结构化风险报告。

本批完成：

1. 扩展名、ZIP magic、首项 `mimetype`、无压缩/无额外字段、根媒体类型与 manifest 一致性校验。
2. 文件大小、条目数、累计解压量、单 XML、累计 XML、压缩比、XML 深度与事件数八项资源预算。
3. UTF-8 路径、路径穿越、绝对路径、反斜杠、驱动器前缀、重复/大小写冲突条目和重复 manifest 项拒绝。
4. 所有未加密 XML 的有界良构检查；DOCTYPE、自定义实体、异常深度和异常事件数稳定拒绝。
5. 加密、数字签名、脚本/宏、外部链接和嵌入对象五类风险代码，只报告，不执行、不跟随。
6. ODT/ODS/ODP 最小安全包、格式伪装、损坏 manifest、路径攻击、XML 攻击、资源超限和复合风险的内存 fixture 回归。
7. `shared/odf-package-contract.json` 与 `check:odf-package-contract` 固定实现限制、风险代码和未开放产品能力。

## 2. 安全合同

| 维度 | E1A 限制 | 失败策略 |
|---|---:|---|
| 输入文件 | 64 MiB | 拒绝 |
| ZIP 条目 | 4,096 | 拒绝 |
| 累计解压 | 256 MiB | 拒绝 |
| 单 XML | 16 MiB | 拒绝 |
| 累计 XML | 64 MiB | 拒绝 |
| 单条目压缩比 | 200:1（超过 1 MiB 时） | 拒绝 |
| XML 深度 | 256 | 拒绝 |
| XML 事件 | 1,000,000/部件 | 拒绝 |

ODF 首条目必须是 Stored 模式且无 ZIP extra field 的 `mimetype`；其内容、调用方预期扩展名和 manifest `/` 根 `media-type` 必须三者一致。包必须包含并登记 `content.xml`。

验证器不读取文件路径、不写磁盘、不启动外部程序。测试显式比较调用前后的源字节，确保检查过程没有修改输入。

## 3. 风险报告

风险报告仅暴露计数和稳定代码，不回传外部目标或嵌入内容：

| 风险代码 | 检测依据 | E1A 行为 |
|---|---|---|
| `encrypted-content` | manifest `encryption-data` | 标记并跳过密文 XML 解析 |
| `digital-signature` | `META-INF` 签名部件 | 标记，不验证或信任签名 |
| `script-or-macro` | Scripts/Basic/脚本条目或脚本元素 | 标记，永不执行 |
| `external-link` | `href` 的网络、文件、data 或父级目标 | 计数，不跟随、不回传目标 |
| `embedded-object` | Object/Objects 存储或 OLE/object 媒体类型 | 标记，不加载对象 |

出现风险不等于包容器损坏，因此 E1A 返回报告；E1B 的阅读层必须根据风险决定阻断或降级。容器结构、资源预算或 XML 安全不满足时则直接返回错误。

## 4. 测试与门禁

专项 Rust 测试 `9/9`：

- 三种最小合法包与源字节不变。
- 非 ZIP、未知扩展名和 MIME 伪装。
- `mimetype` 非首项或被压缩。
- manifest 缺失、根 MIME 不一致和重复项。
- 路径穿越、重复及大小写冲突路径。
- DOCTYPE、自定义实体和 XML 深度攻击。
- 加密、签名、脚本、外链和嵌入对象复合风险。
- 文件/条目/解压/XML/压缩比/事件预算。
- camelCase 序列化合同。

机器门禁：

```powershell
npm run check:odf-package-contract
cargo test --locked --manifest-path src-tauri/Cargo.toml formats::odf::tests
```

`check:odf-package-contract` 同时确认 `.odt/.ods/.odp` 没有进入 `shared/file-formats.json`，且命令、UI、索引和写回仍为关闭状态。

完整 `npm run ci:check` 通过 Rust 功能测试 `363/363`、性能测试 `1/1`、全部共享契约、前端生产构建、100 MiB PDF 范围基准和生产依赖审计 `0` 漏洞。

## 5. 范围边界

E1A 不包含：

- 文件系统/Tauri 读取命令。
- ODT 正文、样式、列表、表格或图片语义模型。
- ODS 工作表或 ODP 幻灯片解析。
- Library 路由、工作面、最近记录或全文索引。
- 创建、编辑、保存、转换或外部打开。
- LibreOffice/WPS 真实生产者 fixture；它们按 E1B/E1C 计划进入。

因此当前仍不能宣传“支持 OpenDocument”。E1A 只证明不可信 ODF 包可以先经过一致、可审计的容器预检。

## 6. 下一步

E1B 是唯一下一开发入口：

1. 在 WorkspaceGuard 与 64 MiB 文件限制下读取 `.odt`，先调用 E1A 验证器。
2. 建立标题、段落、列表、基础表格和内部图片的有界只读语义模型。
3. 对加密/脚本/嵌入对象稳定阻断或降级，外链永不跟随。
4. 接入原 Library 右侧阅读工作面、文内搜索、全文索引、定位和最近记录。
5. 引入 LibreOffice、WPS Writer 和 Microsoft Word 可复开的真实 ODT 生产者 fixture。
6. 全部链路通过前，`.odt` 不得升级为 `supported`；写回继续不属于 E1B。
