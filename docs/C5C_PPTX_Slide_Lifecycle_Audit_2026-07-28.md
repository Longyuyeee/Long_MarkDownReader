# C5C PPTX 幻灯片生命周期审计

> 审计日期：2026-07-28
> 版本基线：LongEdit `v0.7.0` / `main`
> 阶段结论：**C5C 已完成，下一批进入 C5D PPTX 能力注册表与发布矩阵收口。**

## 1. 交付范围

C5C 在现有 Library 右侧 PPTX 工作面内完成了四种受控幻灯片操作：

- 在所选页后新增空白页，并继承该页版式关系。
- 复制所选页、页面关系和独占备注，重写新备注到新页面的回链。
- 删除安全页面及其独占备注、关系和内容类型声明。
- 按稳定页面身份排序，只重排 `presentation.xml` 的 `p:sldId` 列表。

所有操作继续采用“隔离预览摘要 + 原子无覆盖新副本 + 应用内复读 + 外部生产者复开”模型，不覆盖源文件。

## 2. OOXML 安全边界

- 使用结构化 XML 事件与字节跨度维护 `presentation.xml`、`presentation.xml.rels` 和 `[Content_Types].xml`，不做全包重生成。
- 页面仅允许版式、图片和备注等已知内部关系；外部关系、未知关系、共享或歧义入向引用会阻断复制/删除。
- 删除最后一张页面被禁止；排序必须包含全部目标且每个身份只出现一次。
- 每个目标绑定页面、演示文稿和关系部件 SHA-256，陈旧基线会被拒绝。
- 未修改 ZIP 部件使用原始复制，并逐部件验证变化、新增、删除白名单及其余摘要。

## 3. 自动化验证

Rust C5C 回归覆盖：

- Microsoft PowerPoint、WPS Presentation、LibreOffice Impress 三类真实生产者输入。
- 新增、复制、删除、倒序四条内存隔离路径。
- 复制内容与备注语义、删除页数、排序身份及未修改部件保真。
- 陈旧摘要、重复排序、未变化排序和未知目标拒绝。
- 文件路径预览与最终可靠新副本摘要一致，源文件字节不变。

前端生产构建通过，C5C 面板覆盖新增、复制、删除、排序、目标筛选、上下移动、隔离预览和可靠另存。

## 4. 真实桌面证据

真实 Tauri Debug WebView2/CDP 审计完成 10 项检查：

- 视口：`1280x820`、`960x720`
- 输出：4 份可靠新副本
- 截图：3 张
- 源 WPS 样本：前后字节一致

证据入口：

- `docs/evidence/c5c-pptx-slide-lifecycle/audit-manifest.json`
- `docs/evidence/c5c-pptx-slide-lifecycle/c5c-add-preview-1280.jpg`
- `docs/evidence/c5c-pptx-slide-lifecycle/c5c-reorder-preview-1280.jpg`
- `docs/evidence/c5c-pptx-slide-lifecycle/c5c-copy-reopen-960.jpg`

## 5. 外部生产者复开

| 生产者 | 结果 | 验证 |
|---|---|---|
| Microsoft PowerPoint `16.0` | 通过 | 四份输出只读打开；页数 `4/4/2/3`；排序身份正确；复制备注保留 |
| WPS Presentation `12.1.0.26895` | 通过 | 四份输出只读打开；页数 `4/4/2/3`；排序身份正确；复制备注保留 |
| LibreOffice Impress `26.2.4.2` | 通过 | 隔离配置渲染四份 PDF；页数 `4/4/2/3` |

矩阵：`docs/evidence/c5c-pptx-slide-output-reopen/matrix.json`。四份输出复开前后 SHA-256 完全一致。

## 6. 固定输出

| 操作 | 文件 | SHA-256 |
|---|---|---|
| 新增 | `c5c-add-copy.pptx` | `448170430cbd33ca522e6da2128cb7bd5d3d9d4aaf5e8d18088ab950387367a4` |
| 复制 | `c5c-copy-copy.pptx` | `3bbcc26cf0e8174ff6031f9ccaea6425ef322dea6359685af41b41997e5b1a2a` |
| 删除 | `c5c-delete-copy.pptx` | `e71d129e5f651871245ea2648d9831658d6232bc357a3c81525dc131fbb4c927` |
| 排序 | `c5c-reorder-copy.pptx` | `ea942a924b2708c752d8448ee2cb6c593c1607e8af66ec85f989e0f0875d2718` |

## 7. 下一步

C5D 只做 PPTX 阶段发布收口：

1. 将能力注册表从保守的 `preview-only / none` 升级到与真实子能力一致的 `basic-edit / copy`。
2. 统一界面、需求文档、发布矩阵和已知限制措辞。
3. 执行正常/紧凑与明/暗主题发布抽样、完整 `npm run ci:check` 和 GitHub Quality Gate。

母版、动画、SmartArt、复杂图表和完整 PowerPoint 等价编辑继续属于高级能力，不纳入 C5D。
