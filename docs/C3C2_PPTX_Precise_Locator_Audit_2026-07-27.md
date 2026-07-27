# LongEdit C3C2 PPTX 精确定位审计

审计日期：2026-07-27

阶段：C3C2

阶段目标：让全局搜索结果在 Library 右侧 PPTX 工作区精确定位幻灯片、对象和备注

## 1. 阶段结论

C3C2 已完成。C3C1 生成的 `pptx-slide` / `pptx-object` 元数据现在已经形成可见、可重复的用户闭环：

1. Library 搜索结果识别 PPTX 标题、正文、对象和备注类型。
2. 点击结果继续在原有 Library 右侧工作区打开，不创建独立管理页面。
3. 路由携带幻灯片序号、稳定定位类型、稳定 ID、位置标签和一次性令牌。
4. 阅读器选择目标幻灯片并把对应缩略图滚动到可见区域。
5. 对象结果具有独立于页内搜索的持续高亮和定位状态。
6. 备注结果自动展示备注侧栏。
7. 重复点击相同结果仍重新触发定位动画，不被路由复用吞掉。

PPTX 继续保持结构化只读；本阶段没有增加 writer、保存命令或原件覆盖。

## 2. 实施审计

### 2.1 Library 路由消费

`src/views/LibraryMode.vue` 已补齐：

- `slide-title`、`object`、`notes` 搜索类型；
- PPTX 专用位置标签；
- `slide`、`locatorKind`、`locator`、`locationLabel`、`matchKind` 参数；
- 单调递增的一次性 `locatorToken`；
- `LibraryMode` 内嵌路由，保持原有右侧工作区结构。

### 2.2 稳定定位决策

`src/utils/pptxLocator.ts` 提供纯函数 `resolvePptxRouteLocator`：

- 幻灯片稳定 ID 优先，页序作为安全回退；
- 对象定位优先在页序提示对应的幻灯片内匹配；
- 对象 ID 在不同幻灯片重复时由页序消歧；
- 页序过期时允许稳定对象 ID 恢复；
- 隐藏幻灯片不被过滤；
- 无效元数据不会选择无关幻灯片。

### 2.3 阅读器定位与反馈

`src/views/PptxReaderView.vue` 已实现：

- 加载完成后消费路由定位；
- 缩略图 `scrollIntoView({ block: 'nearest' })`；
- 目标幻灯片、缩略图和对象分层高亮；
- 底部“已定位”状态；
- 备注命中自动打开详情面板；
- 手动切页或页内搜索时清除旧路由高亮；
- 通过 `routeLocatorRun` 阻止较慢旧请求覆盖最新点击；
- 监听 `locatorToken`，相同结果可重复定位。

### 2.4 真实桌面缺陷修复

桌面审计发现并修复了 C3A 遗留的命令装配错误：

- 原 `read_pptx_presentation` 请求未注册的全局 `WorkspaceGuard` 状态；
- 真实 Tauri 会报 `state not managed for field guard`；
- 现与 DOCX/PDF 边界一致，由每次请求的 `libraryRoot` 创建 `WorkspaceGuard`；
- 新增真实 PowerPoint fixture 命令级回归，确认可读、3 张幻灯片存在且源字节不变。

这说明仅有解析器测试和前端构建不能替代真实桌面命令装配验证。

## 3. 自动回归

`npm run check:pptx-locator` 覆盖：

- 隐藏幻灯片稳定 ID；
- 重复对象 ID 的页序消歧；
- 过期页序提示恢复；
- 页序安全回退；
- 无效定位不误选。

格式契约进一步约束：

- Library 必须保留 PPTX 定位类型和一次性令牌；
- 阅读器必须监听重复定位；
- 异步定位必须有竞态仲裁；
- 缩略图必须滚动；
- 对象必须独立高亮；
- 备注必须打开详情面板；
- PPTX 命令必须使用请求级工作区守卫。

## 4. 真实 Tauri/WebView2 证据

独立审计命令：

```text
npm run audit:c3c2-pptx-locator
npm run check:c3c2-pptx-locator-evidence
```

隔离运行使用 Microsoft PowerPoint 真实生产者 fixture，通过 CDP 操作真实 Tauri Debug WebView2，取得：

- 3/3 桌面检查；
- 2 张 1280×820 截图；
- 对象搜索在 Library 内嵌工作区打开并高亮；
- 相同对象结果两次点击产生不同令牌；
- 备注结果展示备注侧栏；
- 审计前后源 PPTX 字节一致。

证据：

- [`pptx-object-search-location.jpg`](./evidence/c3c2-pptx-locator/pptx-object-search-location.jpg)
- [`pptx-notes-search-location.jpg`](./evidence/c3c2-pptx-locator/pptx-notes-search-location.jpg)
- [`audit-manifest.json`](./evidence/c3c2-pptx-locator/audit-manifest.json)

## 5. 完整门禁

`npm run ci:check` 已通过：

- 前端 TypeScript 与生产构建通过；
- 文件格式、主题、DOCX/PPTX 生产者、PPTX 定位、图谱、PDF、A5 桌面、工作簿和 XLSX 门禁通过；
- Rust 功能回归 `325/325`，另有 1 项性能用例按设计独立执行；
- Rust 性能回归 `1/1`；
- Tauri Debug `--no-bundle` 构建通过并生成桌面应用；
- 100 MiB PDF range 基准 `69 ms / 255.9 KiB / 1 request`；
- 正式依赖漏洞为 0；
- 构建仍有既有 Vite 大分包警告；Windows 增量编译缓存结束时另出现一次 `os error 5` 清理警告，但应用产物正常生成，未影响构建退出状态。

## 6. 能力边界

尚未完成：

- PPTX 文件/幻灯片 KnowledgeObject；
- 文件到幻灯片的 `contains` 关系；
- PPTX 共享关系侧栏和对象上下文；
- C3C4 索引删除、重建、过期回退及桌面综合收口；
- WPS Presentation 第三生产者；
- PPTX 基础编辑与可靠另存。

## 7. 下一开发入口

下一批进入 **C3C3 PPTX 对象与关系**：

1. 建立 PPTX 文件与幻灯片 KnowledgeObject；
2. 建立文件到幻灯片的 `contains` 关系；
3. 为搜索结果和当前幻灯片提供共享关系上下文；
4. 保持对象 ID、位置标签与 C3C1/C3C2 定位合同一致；
5. 覆盖实时图谱与持久化索引语义一致性；
6. 不创建 PPTX 专属关系孤岛，不提前开放编辑写回。

C3C3 完成后进入 C3C4 索引/桌面收口，再进入 C3D 生产者矩阵。
