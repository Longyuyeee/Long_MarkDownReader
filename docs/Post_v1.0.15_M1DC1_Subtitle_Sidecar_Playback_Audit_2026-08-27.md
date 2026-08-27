# M1D-C1 外置字幕 Sidecar 播放审计

日期：2026-08-27
开发目标：`1.0.16`
运行时与当前公开版本：`1.0.15`
结论：M1D-C1 已通过，下一步进入 M1 总退出条件审计。

## 1. 开发目标

为资料库内视频补齐同目录、同名 `.vtt` / `.srt` 字幕发现、时间同步、轨道选择和关闭。视频与字幕始终只读；外部浮动窗口字幕、嵌入字幕拆封、字幕源码编辑和视频转码不在本阶段。

## 2. 实现边界

- Rust 先用 `WorkspaceGuard` 校验资料库与视频路径，再只匹配同目录同名 VTT/SRT。
- 单份字幕最大 2 MiB、最多 10,000 个 cue；空文件、无时间片、错误时间戳、结束早于开始和损坏文件头均拒绝。
- VTT 经过有界校验；SRT 在内存中转换为 WebVTT 时间格式，同时输出结构化 cue，不改写 sidecar。
- 前端用原生 `addTextTrack()` / `VTTCue` 注入内存轨道，默认启用首轨，并提供 VTT、SRT 与“字幕关闭”。
- 每次重新打开视频都重建视频元素与轨道，避免不可删除的浏览器 TextTrack 跨文档累积。

## 3. 预期、基线与实际

| 项目 | M1D-C 基线 | M1D-C1 真实实际 | 结果 |
| --- | --- | --- | --- |
| 字幕发现 | `textTracks=0`，无字幕入口 | 同名 VTT/SRT 形成 2 条轨道和 3 个选择项 | 通过 |
| VTT 时间同步 | 不可播放 | `0.6s` 的 `activeCues` 为 `VTT first cue` | 通过 |
| SRT 时间同步 | 不可播放 | 切换后 `1.6s` 的 `activeCues` 为 `SRT second cue` | 通过 |
| 关闭字幕 | 无控制 | 两轨均为 `disabled`，活动 cue 为 0 | 通过 |
| 跨格式重开 | 未实现 | 打开 TXT 后再回视频，重新发现 2 轨且首轨 2 cue | 通过 |
| 损坏字幕 | 未验证 | 缺少 `WEBVTT` 文件头时明确拒绝 | 通过 |
| 安全与布局 | 源摘要不变、无溢出 | 全部源 SHA-256 不变，960×720 溢出 0，运行时错误 0 | 通过 |

## 4. 真实差异驱动的修正

第一版使用 Blob URL 生成 `<track>`。真实 WebView2 中元素存在，但 60 秒后 cue 仍为 0，因此未验收。第二版向无 `src` 的 `<track>` 注入 cue，真实探针显示 `readyState=3`，WebView2 会清空 cue 并错误启用两轨。最终改为 `video.addTextTrack()` 与原生 `VTTCue`，并按视频打开周期重建 DOM。第三条路径在真实时间片、轨道切换和重开测试中通过。

验收没有把失败条件改成“按钮可见”，而是始终要求浏览器返回正确的 `activeCues` 文本。

## 5. 证据与后续

- `npm run audit:post-v115-m1dc1-subtitle-playback`：生成真实 1280×720 WebM、VTT、SRT、损坏 VTT 与跨格式 TXT，并执行 Tauri/WebView2 验收。
- `npm run check:post-v115-m1dc1-subtitle-playback`：校验实现、证据、安全边界和后续阶段。
- 脱敏证据位于 `docs/evidence/post-v115-m1dc1-subtitle-playback/`，不保留视频、字幕正文或本机完整路径。
- 下一步只审计 M1 总退出条件、能力事实源与剩余缺口；通过审计前不进入 M3 或 M4，不提升运行时版本，也不标记发布候选。
