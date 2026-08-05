# A17 UX-38A 轻量格式体验矩阵审计

## 本阶段结论

UX-38A 已建立全格式体验矩阵，并完成轻量源文件族的第一轮真实桌面横向验收；UX-38 总项继续保持进行中。

- `shared/ux38-format-experience-matrix.json` 覆盖共享注册表 41/41 个格式族和 12 个体验维度。
- 状态只允许“已通过、部分通过、引用既有证据、待验证、不适用”，任何注册格式都不能被遗漏或凭路由可用直接宣称完整通过。
- 本轮覆盖 Markdown、TXT、ENV、INI、Properties、EditorConfig、GitIgnore、10 类代码、JSON/JSONC、LOG、YAML、XML/SVG、TOML，共 24 个格式族。
- 24 个隔离样本均在真实 Tauri Debug WebView2 中完成受管路由打开、目标身份确认、活动标签确认、可视区域和横向溢出检查；最长加载 2041 ms，运行时错误 0，阻断错误界面 0。
- 审计前后 24 个源文件 SHA-256 全部一致；证据不包含用户资料或完整本机路径。

## 视觉判断

TXT、JavaScript、JSON、YAML、LOG 五个代表工作面已人工复核，正文、语法色、结构侧栏和状态栏均正常，没有残留加载遮罩。

多文件标签仍会被压缩，并显示原生横向滚动条。因此 UX-38 的标签维度仅记为“部分通过”，同时继续阻断 UX-09、UX-10、UX-17；本阶段不把“活动标签存在”夸大成标签体验已完成。

## 验证

- `npm.cmd run build`：通过，6213 个模块。
- `npm.cmd run audit:ux38a-lightweight-formats`：24/24 通过。
- `npm.cmd run check:ux38-format-experience-matrix`：通过。
- `npm.cmd run check:current-development-audit`：通过。
- 证据：`docs/evidence/ux38a-lightweight-formats`，绑定提交 `9a461506a7e4f72ddf4f3ae056d152a95480b5f8`。

当前仍为内部开发审计，`releaseCandidate=false`。

## 下一步

进入 UX-38B，先修复所有格式共用的标签栏：保证最小可读宽度，支持滚轮/触控板横向滚动，隐藏原生滚动条并提供边缘反馈。完成 UX-09、UX-10、UX-17 后，再继续数据表格与 Office/图形格式的横向矩阵补证。
