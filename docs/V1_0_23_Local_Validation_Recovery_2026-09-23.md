# 本机页面验证恢复与实际观察

## 结论

不需要换电脑。使用 computer-use 技能规定的 `@oai/sky` 正式 API，已完成当前源码的本机原生窗口操作、截图和无障碍文本观察。此前将一次浏览器启动拒绝推广为“本机无法验收”不成立，本页纠正该结论；没有修改 Windows 安全设置或重试被拒绝的浏览器启动命令。

产品源码：`ca8a6a0db324fbab213a30131b6e7f21f099e0cd`。运行版本/公开版本仍是 1.0.22，目标为 1.0.23，本轮不是新版本发布。

## 恢复方法

1. 按技能初始化 `@oai/sky`，从返回对象选择唯一窗口；截图前激活目标。首次未激活时出现遮挡内容，未将该截图作为产品证据保存。
2. 新增仅供本机验证的 `src-tauri/tauri.version-audit.conf.json`，独立标识 `com.longyuye.mdreader.version-audit`，独立标题，禁用打包。原 `E:/long/Long编辑/tauri-app.exe` 保留运行。
3. 在该独立标识的 Roaming 配置目录创建配置，指向被 Git 忽略的 `version-audit.local/library`，仅有一篇合成笔记。不要复制用户配置、密钥或真实资料。验证配置不进入发布命令。
4. 生产前端：`node node_modules/@tauri-apps/cli/tauri.js build --debug --no-bundle --config src-tauri/tauri.version-audit.conf.json`。这里是 **Rust debug + Vite 生产前端**，不是 release 安装包。
5. 用 `sky.launch_app` 的显式 `process:<绝对 exe 路径>` 标识启动；普通路径调用未得到独立实例，不能仅凭工具返回成功认定应用已运行。随后重新列出窗口，确认独立标题和 exe 路径。
6. 开发前端：仅在构建命令进程中设置 `TAURI_CONFIG` 为隔离配置 JSON，执行 `cargo build --locked --manifest-path src-tauri/Cargo.toml`；另起 `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 9000 --strictPort`，通过同一正式 API 启动。观察地址为 `http://127.0.0.1:9000`，与前一个 `http://tauri.localhost` 明确区分。

## 已实际完成

- 生产前端侧栏显示 v1.0.22，无 DEV；点击版本号进入“系统与更新”，显示同一版本。
- 真实 GitHub 检查返回当前/远端均为 v1.0.22。点击“打开官方发布页”后，浏览器标题确认打开 v1.0.22 GitHub Release；回到应用仍显示“当前已是最新版本”，无误报更新或安装按钮。
- 经“格式与文件 → 管理打开方式”进入能力页，显示 v1.0.22、已核对远端 v1.0.22，以及“社区版 · 未签名”。三处一致。
- 开发前端侧栏显示 v1.0.22 + DEV；更新设置显示真实 v1.0.22；能力页单独写“开发模式 · 下一目标 v1.0.23”，没有把目标版本冒充运行版本。
- 原应用保留运行；隔离应用通过自身关闭按钮退出。没有点击下载安装、默认程序注册、自动启动或隐私设置。

证据目录：`docs/evidence/v123-local-version-observation`，5 张已查看原始截图、7 份原生无障碍观察、逐文件 SHA-256 清单。开发设置和能力页截图当时含其他窗口的通知遮挡，未保存，保留目标窗口无障碍文本；不修改/裁剪原图来伪装干净截图。点击后的即时快照可能早于路由完成，均等待并重新观察，不连续使用旧索引。

校验命令：`node scripts/check-v123-local-version-observation.mjs`。这是既有原始证据一致性校验，不是再次执行 UI。

## 新发现与剩余工作

关闭行为差异：隔离配置为“直接退出”时，Alt+F4 后窗口隐藏但测试进程仍存活，导致下一次构建报文件占用；重新打开并点击应用自己的关闭按钮后正常退出。`src-tauri/src/lib.rs` 的原生 CloseRequested 分支与前端关闭按钮路径需另行统一，列入下一版候选，不在本轮环境恢复中改产品逻辑。

本机验证路径已恢复，不再要求用户换电脑。仍未完成离线/检查失败、发现更新、浏览器失败的真实页面观察，以及固定 1.0.23 安装包生命周期。13 项代码回归只能补充，不能替代这些证据。下一步沿本机独立实例补余下状态，再迁移版本、打包、安装验收和发布；不得将隔离 debug 程序发布为正式包。
