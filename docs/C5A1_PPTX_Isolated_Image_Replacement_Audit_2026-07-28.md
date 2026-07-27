# C5A1 PPTX 隔离图片替换审计

> 审计日期：2026-07-28
> 阶段状态：C5A1 已完成；C5A 整体部分完成
> 当前能力：安全目标枚举、隔离预览、可靠新副本、应用内复开
> 下一入口：C5A2 PowerPoint / WPS Presentation / LibreOffice Impress 输出复开

## 1. 目标与结论

C5A1 在 C4A～C4E 已关闭的原件保护、受限补丁、可靠另存和三生产者输出复开基础上，增加 PPTX 图片二进制替换的最小安全子集。

本批已经能够在原有 Library 右侧 PPTX 工作区中：

1. 枚举可以安全替换的图片；
2. 选择本地 PNG/JPEG 并显示缩略预览；
3. 在内存与临时副本中替换单个媒体部件；
4. 验证 OOXML 差异、结构复读和图片目标语义复读；
5. 通过既有 C4D 可靠另存链路创建不覆盖的新 PPTX；
6. 在同一 Library 工作区重新打开新副本；
7. 保证源 PPTX 字节不变。

这仍不是任意图片编辑器。共享媒体、SVG/GIF/WebP/BMP、格式转换、图片新增、关系新增、裁剪变更和源文件覆盖继续阻断。

## 2. 安全合同

### 2.1 可编辑目标

只有同时满足以下条件的对象才进入 `editableImageTargets`：

- 对象类型为现有图片；
- 媒体部件位于现有 PPTX 包内；
- 格式为 PNG 或 JPEG；
- 媒体部件只被一个对象引用；
- 原媒体签名有效；
- 目标 ID、媒体 SHA-256 和部件 SHA-256 均来自当前编辑基线。

共享媒体不会出现在可编辑列表中，避免一次替换暗中影响多张幻灯片或多个对象。

### 2.2 替换约束

- 替换文件必须大于 0 字节且不超过 8 MiB；
- MIME、文件签名和原媒体扩展名必须一致；
- 不新增或删除 OOXML 部件；
- 不修改关系文件、内容类型、幻灯片 XML 或对象坐标；
- 新图片不得与原图片字节相同；
- 预览摘要和源文件签名变化后，保存请求失效。

### 2.3 差异与复读

隔离输出必须满足：

- 变化部件严格等于目标 `ppt/media/*`；
- 其余部件通过名称和 SHA-256 保真；
- `parse_pptx` 能重新解析输出；
- 复读目标保持相同幻灯片、对象、媒体路径、格式和单引用状态；
- 复读媒体 SHA-256 等于替换文件 SHA-256；
- 临时副本落盘复读成功；
- 源文件在预览和保存前后均字节一致。

## 3. 实现范围

后端：

- `PptxEditableImageTarget`：暴露安全图片目标与摘要；
- `inspect_pptx_editable_image_targets`：计算媒体引用次数并过滤目标；
- `build_pptx_image_patch_isolated`：执行单媒体部件替换和语义复读；
- `preview_pptx_image_patch_isolated_copy`：复用签名、临时副本和源文件保护；
- `PptxPatchOperation::ImageBinary`：让可靠另存绑定已验证图片操作；
- Base64 在进入包重建前执行长度和编码校验。

前端：

- C5A 控件位于原有 PPTX 右侧详情栏；
- 文件选择器根据目标限制为原 MIME；
- 显示文件名、体积、格式、缩略图和目标媒体部件；
- 只有隔离预览通过后才显示可靠另存入口；
- 960px 紧凑宽度继续使用原界面布局，没有新开独立页面。

## 4. 自动化结果

Rust 定向回归覆盖三类真实生产者输入：

- Microsoft PowerPoint；
- WPS Presentation；
- LibreOffice Impress。

验证内容包括：

- 三类输入均能产生安全单引用图片目标；
- 每次输出只变化一个媒体部件；
- 陈旧摘要、格式变化、超限图片和无变化操作全部拒绝；
- C4D 保存命令可以保存并语义复读图片操作。

真实 Tauri Debug / WebView2 桌面审计使用 WPS Presentation fixture，完成 9 项检查：

1. 只展示单引用 PNG/JPEG；
2. 同格式与 8 MiB 文件门禁；
3. 单媒体部件隔离预览；
4. 预览不写源文件；
5. 原子创建新副本；
6. 结构与语义复开；
7. Library 内重开；
8. 960px 布局无横向溢出；
9. WPS 源文件字节不变。

证据：

- [`audit-manifest.json`](./evidence/c5a-pptx-image-replacement/audit-manifest.json)
- [`c5a-image-preview-1280.jpg`](./evidence/c5a-pptx-image-replacement/c5a-image-preview-1280.jpg)
- [`c5a-reopened-copy-960.jpg`](./evidence/c5a-pptx-image-replacement/c5a-reopened-copy-960.jpg)
- [`c5a-image-copy.pptx`](../fixtures/pptx/output-reopen/c5a-image-copy.pptx)

输出副本 SHA-256：`ad25ec6bfb35c5db2f250db160c3c89ee3bacdec88a4bb557c315c93f912bcc3`。

## 5. 能力边界与下一步

C5A1 证明 LongEdit 可以安全生成图片替换副本并由自身复读，但应用内复读不能替代外部 Office 软件验收。因此 C5A 尚不能标记为整体完成。

C5A2 必须：

1. 使用 PowerPoint、WPS Presentation 和 LibreOffice Impress 打开 `c5a-image-copy.pptx`；
2. 检查三页结构和图片对象仍存在；
3. PowerPoint/WPS 直接读取目标图片对象，LibreOffice 使用隔离用户配置渲染；
4. 验证输出 SHA-256 在只读复开后不变；
5. 形成 3/3 生产者矩阵并加入 CI；
6. C5A2 独立提交推送后，才进入 C5B 基础形状增删。

源文件覆盖、共享图片替换和格式转换在 C5A2 完成后也不会自动开放。
