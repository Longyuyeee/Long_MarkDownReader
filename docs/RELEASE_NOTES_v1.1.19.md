# v1.1.19 · 画布与思维导图整理

本次更新继续深化已有画布与脑图：编辑更安全，文件来源更清楚，整理之后更容易接续。发布状态及安装证据以本版发布审计为准。

- Canvas/OPML保存固定快照，保存期间继续输入的内容仍保留为草稿；失败、迟到回包和同文件定位不再覆盖草稿。
- 切换文件、重新读取和关闭保护未保存内容；Ctrl+S由当前专用编辑器独占处理，不误触其他格式的保存入口。
- 画布文件来源按资料库根精确解析，失效来源显示原因并可重新指定；跨目录复制不错误改写路径。资料库内改名、移动通过现有事务和原文恢复记录同步已保存画布引用，引用改写保留其余原文字节。
- 分组拖动带上组内卡片，轻微鼠标抖动不算移动，拖动后不误触打开；撤销和手工布局继续保留。
- OPML保留普通属性、空头部字段、CDATA和实体文本。对确实不能无损保留的XML扩展，列出原因、禁止覆盖原件，允许明确确认后的防覆盖兼容副本；原件和本页草稿不变。
- 窄窗脑图调整视口中心，不改变缩放或手工位置。保留现有格式、全部工具和自定义主题。

社区安装器未签名，Windows可能提示“未知发布者”。下载后核对SHA-256，当前通过手动下载安装升级；不宣称历史托管自动更新观察完成，也不宣称企业签名RC或Office原生应用视觉等价。

操作方法见 [Canvas／OPML 用户指南](https://github.com/Longyuyeee/Long_MarkDownReader/blob/main/docs/Canvas_OPML_User_Guide.md)；验证证据与边界见 [发布审计](https://github.com/Longyuyeee/Long_MarkDownReader/blob/main/docs/V1_1_19_Unsigned_Community_Release_Audit_2026-10-18.md) 和 [开发记录](https://github.com/Longyuyeee/Long_MarkDownReader/blob/main/docs/V1_1_19_Organizing_Development_2026-10-18.md)。
