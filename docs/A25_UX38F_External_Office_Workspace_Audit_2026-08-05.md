# UX-38F 外部 Office 工作区审计

## 结论

UX-38F 已完成，覆盖 `.doc/.xls/.ppt/.wps/.et/.dps` 六种外部依赖格式。旧 Office 继续提供只读 OLE 风险预检和显式新副本转换；WPS 原生格式继续提供只读容器身份检查。两类工作区现在都直接显示系统默认应用、Microsoft Office、WPS Office 与 LibreOffice 的检测状态，并允许用户主动选择后交接。

LongEdit 不把外部应用能力描述为内部编辑：六种格式仍保持 `external-open / saveMode:none`。外部应用启动、后续编辑和保存由对应桌面程序负责；LongEdit 只在交接前后核对源摘要。不可用应用会显示明确原因并禁用，不要求用户猜测。

## 桌面证据

真实 Tauri Debug WebView2 在隔离临时资料库中完成六个真实 fixture 的逐项验证：

- 六种格式均成功进入对应预检或身份工作区，并显示四个应用入口。
- 六种格式从知识图谱返回后均恢复当前文件与应用选择；旧 DOC 同时恢复用户填写的目标副本路径。
- 六种格式在 760x720 窄窗口下无页面级或工作区内部横向溢出。
- 本轮没有启动外部应用，也没有执行转换；六个源文件 SHA-256 全部不变。
- 运行时错误 0，意外确认框 0，阻断错误界面 0。

证据位于 `docs/evidence/ux38f-external-office`，绑定产品提交 `84ceaf8d0e44dd7af387944fe4f38753dfef16b2`。证据不包含用户资料、完整本机路径或已安装应用名称明细。

## 下一步

UX-38 的六个格式族阶段均已完成。下一步执行 UX-38 总矩阵最终审计：清点 41/41 格式的证据路径与剩余 `partial/referenced/not-applicable` 边界，关闭已经有真实证据的缺口，但不得把有限 Office、外部打开或只读预览提升为完整等价编辑。`releaseCandidate=false` 保持不变。
