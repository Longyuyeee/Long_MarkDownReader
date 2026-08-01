# G15D 知识建议观察入口审计（2026-08-01）

## 结论

G15C 已证明匿名基线与改善复查在安装版可用，但审计发现真实用户流程仍不够连续：工作台负责发现问题，图谱负责治理，而效果验证入口只存在于设置页。用户需要记住功能位置并手动返回设置，这会削弱知识图谱的存在感和建议闭环。

G15D 在工作台知识网络区域增加“记录治理基线”，在图谱行动提示增加“复查改善”。两个入口都使用当前应用窗口进入 `Settings?focus=knowledge-observation`，设置页自动把目标区域滚动到视口中央并用现有主题色强调。当前状态为 `guidance-observation-entry-implemented-installed-navigation-next`，`releaseCandidate=false`。

## 交互与边界

- 工作台在展示知识建议时同时提供“记录治理基线”，让用户在执行建议前建立可比较起点。
- 图谱行动提示保留原有链接教程或治理列表操作，并增加“复查改善”，让用户治理后直接回到效果验证。
- 设置页目标仍是原有统一界面，不打开新窗口；焦点只由受限查询值触发。
- 跳转不会自动生成或保存基线，不会自动选择文件，不会绕过指标预览、用户确认或保存位置选择，也不会自动上传。
- 聚焦样式沿用设置页边框、阴影与主题色变量，不引入独立字号或视觉体系。

前端生产构建与 G9–G15D 机器合同将验证两个入口、受限路由、滚动聚焦、现有确认边界和阶段状态。下一步是 `G15D-installed-current-window-observation-entry-acceptance`：在安装版从工作台和图谱分别点击入口，确认当前窗口路由、目标区域可见和样式一致。真实资料库验收仍需用户授权，不能由安装态合成数据代替。

## 安装态验证器集成

一次性安装生命周期现从工作台实际点击“记录治理基线”，要求地址进入 `#/settings?focus=knowledge-observation`、目标行带有聚焦状态、目标矩形位于视口内且 `window.opener` 为空。随后返回工作台，从健康建议进入图谱，再实际点击“复查改善”并重复相同检查。

验证器保存两张入口截图和一份仅含路由布尔状态的 JSON，明确记录 `exportTriggered=false`；不会点击“保存基线”或“复查改善”的文件操作按钮。当前状态为 `installed-observation-entry-runner-integrated-hosted-execution-next`。产品提交固定为 `80df4a65a03d2640841efd0d2d9111f61a00fafa`，托管运行和截图复核仍为 false。

## 首次托管安装验收与视觉退回

GitHub Actions U2 运行 `30694114591` 已在一次性 Windows 环境完成：安装版 smoke `10/10`、安装/升级/回退生命周期 `18/18`，工作台和图谱入口都在当前窗口到达 `#/settings?focus=knowledge-observation`，目标元素存在、聚焦且位于视口内，`exportTriggered=false`。但人工检查两张入口截图时，画面仍停留在“正在载入设置”的淡出过渡层，无法证明知识观察区块的文字、字号、位置与原界面风格。因此本次只接收功能证据，不接收视觉证据，也不把 `installedNavigationComplete` 提升为 true。

验证器已增加稳定表面门禁：要求 `.page-loader` 完全消失、目标矩形持续位于视口内，等待两个绘制帧和 500ms 后再次确认，再进行截图。当前状态为 `installed-observation-entry-functional-passed-visual-recapture-next`，下一步复用运行 `30694114591` 的已构建安装包执行视觉重采集；`releaseCandidate=false`，真实资料库对照和签名 Windows 客户端证据仍未完成。

## 视觉重采集接收与阶段收口

U2 重采集运行 `30695157895` 复用了运行 `30694114591` 的安装包并在 2 分 16 秒内完成。新证据明确记录 `visualSurfaceSettled=true`，安装版 smoke 再次为 `10/10`、生命周期为 `18/18`。两张截图均显示设置页中的“知识网络匿名观察”行处于完整蓝色聚焦状态，“保存基线”和“复查改善”文字清晰，字号、按钮、边框和留白沿用设置页既有视觉体系；没有观察到新窗口或独立界面。截图哈希及聚合结果已写入 `docs/evidence/g15d-guidance-observation-entry/acceptance-receipt.json`，不保存测试资料正文、文件名、对象 ID 或路径。

G15D 当前状态提升为 `hosted-installed-observation-entry-passed-real-user-execution-next`：安装态入口发现、当前窗口导航、目标聚焦、无导出副作用和视觉一致性已经闭环。下一阶段是 `G15-consented-real-library-baseline-remediation-follow-up`，只有获得用户对真实资料库的明确授权后才能执行；签名 Windows 客户端证据、`releaseCandidate` 和 `promotionEligible` 继续为 false。
