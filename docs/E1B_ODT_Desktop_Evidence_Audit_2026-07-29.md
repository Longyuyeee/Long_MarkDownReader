# E1B ODT 桌面证据审计

> 审计日期：2026-07-29
> 代码基线：`main` / `32866e6`
> 阶段状态：E1B 桌面证据子门禁完成；总生产者门禁仍为 2/3
> 产品状态：`.odt` 继续未注册，`write=false`

## 1. 本批结论

本批使用 Microsoft Word 16 与 LibreOffice Writer 的真实 ODT fixture，在隔离临时知识库和真实 Tauri WebView2 中关闭了当前可执行的桌面证据缺口。两种生产者均可只读打开；正常/紧凑布局、专业明色/暗色主题、文内搜索和 `odt-block` 精确定位均通过，fixture 源字节保持不变。

本批没有绕过 WPS 门禁，也没有提前把 `.odt` 登记为受支持格式。WPS `12.1.0.26895` 仍因缺少可信 ODF 组件而生成 OLE 复合文档，因此 E1B 保持 2/3。

## 2. 真实桌面矩阵

证据清单：`docs/evidence/e1b-odt-desktop/audit-manifest.json`

| 场景 | 生产者 | 视口 | 主题 | 验证 |
|---|---|---|---|---|
| 只读打开 | Microsoft Word 16 | normal `1280x820` | professional-light | 标题、列表、表格、图片、包摘要 |
| 紧凑打开 | LibreOffice Writer | compact `760x720` | professional-light | 响应式单栏、风险提示、图片 |
| 文内搜索 | Microsoft Word 16 | normal `1280x820` | professional-dark | 唯一命中、当前命中高亮、居中 |
| 路由定位 | LibreOffice Writer | compact `760x720` | professional-dark | `odt-block-7` 精确高亮、居中 |

自动化共通过 8 项检查并生成 4 张截图：

- `word-light-normal-open-1280.jpg`
- `libreoffice-light-compact-open-760.jpg`
- `word-dark-normal-search-1280.jpg`
- `libreoffice-dark-compact-locator-760.jpg`

## 3. 实现与门禁

1. `OdtReaderView.vue` 增加稳定测试选择器、当前搜索命中和路由定位目标状态。
2. 修正 ODT 工作面强调色变量为唯一主题契约 `--theme-primary` / `--theme-primary-rgb`。
3. `run-e1b-odt-desktop-audit.ps1` 使用仓库已有 `tauri.e2e.conf.json`，避开 Windows 保留的 `9000` 端口，在 `14200/14300` 启动隔离 Vite 与 CDP。
4. `capture-e1b-odt-desktop-audit.mjs` 驱动真实 Tauri，校验布局几何、搜索/定位居中、只读标签、源摘要和未注册边界。
5. `check-e1b-odt-desktop-audit.mjs` 固定生产者、视口、主题、检查项和截图库存，并进入 `ci:check`。
6. `shared/odt-read-contract.json` 记录桌面证据已验证，但仍保留 `complete=false`、`releaseGatePassed=false`。

## 4. 验证结果

- `npm.cmd run build`：通过。
- `npm.cmd run audit:e1b-odt-desktop`：8/8 检查、4/4 截图通过。
- `npm.cmd run check:e1b-odt-desktop-evidence`：通过。
- `npm.cmd run check:odt-read-contract`：通过，明确输出生产者 `2/3`、WPS blocked、产品暴露关闭。
- 人工视觉复核：四张截图无横向溢出，紧凑布局、暗色对比、搜索和路由定位高亮清晰。

## 5. 后续唯一顺序

1. 在具备可信、版本匹配 ODF 组件的 WPS 环境运行 `audit:e1b-wps-odf-environment`。
2. 生成并验证真实 `wps-writer.odt`，完成隐私净化、SHA-256 和 WPS 原生重开。
3. 把 WPS 加入本桌面矩阵，补齐打开、搜索、定位和主题抽样。
4. 三生产者达到 3/3 后，登记 `.odt` 为 `preview-only`、保持 `write=false`。
5. 完整 `ci:check` 和 GitHub Quality Gate 通过后关闭 E1B，进入 E1C ODS/ODP。

在 WPS 环境未就绪期间，不重复安装来源和兼容性不明的旧 ODF add-in，不使用改后缀、伪 fixture 或降低包验证标准的方式关闭门禁。
