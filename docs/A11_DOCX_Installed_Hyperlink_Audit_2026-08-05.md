# A11 DOCX 安装态超链接收口审计

日期：2026-08-05

阶段：UX-33J

结论：UX-33 的有界 DOCX 页面编辑阶段已收口。GitHub U2 运行 `30967710442` 在一次性 Windows 环境完整通过，产品源码固定为 `22ac691b9fdd339aac7bdf174b3e3cb7a21dcf48`，编排源码固定为 `ade1cd06b1cd291f9d995ea94f70b97c39beb067`，无签名 `1.0.3` NSIS SHA-256 为 `f22f082bdfe857f18563c209e5ce18c1aa91de520b287be997293f31c4c697ac`。

## 验收结果

- Microsoft Word fixture：识别 2 个普通超链接；草稿、撤销、重做、隔离预览、覆盖保存提示全部通过，未执行最终覆盖，源文件哈希不变。
- LibreOffice Writer fixture：同样识别 2 个普通超链接并通过完整有界编辑交互，源文件哈希不变。
- WPS Writer fixture：字段型链接没有被冒充为普通可编辑超链接，显示为高级对象只读，源文件哈希不变。
- U2 生命周期 18/18 通过：安装、首次启动、路由与 I/O、卸载、文件关联恢复、旧版回滚、当前版恢复、管理备份恢复、索引重建和代表文件重开均成功。
- 证据仅来自仓库 fixture，路径已替换为 `<disposable-library>`，不含用户正文、真实路径或凭据。

## 边界

这是无签名内部候选包的安装态证据，`releaseCandidate=false`、`promotionEligible=false`。本阶段不宣称完整 Word 等价编辑；页眉页脚、批注、脚注、域、浮动对象及跨部件事务仍保持只读，未来必须另立阶段。

历史 `shared/r5l-management-rollback-closure-policy.json` 仍绑定 `1.0.0` 的既有证据，因此旧 R5L 静态闭包检查不能冒充本次 `1.0.3` 验收。本次版本事实由新 UX-33J 证据检查器及成功 U2 运行共同约束。

## 后续顺序

下一步进入 UX-34：处理 Drawio/Canvas 的 `ResizeObserver` 可恢复警告、重复切换/缩放/拖动稳定性和非阻断错误呈现。随后继续按体验审计表逐项收口其他未完成格式与交互。

机器验收：`npm run check:ux33j-installed-docx-evidence`

远端证据：[U2 run 30967710442](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/30967710442)
