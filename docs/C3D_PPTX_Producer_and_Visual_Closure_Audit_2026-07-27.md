# LongEdit C3D PPTX 生产者与桌面视觉收口审计

审计日期：2026-07-27

阶段：C3D

阶段目标：补齐 WPS Presentation 真实生产者证据，统一 PowerPoint、WPS、LibreOffice 三生产者结构回读，并用真实 Tauri 多尺寸、多主题矩阵关闭 PPTX 只读阶段。

## 1. 阶段结论

C3D 已完成，PPTX C3A～C3D 只读阶段整体收口：

1. Microsoft PowerPoint、WPS Presentation、LibreOffice Impress 三生产者矩阵达到 **3/3 verified**。
2. WPS Presentation `12.1.0.26895` 真实生成项目自有 PPTX，经定向隐私清理后由新的 WPS 实例复开。
3. Rust 统一复读三份真实 fixture，并对 WPS 组合对象、连接线和表格建立结构回归。
4. 三生产者均在原有 Library 右侧 PPTX 工作区打开，没有新增格式孤岛。
5. 真实 Tauri WebView2 覆盖 1280×820、960×720、760×720，专业浅色与专业深色两种主题。
6. 搜索备注、精确定位、兼容画像、组合/连接线/表格、只读放映和重新打开均通过。
7. 审计发现并修复了两个真实响应式问题：中窄屏备注定位后面板不可见，以及窄屏放映层被 Library 容器裁切。
8. 三份 fixture 在审计前后源字节均保持不变。

本阶段没有增加 PPTX writer、保存命令或原件覆盖。`FR-OFFICE-002` 仍为部分完成；下一阶段进入 C4 受限基础编辑。

## 2. WPS Presentation 真实生产者证据

### 2.1 环境与生成链

- 生产者：WPS Presentation；
- WPS Build：`12.1.0.26895`；
- 自动化接口：`KWPP.Application`；
- fixture：`fixtures/pptx/producers/wps-presentation.pptx`；
- 清单：`fixtures/pptx/producers/wps-presentation.json`；
- 生成器：`scripts/generate-c3d-wps-pptx-fixture.ps1`。

生成器创建独立 WPS 实例并完成：

1. 创建 3 张幻灯片；
2. 写入标题、正文、备注、基础形状和项目自有 PNG；
3. 写入组合形状、连接线和 2×2 表格；
4. 由 WPS 保存为 Office Open XML Presentation；
5. 定向替换作者字段，移除 WPS 安装实例后缀；
6. 扫描最终 OOXML，拒绝用户名、用户目录、临时路径和外部关系；
7. 由新的 WPS 实例复开，并核验页数和预期标题；
8. 复开成功后生成 SHA-256、版本、可再分发和预期结构清单。

最终 fixture 只包含项目自有文字和图片，可随仓库再分发。仓库不提交 WPS 安装包、用户配置、缓存或安装日志。

### 2.2 三生产者事实源

| 生产者 | 版本 | 状态 | 真实复开方式 |
|---|---:|---|---|
| Microsoft PowerPoint | 16.0.20131.20154 | `verified` | PowerPoint 只读复开 |
| WPS Presentation | 12.1.0.26895 | `verified` | 新 `KWPP.Application` 实例复开 |
| LibreOffice Impress | 26.2.4.2 | `verified` | LibreOffice PDF 导出复开验证 |

`fixtures/pptx/producers/matrix.json` 已升级为 `stage=C3D`、`verifiedCount=3`、`complete=true`。独立门禁重新计算每份 fixture 的 SHA-256，并验证可再分发、原生产者复开、文本、图片、形状、备注、主题和页数证据。

## 3. 兼容实现审计

### 3.1 生产者名称规范化

OOXML `Application` 原始值继续保存在兼容模型中作为诊断证据；用户可见的 `producer` 被稳定规范化为：

- `Microsoft PowerPoint`；
- `WPS Presentation`；
- `LibreOffice Impress`。

这避免 LibreOffice 内部构建标识挤压兼容画像，同时不丢弃原始生产者数据。

### 3.2 中窄屏备注可见性

旧布局在 1050px 以下直接隐藏详情面板，导致搜索结果显示“已定位到备注”，但备注正文不可见。当前在 960px 和更窄窗口中使用右侧覆盖详情面板，保留备注、生产者、对象统计和只读边界；自动化验证面板宽度、视口边界与实际显示状态。

### 3.3 全窗口只读放映

旧放映层位于 Library 内容容器内部，760px 下只覆盖右侧内容区并裁掉幻灯片左边。当前使用 Vue `Teleport` 将放映层挂载到 `body`，真实占满整个 WebView。门禁验证：

- 放映层四边与视口一致；
- 幻灯片四边均位于视口内；
- 第 3 张 WPS 幻灯片的组合对象、连接线和表格可见；
- 专业深色主题下控件与页码可用。

## 4. 真实桌面证据

证据环境：Tauri Debug + WebView2 + Chrome DevTools Protocol，隔离临时资料库。

结果：**8/8 检查通过、3 个生产者、3 档尺寸、2 种主题、5 张截图**。

检查范围：

1. 三生产者在 Library 内打开且工作区无横向溢出；
2. WPS 组合对象、连接线和表格真实渲染；
3. WPS 备注搜索在 Library 内定位且正文实际可见；
4. 760px 专业深色全窗口放映完整呈现；
5. 离开工作区后重新打开 WPS PPTX；
6. PowerPoint、WPS、LibreOffice 三份源文件字节不变。

证据目录：[`evidence/c3d-pptx-producer-visual`](./evidence/c3d-pptx-producer-visual)

复核命令：

```powershell
npm run check:pptx-producer-matrix
npm run audit:c3d-pptx-producer-visual
npm run check:c3d-pptx-producer-visual-evidence
```

## 5. C3 最终能力边界

| 用户任务 | C3D 后状态 |
|---|---|
| 识别和打开 PPTX | 已完成 |
| 右侧结构化阅读、缩略图和只读放映 | 已完成 |
| 文本、对象、表格、替代文本和备注搜索定位 | 已完成 |
| 文件/幻灯片知识对象、关系侧栏和图谱回流 | 已完成 |
| 可删除、可重建索引及缺失/过期安全回退 | 已完成 |
| PowerPoint/WPS/LibreOffice 三生产者矩阵 | 已完成 |
| PPTX 文本、备注、样式或对象编辑 | 未开始 |
| PPTX 可靠另存和三生产者输出复开 | 未开始 |

动画只保留兼容风险，不执行；图表、SmartArt、媒体和 OLE 继续分级只读，不宣称 PowerPoint/WPS 完整排版等价。

## 6. 下一开发入口

下一阶段为 **C4 PPTX 基础编辑**，按安全垂直切片推进：

1. C4A：审计并建立只作用于内存/临时副本的 OOXML 包差异、签名和未修改部件 raw-copy 基线；
2. C4B：开放安全单文本对象和演讲者备注的隔离补丁，不提供用户文件写入；
3. C4C：评估基础字符样式、基础形状文本和替代文本安全子集；
4. C4D：加入冲突检测、原子无覆盖另存、写后语义复读和源字节证明；
5. C4E：使用 PowerPoint、WPS、LibreOffice 复开输出副本并完成真实桌面保存闭环。

任何复杂对象、未知部件或关系变化不能通过差异白名单时，整次写入必须拒绝。C4D 之前不得增加用户可见保存命令。
