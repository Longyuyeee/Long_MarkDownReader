# 主界面版本显示审计（2026-08-21）

## 开发目标

- 在主界面提供始终可见、低干扰的软件版本信息。
- 版本必须来自当前运行的 Tauri 应用，不能把 `v1.0.12` 写死在界面中。
- 不占用文档标签栏和编辑工具栏，并兼容侧栏最小宽度。

## 实现与对齐

- 位置：左侧栏底部“当前资料库”卡片的状态行右侧。
- 显示：`v{当前版本}`；悬浮提示和无障碍名称均为“当前软件版本 v{当前版本}”。
- 数据：初始化 Tauri 更新服务后读取运行时版本；初始化期间使用已与包版本对齐的发布能力矩阵版本。
- 布局：版本徽标不收缩、不换行；资料库名称继续在第二行省略显示。

## 真实验收

| 检查项 | 预期 | 实际 |
| --- | --- | --- |
| 发布版本一致性 | package、Tauri、能力矩阵一致 | 均为 `1.0.12` |
| 主界面显示 | 左下资料库卡片显示当前版本 | 显示 `v1.0.12` |
| 正常与最小侧栏 | 徽标完整留在卡片内，无页面横向溢出 | 桌面 WebView 自动测量通过 |
| 运行时稳定性 | 无脚本异常与控制台错误 | `runtimeErrorCount = 0` |

证据：

- `docs/evidence/main-version-indicator/main-version-indicator-wide.png`
- `docs/evidence/main-version-indicator/main-version-indicator-detail.png`
- `docs/evidence/main-version-indicator/runtime-evidence.json`

验证命令：

```powershell
npm run check:main-version-indicator
npm run audit:main-version-indicator
npm run build
```

结论：主界面版本显示达到本步骤目标，可提交推送；本步骤不提升发布版本。
