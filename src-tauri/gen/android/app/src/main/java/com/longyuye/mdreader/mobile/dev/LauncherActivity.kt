package com.longyuye.mdreader.mobile.dev

import android.content.ActivityNotFoundException
import android.content.Intent
import com.longyuye.longedit.storage.IncomingIntent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.webkit.WebView
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

// Check before loading Tauri's native library or starting its JavaScript bundle.
// This screen remains usable on the original Android 10 WebView and while offline.
class LauncherActivity : ComponentActivity() {
  private var launched = false
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
  }

  override fun onResume() {
    super.onResume()
    checkRuntime()
  }

  private fun checkRuntime() {
    val provider = try { WebView.getCurrentWebViewPackage() } catch (_: Exception) { null }
    if (WebViewCompatibility.supports(provider?.versionName)) {
      if (launched) return
      launched = true
      startActivity(if (IncomingIntent.supported(intent.action)) IncomingIntent.forward(intent, this, MainActivity::class.java) else Intent(this, MainActivity::class.java))
      finish()
      return
    }
    val density = resources.displayMetrics.density
    val padding = (24 * density).toInt()
    val column = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(padding, padding, padding, padding)
    }
    fun text(value: String, size: Float) = TextView(this).apply {
      text = value
      textSize = size
      setTextColor(0xff202820.toInt())
      setPadding(0, padding / 2, 0, padding / 2)
      column.addView(this)
    }
    val title = text("需要更新系统组件", 24f)
    ViewCompat.setAccessibilityHeading(title, true)
    text("Long编辑需要 Android System WebView ${WebViewCompatibility.MINIMUM_MAJOR} 或更新版本才能打开资料。", 18f)
    text("当前组件：${provider?.versionName ?: "未能检测到"}\n更新后返回此处即可重新检查。无需卸载 Long编辑，也无需清除应用数据。", 16f)
    fun button(label: String, action: () -> Unit) {
      column.addView(Button(this).apply { text = label; isAllCaps = false; setOnClickListener { action() } })
    }
    fun settings() {
      val intent = if (provider != null) Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${provider.packageName}"))
        else Intent(Settings.ACTION_APPLICATION_SETTINGS)
      try { startActivity(intent) } catch (_: ActivityNotFoundException) {
        Toast.makeText(this, "请在系统设置中查找并更新 Android System WebView。", Toast.LENGTH_LONG).show()
      }
    }
    button("更新系统组件") {
      try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=${provider?.packageName ?: "com.google.android.webview"}"))) }
      catch (_: ActivityNotFoundException) { settings() }
    }
    button("系统组件设置") { settings() }
    button("重新检查") { checkRuntime() }
    val scroll = ScrollView(this).apply { setBackgroundColor(0xfff6f7f3.toInt()); addView(column) }
    setContentView(scroll)
    ViewCompat.setOnApplyWindowInsetsListener(scroll) { view, insets ->
      val safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      view.setPadding(safe.left, safe.top, safe.right, safe.bottom)
      insets
    }
    ViewCompat.requestApplyInsets(scroll)
    title.requestFocus()
  }
}
