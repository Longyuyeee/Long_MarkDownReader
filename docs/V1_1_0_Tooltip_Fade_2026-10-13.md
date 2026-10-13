# 下拉展开时悬停提示平滑退场

用户反馈：下拉框出现时浮窗立刻消失，视觉像闪烁。当前基线为 `fffb7f9d`。

## 原因与修改

应用提示原本有 opacity/transform 退场及延迟 visibility 隐藏；但点击时 `dismiss` 设置 `data-dismissed`，菜单打开状态又通过 CSS 强制 `transition: none` 和立即隐藏，覆盖了正常退场。

删除应用提示的硬隐藏标记与菜单状态下的硬隐藏规则。点击、键盘激活和弹层监测仍立即取消待显示计时器，更新提示的可见状态及无障碍描述；已经显示的提示按现有动效速度淡出。菜单开放期间不允许新提示出现。

Naive tooltip 与 Vditor 工具栏伪元素在菜单打开时也使用透明度过渡、延迟 visibility 隐藏，不再直接 display:none。正常动效下跟随原 motion-fast（swift 90ms、expressive 130ms、calm 160ms）；应用及系统减少动效偏好继续生效。拖文件期间的强制关闭规则保持原样。

## 验证

- `scripts/test-tooltip-fade-browser.mjs`：实际 App／下拉／提示组件，鼠标三档速度及键盘激活共四组逐帧采样通过。中间透明度存在且单调下降，最终 opacity=0／visibility=hidden；菜单期间没有提示反弹，选项仍可点击，系统减少动效时立即退场。
- `scripts/test-tooltip-popup-browser.mjs`：原有10类交互回归通过，涵盖浅/深色、快速点击、键盘、选项点选、文档操作、标签/重命名、格式菜单、右键和设置字体下拉。旧“立即隐藏”断言改为检查过渡完成后的隐藏，并通过新增逐帧检查验证过渡本身；保留原有无重现、菜单点击、描述恢复和无文档写入断言。
- `scripts/check-v115-global-tooltip-policy.mjs` 通过，`npm run build` 与 `git diff --check` 通过。
- 实际悬停和展开后页面截图已经查看，证据：[逐帧结果](evidence/v110-tooltip-fade/results.json)、[提示显示](evidence/v110-tooltip-fade/hover.png)、[菜单展开](evidence/v110-tooltip-fade/menu.png)。浏览器使用真实 Vue/Vditor 与模拟原生 IPC；没有接管电脑输入。

本次是现有交互的动效修复，保留各菜单及原有提示规则。不提升版本、不发布安装包。
