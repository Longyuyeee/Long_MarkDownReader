# C5B PPTX 基础形状生命周期审计

> 审计日期：2026-07-28
> 阶段：C5B
> 结论：已完成
> 开发分支：`main`

## 1. 交付结论

C5B 已完成 PPTX 白名单基础形状的安全新增和删除闭环：

- 新增矩形、椭圆和线条，支持目标幻灯片、边界几何、填充色、描边色和线宽；
- 删除只开放后端枚举出的安全目标；
- 预览、可靠新副本、LongEdit 应用内重开和 PowerPoint/WPS/LibreOffice 外部重开全部通过；
- 源文件不覆盖，未修改 OOXML 部件逐字节保留。

这仍是受限基础编辑，不等价于完整 PowerPoint 形状编辑器。组合对象、文本框、占位符、连接器、关系对象、旋转/翻转对象和复杂自由形状继续只读。

## 2. 安全边界

删除目标必须同时满足：

1. 位于幻灯片根级 `p:spTree`；
2. 形状类型为 `rect`、`ellipse` 或 `line`；
3. 无文本体、占位符、关系属性、连接起止点和分组上下文；
4. 无旋转、翻转和复杂几何；
5. 具有有效且位于幻灯片范围内的几何；
6. 对象 ID、对象摘要、目标部件摘要和源文件签名均与预览时一致。

新增操作使用新的 `cNvPr` 对象 ID，只修改目标 `ppt/slides/slideN.xml`。补丁后执行 XML 结构复读、PPTX 语义复读、差异白名单和未修改部件校验。

## 3. 产品工作面

PPTX Library 右侧工作区新增 `C5B 基础形状` 面板：

- `新增/删除` 分段模式；
- 矩形、椭圆、线条白名单；
- 厘米制 X/Y/宽/高和颜色、线宽控件；
- 删除列表只显示安全候选；
- 复用 C4D 可靠另存副本，不开放源文件覆盖。

桌面审计覆盖 `1280x820` 和 `960x720`，共通过 10 项检查、生成 4 份输出、保留 3 张截图。保存后的矩形副本已在紧凑工作区真实重开并重新渲染。

证据：

- `docs/evidence/c5b-pptx-shape-lifecycle/audit-manifest.json`
- `docs/evidence/c5b-pptx-shape-lifecycle/c5b-rectangle-preview-1280.jpg`
- `docs/evidence/c5b-pptx-shape-lifecycle/c5b-rectangle-reopen-960.jpg`
- `docs/evidence/c5b-pptx-shape-lifecycle/c5b-delete-preview-1280.jpg`

## 4. 生产者复开

四份固定输出：

| 操作 | 输出 |
|---|---|
| 矩形新增 | `fixtures/pptx/output-reopen/c5b-rectangle-copy.pptx` |
| 椭圆新增 | `fixtures/pptx/output-reopen/c5b-ellipse-copy.pptx` |
| 线条新增 | `fixtures/pptx/output-reopen/c5b-line-copy.pptx` |
| 安全删除 | `fixtures/pptx/output-reopen/c5b-delete-copy.pptx` |

外部矩阵结果为 `3/3 verified`：

| 生产者 | 版本 | 结果 |
|---|---|---|
| Microsoft PowerPoint | `16.0` | 四份输出只读打开；3 张幻灯片；形状名称、类型和几何正确；删除输出无 LongEdit 形状 |
| WPS Presentation | `12.1.0.26895` | 与 PowerPoint 同等对象验证通过 |
| LibreOffice Impress | `26.2.4.2` | 隔离配置逐份重开并渲染为非空 PDF |

四份文件在外部复开前后 SHA-256 完全不变。矩阵见 `docs/evidence/c5b-pptx-shape-output-reopen/matrix.json`。

## 5. 自动化覆盖

- Rust 覆盖 PowerPoint/WPS/LibreOffice 三类真实 fixture 的矩形、椭圆和线条新增、目标枚举、删除恢复、过期摘要和非法输入拒绝；
- Tauri 命令测试覆盖新增/删除可靠另存及复读；
- 桌面脚本驱动真实 Tauri/WebView2；
- 两项 C5B 证据检查已加入 `npm run ci:check`；
- 外部矩阵脚本可通过 `npm run audit:c5b-pptx-shape-output-reopen` 重跑。

## 6. 下一阶段

唯一恢复入口为 **C5C 幻灯片生命周期**：

1. 新增空白幻灯片；
2. 复制安全幻灯片；
3. 删除幻灯片；
4. 调整幻灯片顺序；
5. 正确维护 `presentation.xml`、关系、内容类型和幻灯片部件；
6. 继续使用可靠新副本、应用内复读和三生产者复开。

C5C 完成后进入 C5D，统一更新 PPTX 能力注册表、界面声明、发布矩阵和完整 CI。C5D 前不把 PPTX 宣传为完整 PowerPoint 等价编辑器。
