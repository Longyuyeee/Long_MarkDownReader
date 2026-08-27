# M1C-A ODF 编辑可行性审计

日期：2026-08-27
状态：通过；下一阶段 M1C-B ODS 有界单元格值可靠副本
版本边界：保持 `1.0.15`，`releaseCandidate=false`

## 1. 阶段目标

本阶段不开放 ODS/ODP 保存入口，只回答三个问题：ODF 包成员能否在隔离副本中逐字节保持，哪些风险必须阻断，以及 ODS/ODP 哪一个具备首批最小编辑子集的真实生产者基础。

## 2. 预期与实际差异

| 项目 | 原预期 | 真实结果 | 修正 |
| --- | --- | --- | --- |
| ODS 公式样本 | 原样本包含有效 `SUM` | 旧种子被 LibreOffice 保存为 `of:=of:=SUM(...)`，缓存为 `错误:510` | 种子改为未加前缀的表达式；真实输出为 `of:=SUM([.A2];8)`，缓存值 `50` |
| 脚本风险 | `<office:scripts/>` 表示宏风险 | LibreOffice 正常文件固定包含空容器，导致误报 | 仅实际 `script`、`event-listener` 元素及 Scripts/Basic 成员触发阻断；空容器新增回归测试 |
| ODP 备注 | FODP 种子备注可作为编辑基线 | LibreOffice 生成的 ODP 没有保留 `Presenter note for E1C` | ODP 正文/备注编辑继续只读，直到真实生产者保真门禁通过 |
| WPS 兼容 | 可作为补充复开观察 | `KET.Application` 打开合法 ODS 60 秒不返回 | 记录为本机阻断，不计生产者通过，不替代 LibreOffice |

## 3. 已完成实现

- 新增 `odf_edit` 内存隔离基线：原始 ODF 的所有 ZIP 成员使用 raw copy 重建，解压后逐成员校验大小与 SHA-256。
- `content.xml` 是唯一候选部件；`styles.xml`、媒体、manifest、meta、settings、缩略图和其他未知成员全部计入受保护部件。
- 加密、数字签名、实际脚本/宏、外部链接和嵌入对象任一存在时，编辑候选状态直接阻断。
- 隔离副本必须重新通过 ODF mimetype、manifest、ZIP 路径、XML 和资源预算验证。
- 当前模块只执行 `memory-only`，`writesUserFile=false`，没有命令注册、保存按钮或格式能力升级。

## 4. 真实测试结果

| 格式 | fixture | ZIP 成员 | 源摘要不变 | LibreOffice 26.2.4.2 独立复开 |
| --- | ---: | ---: | --- | ---: |
| ODS | 8,411 B | 9 | 是 | PDF 21,586 B |
| ODP | 15,864 B | 8 | 是 | PDF 19,403 B |

Rust ODF 定向测试 `14/14` 通过：真实 ODS/ODP 隔离复制、结构复验、公式/备注解析、空脚本容器回归、真实脚本风险、加密/签名/外链/嵌入对象、ZIP 与 XML 安全限制均保持。

机器证据位于 `docs/evidence/post-v115-m1ca-odf-feasibility/audit.json`。证据只包含项目自有 fixture 的大小、摘要、结构指标和生产者观察，不包含用户文档正文、原始生产者输出或本机完整路径。

## 5. 需求对齐与决定

- 对齐“所有格式必须显式保存”：本阶段没有任何用户文件写入。
- 对齐“未知对象不能静默丢失”：高风险对象先阻断，非候选 ZIP 成员逐字节保护。
- 对齐“真实测试要记录预期与实际差异”：公式错误、脚本误报、ODP 备注丢失和 WPS 超时均已记录并据此改变路线。
- 对齐“不能提前宣称完整编辑”：格式注册仍为 ODS/ODP `preview-only / saveMode:none`。

下一阶段固定为 **M1C-B ODS 有界单元格值可靠副本**：只处理简单、未重复、无合并且无风险对象的基础单元格值；先保存新副本并由 LibreOffice Calc 独立复开。公式和样式在各自真实往返通过前不开放，ODP 继续只读。
