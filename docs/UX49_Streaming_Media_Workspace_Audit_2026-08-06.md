# UX-49 媒体流式读取与视频工具审计

日期：2026-08-06  
状态：源码完成，安装态多编码回归待下一安装包

## 本轮结论

- 图片继续支持 PNG、JPEG、GIF、WebP、BMP、ICO、AVIF，保留缩放、适应窗口、旋转与透明网格；适应窗口现会响应工作区尺寸变化。
- 视频原生目标为 MP4、WebM、OGV、M4V；新增 MOV、MKV、AVI、MPEG、MPG 兼容入口。新增格式能否播放取决于 Windows、WebView2 与文件内部编码，界面必须显示该边界并保留外部打开。
- 播放器新增播放/暂停、前后 10 秒、循环、静音、0.5-2 倍速、画中画、全屏、播放进度、媒体尺寸与键盘操作。播放或画中画失败使用非阻断提示，不替换整个工作区。

## 性能与安全

- 删除 `readFile -> Blob -> object URL` 的整文件复制路径，改用 `convertFileSrc` 和 Tauri Asset Protocol。协议支持 Range 响应，视频由 WebView 按需读取和定位，减少打开大文件时的 JavaScript 内存峰值与首开等待。
- 视频应用内预算由 128 MiB 提升至 2 GiB。超过预算仍交给系统播放器，避免无限制资源占用。
- Asset Protocol 静态 scope 保持为空。后端先用 `WorkspaceGuard` 验证文件位于当前资料库、扩展名允许且大小合规，再动态授权当前规范化单文件；没有开放任意磁盘路径。
- CSP 仅增加媒体所需的 `asset:` / `http://asset.localhost` 来源。

## 已执行验证

- `npm run check:media-workspace`：通过，覆盖 8 种图片、9 种视频、流式协议、安全授权、工具能力和旧整文件路径阻断。
- `npm run build`：Vue TypeScript 与 Vite 生产构建通过。
- `cargo test --locked --manifest-path src-tauri/Cargo.toml commands::media::tests --lib`：2/2 通过。
- `cargo check --locked --manifest-path src-tauri/Cargo.toml`：通过。
- UX-43 既有真实 Tauri 证据继续证明透明 PNG、WebM、窄窗口与源文件不变；它不等同于本轮新增五种容器的安装态证据。

## 下一步验收

下一安装包使用用户可公开或自建的短样本与至少一个大 MP4，逐项检查 MP4/WebM/OGV/M4V、MOV/MKV/AVI/MPEG/MPG 的打开结果、内存峰值、首帧时间、拖动定位、倍速、循环、静音、画中画、全屏和外部打开。对系统缺少解码器的样本，合格结果是清晰提示并可外部打开，不是伪造“全部可播”。
