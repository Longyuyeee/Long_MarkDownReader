# C3B2 PPTX 组合、图片与颜色变换审计

更新日期：2026-07-27
阶段判定：**C3B2 已完成；C3B 视觉继承与对象渲染部分完成**

## 1. 本批目标与结论

本批延续 C3B1 的主题与基础样式契约，完成组合对象展开、常用图片视觉属性和混合文本安全降级。PPTX 原文件继续严格只读，没有新增保存或写回命令。

已完成：

1. 将嵌套 `grpSp` 从单个占位对象改为组边界加可独立渲染的子对象。
2. 按 `off/ext/chOff/chExt` 逐层恢复非恒等组合坐标，使用有界整数计算避免乘法溢出。
3. 为对象记录父组 ID、组合层级和直接子对象数量；展开后的组边界不再遮挡子对象。
4. 解析图片 `srcRect` 四向裁剪与 `alphaModFix`/`alphaMod` 透明度，并由主画布和放映画布消费。
5. 支持填充、描边、文字和背景中的 `shade`、`tint`、`lumMod`、`lumOff` 常用颜色变换。
6. 支持填充、描边和文字颜色的基础 alpha 透明度。
7. 统计文本运行并检测显式运行样式差异；混合样式文本框不再错误套用最后一个运行的样式，而是降级为基础文本呈现并给出只读警告。
8. Microsoft PowerPoint 真实 fixture 中的组合子对象已经展开；LibreOffice Impress 真实 fixture 保持稳定复读。

因此 C3B2 的独立退出条件已经满足，但 C3B 和 C3 整体仍未完成，不能宣传为 PowerPoint 像素级等价阅读器。

## 2. 新增只读模型

`PptxObject` 新增：

- 组合：`parentGroupId`、`groupLevel`、`childCount`
- 图片：`cropLeft`、`cropTop`、`cropRight`、`cropBottom`、`imageOpacity`
- 颜色：`fillOpacity`、`lineOpacity`、文字 `opacity`
- 文本降级：`textRunCount`、`mixedTextStyle`

组合子对象进入原有对象数量上限，总对象仍不得超过 100,000。裁剪值在界面消费前再次限制；无效或退化裁剪不会产生除零或无限尺寸。

## 3. 验证证据

定向验证：

- PPTX Rust 回归由 3 项扩展至 5 项，全部通过。
- 非恒等组合 fixture 验证坐标从 `(500, 250, 1000, 500)` 变换为 `(2000, 2500, 2000, 1000)`。
- 同一 fixture 验证父组、层级、子对象数量、四向裁剪、50% 图片透明度、75% 填充透明度和混合文本降级。
- 颜色变换 fixture 验证 shade、tint、lumMod 及背景 tint。
- Microsoft PowerPoint 真实 fixture 验证组内两个子对象被展开并关联父组。
- Microsoft PowerPoint / LibreOffice Impress 真实生产者复读通过。
- Vue 类型检查与 Vite 生产构建通过。
- PPTX 生产者矩阵门禁通过，仍明确为 2/3；WPS Presentation 没有被伪造为已验证。
- 文件格式契约通过，仍为 31 类格式、63 个扩展名。

最终验收：

- 完整 `npm run ci:check` 通过。
- Rust 功能回归 320 项通过，性能回归 1 项通过。
- Tauri Debug `--no-bundle` 构建通过，输出为 `src-tauri/target/debug/tauri-app.exe`。
- PDF 100 MiB 范围基准为 116 ms、255.9 KiB、1 次请求。
- npm 生产依赖审计为 0 个漏洞。
- 既有 A5 桌面证据仍为 36 项检查和 28 张真实 Tauri 截图；C3D 的 PPTX 专项视觉矩阵仍明确待补。

## 4. 明确保留边界

本批未完成：

1. 组合对象旋转中心、翻转和复杂嵌套旋转矩阵；检测到旋转组合时会明确警告近似呈现。
2. 图片双色、重新着色、柔化边缘、阴影和其他艺术效果。
3. 渐变填充、图案填充、复杂透明度链和全部 DrawingML 颜色变换。
4. 逐运行 DOM 富文本渲染；当前对混合运行采用诚实的整框降级。
5. 线条端点、连接符、自由形状、基础表格和图形框架分级呈现。
6. 由真实画布生成的缩略图，以及 PowerPoint/WPS/LibreOffice 的真实桌面视觉矩阵。

## 5. 下一开发入口

下一批进入 **C3B3 对象分级渲染与真实缩略图**：

1. 解析并呈现线条、连接符、常用自由形状和基础表格。
2. 为图表、SmartArt、媒体和嵌入对象建立明确的分级只读卡面。
3. 缩略导航复用主画布对象模型，不再使用标题与纯文本近似。
4. 建立多尺寸视觉回归，检查对象溢出、重叠、裁剪和不可见状态。

C3B3 后进入 C3C 索引/管理闭环和 C3D 三生产者桌面收口；满足完整退出条件后再进入 C4 PPTX 基础编辑。
