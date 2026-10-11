# F1 原生延迟保存与失败重试验收

2026-10-11，接续 `c53af998`。本轮完成真实窗口/原生命令的限定故障场景，**尚未封板**。运行版本仍为 1.0.26，目标 1.1.0。

## 测试入口

formats::write_text_document 增加 debug_assertions 条件下的故障注入。必须同时存在 LONGEDIT_E2E_LIBRARY 和 LONGEDIT_E2E_CONFIG_DIR，配置目录必须存在，命令资料库 canonical 路径必须与指定隔离库一致。LONGEDIT_E2E_TEXT_SAVE_DELAY_MS 为延迟毫秒数（上限 30000，缺失/无效为 0）；LONGEDIT_E2E_TEXT_SAVE_FAIL_ONCE=1 在进程内首次匹配请求返回一次测试错误。

函数及调用在 release 构建中均被条件编译移除。延迟放在 spawn_blocking，不占用 UI 线程；未修改签名检查、安全写入或正常保存回执。故障发生在实际文件写入前，不模拟写到一半、磁盘满或断电恢复。未改前端或布局。

## 实际操作与证据

按 computer-use 技能操作独立 debug 窗口，未操作安装版资料。沿用隔离目录 `C:/Users/Administrator/AppData/Local/Temp/longedit-save-audit-65e4c43702054ae5a1450afcda27405d`。启动配置延迟 30000ms、首次失败，stderr 记录在该目录 native-fault.log。

1. 正文末尾输入“先记下客户要求。”，Ctrl+S。原生日志出现 begin delay_ms=30000 fail=true。
2. 在日志尚无 end 时输入“保存时补充交付日期。”；磁盘仍为此前正文。首次 end fail=true 后，页面两句完整保留，标签仍有未保存圆点。没有及时捕获短暂错误 toast，不将错误提示视觉验收标为通过。
3. Ctrl+S 主动重试，日志 begin delay_ms=30000 fail=false；等待期间再输入“重试期间再记一条。”。
4. 重试 end fail=false 后，磁盘含前两句但不含第三句；实际页面第三句仍在、未保存圆点仍在。期间截图被其他窗口遮挡，重新激活隔离窗口确认，不把遮挡误判为应用渲染故障。
5. 再 Ctrl+S，第三组 begin/end fail=false 后，磁盘包含连续三句，页面未保存圆点消失。最终内容断言通过，文件 SHA256：`BE5096638FD6ADAF2263A626EB5742ABE2D842656559CC50E6B0FD9B95A10F29`。

可传递的原生日志摘要（不含用户资料）：

```text
[text-save-audit] begin delay_ms=30000 fail=true
[text-save-audit] end fail=true
[text-save-audit] begin delay_ms=30000 fail=false
[text-save-audit] end fail=false
[text-save-audit] begin delay_ms=30000 fail=false
[text-save-audit] end fail=false
```

成功写入仍经过真实签名校验；未直接读取运行时签名字段，不能声称独立完成签名观测。截图仅在会话中，临时日志/资料保留；本轮 app/Vite 收尾停止。

## 自动验证

- debug `cargo build --locked --manifest-path src-tauri/Cargo.toml` 通过。
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib commands::formats::tests -- --nocapture`：12 passed。
- `node --test scripts/test-main-text-load-lifecycle.mjs scripts/test-main-text-save-lifecycle.mjs`：16 passed。
- `npx vue-tsc --noEmit`、`git diff --check`：通过。
- 未构建 release 安装包；release 排除依据条件编译代码审计。本轮构建后仅调整 Rust 代码排版，逻辑未再改动。

## 下一步

用本轮入口继续真实路由离开/返回、模式切换、空正文和重复保存场景；补错误提示观察。再审计其他编辑器状态、接跨窗口新鲜确认及归档写回/恢复/索引。测试入口不授权归档执行，不代表跨窗口或崩溃恢复完成。版本目标展示偏移与快速笔记索引提示仍待核查，不能封板或发布 1.1.0。
