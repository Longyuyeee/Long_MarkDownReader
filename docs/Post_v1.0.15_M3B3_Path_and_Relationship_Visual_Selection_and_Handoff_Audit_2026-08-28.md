# v1.0.15 后 M3B-3 路径与关系视觉选择及换机交接审计

日期：2026-08-28
审计功能基线：`main` / `12fe4335b31096ac1b4bdde6d064fea88dd732ae`
仓库：`https://github.com/Longyuyeee/Long_MarkDownReader.git`
开发线：`1.0.16`；运行时与当前公开版本：`1.0.15`；不是发布候选

## 1. 当前开发结论

M0、M1、M2 与 M3A 已按各自审计报告收口。M3B-0 已冻结视觉差距，M3B-1 已完成密度感知语义缩放和社区远景，M3B-2 已完成不参与布局的社区轮廓与语义层级。当前尚未完成整个 M3B、M3C 或 `1.0.16` 发布。

本次完成 M3B-3 选择审计，不修改产品运行代码。下一接续点为 **M3B-4 曲线/平行关系与静态路径标签**。

## 2. M3B-3 实际代码审计

| 能力 | 当前实际情况 | 结论 |
| --- | --- | --- |
| 关系事实 | 统一语义注册表保存颜色、线型、方向；Canvas 已有有向箭头 | 可复用，不建立第二套关系事实 |
| 网络边 | `GraphView.vue` 的 network 分支直接 `lineTo`，只有 mind-map 使用贝塞尔曲线 | 网络曲线未实现 |
| 多重/互反边 | `GraphEdge` 没有视觉路由 ID，同端点关系沿相同线段绘制 | 关系重叠，无法逐条辨认 |
| 路径 | 独立 BFS 返回真实边，当前用诱导范围显示 4 节点/3 边 | 算法和事实可靠 |
| 路径证据 | 三条路径边均显示全部 mention、事实方向、类型和来源回跳 | 必须保留 |
| Canvas 路径表达 | 无专属路径高亮、关系标签或方向流动 | 视觉表达未完成 |
| 面板与相机 | 最新 1280×800 实图中，证据面板覆盖大部分路径主体 | 需让面板与可用画布共享取景 |
| 减少动效 | 全局已有 `motionSpeed='reduced'`，但图谱不读取它且持续 RAF | 动画不得先于减少动效合同 |

## 3. 选择决定

下一阶段 M3B-4 先建立静态可读性基础：确定性网络曲线路由、平行/互反边分离、沿曲线切线的事实方向箭头、仅对选中路径展示的关系标签，以及证据面板打开时按剩余画布重新取景。这样可先验证路径和关系是否能被读懂，再进入方向流动与减少动效；不能把持续动画用于弥补静态路由不清。

以下内容继续延后：选中路径方向动画及 `reduced` 消费、缩略导航、适应选择、聚类镜头、全屏、状态外环和 M3C 大图性能。

## 4. 本次验证

- `npm run build`：通过。
- M3A-8 真实 Tauri 回归：4/17 节点、3 条路径边、3 条证据边；宽窄屏通过，运行时错误 0，资料库 SHA-256 不变并返回资料库。
- M3B-2 暗色、浅色、高对比证据仍为零错误且源文件不变。
- M3B-3 机器选择合同、开发版本链、图谱产品合同和当前开发文档门禁：通过。

最新路径画面证据：`docs/evidence/post-v115-m3a8-semantic-exploration-exit/combined-neighbor-path.jpg`。

## 5. 换电脑接续步骤

```powershell
git clone https://github.com/Longyuyeee/Long_MarkDownReader.git
Set-Location Long_MarkDownReader
git switch main
git pull --ff-only origin main
git status --short
git log -3 --oneline
npm ci
npm run check:development-version-identity
npm run check:post-v115-m3b3-path-relationship-visual-selection
npm run build
```

预期：`git status --short` 无输出；开发阶段显示 `M3B-4-curved-parallel-relations-and-static-path-labels`。开始开发前必须重新阅读本报告、M3B-2 报告、路线图 7.2 节以及 `GraphView.vue` 的实际边渲染循环。

若新电脑缺少 Rust/Tauri 环境，可先完成 `npm ci`、机器合同与前端构建；需要真实桌面审计时再按仓库现有 Tauri 环境配置安装 Rust 和 WebView2。不得用浏览器截图替代最终 Tauri 证据。
