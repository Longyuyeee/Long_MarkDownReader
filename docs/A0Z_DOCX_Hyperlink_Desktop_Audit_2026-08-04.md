# A0Z DOCX 超链接桌面 WebView 审计

日期：2026-08-04

阶段：UX-33I

结论：三生产者原生超链接在真实 Tauri Debug WebView2 中通过，UX-33 继续进行中。

## 本步完成

- 新增可重复运行的 Tauri/WebView2 专项审计，使用隔离知识库逐一打开 Microsoft Word、WPS Writer、LibreOffice Writer 原生 fixture。
- Word 与 LibreOffice 各显示 2 个“链接文字”编辑目标，并明确提示“替换链接文字（地址保持不变）”。两者均通过草稿创建、撤销、重做、隔离验证、覆盖边界提示和另存入口检查。
- WPS 的 4 个 `HYPERLINK` 字段未暴露为链接编辑目标，页面显示“高级对象保持只读”，普通安全文本目标仍可使用原有编辑器。
- 生成 5 张 1365×900 桌面截图和机器清单；三份仓库 fixture 与隔离工作副本在审计前后 SHA-256 均保持不变。

## 证据边界

本证据来自包含当前代码的真实 Tauri Debug 程序和 WebView2，不是普通浏览器模拟。它没有安装或覆盖当前机器上的 MSI/NSIS，因此不能写成“已安装包生命周期通过”。本步只执行隔离预览，不点击覆盖保存；可靠覆盖、另存和生产者复读继续由既有 Rust 事务测试负责。

证据清单：[`evidence/ux33i-docx-hyperlink-desktop/audit-manifest.json`](./evidence/ux33i-docx-hyperlink-desktop/audit-manifest.json)

运行入口：`npm run audit:ux33i-docx-hyperlink-desktop`

检查入口：`npm run check:ux33i-docx-hyperlink-desktop`

## 下一步

进入 UX-33J：使用无签名内部安装包在可丢弃环境执行安装、首次启动、三份原生 fixture 打开、草稿保护和卸载生命周期复测；不得覆盖当前用户安装，也不得把无 Authenticode 的结果提升为正式发布候选。安装态通过后再审计 UX-33 是否按“有界页面编辑器”收口。页眉页脚、批注、脚注、域和浮动对象继续保持只读，未来必须建立跨部件事务后单独开放。
