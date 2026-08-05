# A12 Drawio/Canvas 尺寸稳定性审计

日期：2026-08-05

阶段：UX-34

结论：Drawio/Canvas 的 `ResizeObserver` 阻断错误已收口。Canvas 尺寸更新现在按动画帧合并、整数像素去重，并在卸载时断开观察器、取消待执行帧；启动级和应用级错误边界只处理浏览器定义的两种 ResizeObserver 循环通知，其他错误仍会显示原有错误页。

## 根因与修复

- Canvas 原先在 ResizeObserver 回调中同步读取和写入布局，路由过渡、侧栏变化及缩放可能在同一布局周期再次触发观察。
- `index.html` 的早期 `window.onerror` 无条件显示“应用加载失败”，即使应用级监听器已经对可恢复通知执行 `preventDefault()`，仍会覆盖整个界面。
- 现在观察器只缓存最后尺寸并在下一帧提交；宽高未变化时不写响应式状态。早期捕获器和应用捕获器使用相同的两条精确消息，不使用模糊匹配。

## 真实桌面验收

使用 Tauri Debug WebView2 和仓库隔离 fixture 完成 6 轮 Drawio/Canvas 路由切换、6 次视口变化、6 次 Canvas 缩放和 6 次节点拖动。每轮 Drawio 均显示 2 页和可编辑单元格，Canvas 均显示 2 个节点及有效缩放变换；运行时异常为 0，阻断错误页未出现。

反向测试确认两种 ResizeObserver 通知会被处理且不显示错误页，而模拟普通运行时错误不会被吞掉并会显示错误页。第一次采集虽然 JSON 误判通过，但人工截图发现错误页仍存在；增强阻断界面选择器并修复早期捕获器后重新采集，最终截图已人工接受。

证据位于 `docs/evidence/ux34-drawio-canvas-stability`，只使用仓库 fixture，不含用户资料。当前仍是开发态 WebView2 证据，不提升 `releaseCandidate=false`。

## 下一步

进入 UX-35：移除文件树重复的原生 `title` 提示，只保留统一详情浮层，同时补齐键盘焦点的信息可达性。

机器验收：`npm run check:ux34-drawio-canvas-stability`
