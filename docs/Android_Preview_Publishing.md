# 发布 Android 公开预览

首个公开预览使用 `android-v0.1.0-beta.1`。生产包名为 `com.longyuye.mdreader.mobile`，本地调试包使用 `com.longyuye.mdreader.mobile.dev`。后续可覆盖升级的发布包使用同一包名和签名证书，并提高 `versionCode`。[Android 更新规则](https://developer.android.com/google/play/app-updates)

Gradle 的 `applicationId` 决定安装包名。Tauri 的 Android 标识保留现有 Kotlin 与 JNI 命名空间，供两个构建变体共用。

## 构建和签名

在 Android 分支提交准备发布的源码。按本地安卓环境配置 SDK、NDK 与 JDK，然后构建 ARM64 非调试 APK。

```powershell
powershell -NoProfile -File scripts/build-mobile-preview.ps1
```

生成的 `LongEdit-Android-arm64-unsigned.apk` 与 `unsigned-build.json` 位于 `release-artifacts/android-preview-0.1.0-beta.1/`。脚本验证包名、版本、Android 10 最低版本、原生库架构和 16 KB 对齐。

由项目维护者提供长期发布密钥和签名证书 SHA-256。密钥放在受控的私有位置，密码通过本机秘密环境提供。签名脚本读取 `LONGEDIT_ANDROID_STORE_PASSWORD`，若密钥密码独立，再提供 `LONGEDIT_ANDROID_KEY_PASSWORD`。

```powershell
powershell -NoProfile -File scripts/sign-mobile-preview.ps1 `
  -KeyStore $releaseKeyStore -KeyAlias $releaseKeyAlias `
  -CertificateSha256 $releaseCertificateSha256
```

签名脚本输出 `signed/LongEdit-Android-arm64.apk` 与 `signed/SHA256SUMS.txt`，核对证书、包名、版本、ABI、可调试标记和 APK 对齐。[Android 签名工具](https://developer.android.com/tools/apksigner)

## 发布验收

在 ARM64 手机用最终签名 APK 测试首次安装、启动和实际打开资料。首版用同一证书签名的递增版本号内部包演练覆盖升级，检查资料、草稿和续读记录。以后每个公开版本从上一公开版验证升级。确认中文输入法、系统返回手势及 TalkBack 的关键路径。对于目标分发地区，核对 Android 开发者验证状态。[Android 开发者验证](https://developer.android.com/developer-verification/guides)

验收通过后，使用 [发布说明](RELEASE_NOTES_android-v0.1.0-beta.1.md) 在 GitHub 建立预发布版本。标签指向生成 APK 的已发布源码提交。附件放签名 APK 和 `SHA256SUMS.txt`，Windows 保留为最新稳定版。使用手机和无登录浏览器验证下载后，再将仓库首页的 Android 入口连接到该标签下的 APK 直链，将安装说明与二维码连接到同一发布页。[GitHub 预发布](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)
