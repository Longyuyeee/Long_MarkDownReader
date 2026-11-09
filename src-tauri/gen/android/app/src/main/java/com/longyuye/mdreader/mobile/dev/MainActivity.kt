package com.longyuye.mdreader.mobile.dev

import android.os.Bundle
import android.content.res.Configuration
import android.webkit.WebView
import android.view.View
import android.view.ActionMode
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.roundToInt

class MainActivity : TauriActivity() {
  private var mobileWebView: WebView? = null
  private var mobileImeVisible = false
  private var mobileActionMode: ActionMode? = null

  override fun onActionModeStarted(mode: ActionMode) {
    super.onActionModeStarted(mode)
    mobileActionMode = mode
  }

  override fun onActionModeFinished(mode: ActionMode) {
    if (mobileActionMode === mode) mobileActionMode = null
    super.onActionModeFinished(mode)
  }

  private fun publishImeVisibility(visible: Boolean) {
    mobileImeVisible = visible
    mobileWebView?.evaluateJavascript(
      "window.__longeditMobileImeVisible=$visible;window.dispatchEvent(new CustomEvent('longedit-mobile-ime',{detail:{visible:$visible}}))", null)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    mobileWebView = webView
    webView.settings.textZoom = (resources.configuration.fontScale * 100).roundToInt()
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    val dark = (newConfig.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    super.onConfigurationChanged(newConfig)
    mobileWebView?.settings?.textZoom = (newConfig.fontScale * 100).roundToInt()
    mobileWebView?.evaluateJavascript("window.dispatchEvent(new CustomEvent('longedit-mobile-system-appearance',{detail:{dark:$dark}}))", null)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Own the native viewport on old and new WebViews alike. Zero the handled
    // insets before forwarding them so newer WebViews do not apply them twice.
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime())
      if (imeVisible != mobileImeVisible) publishImeVisibility(imeVisible)
      val handled = WindowInsetsCompat.Type.systemBars() or
        WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
      val padding = insets.getInsets(handled)
      view.setPadding(padding.left, padding.top, padding.right, padding.bottom)
      WindowInsetsCompat.Builder(insets).setInsets(handled, Insets.NONE).build()
    }
    ViewCompat.requestApplyInsets(content)
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        // A WebView selection owns the first Back, before app navigation.
        mobileActionMode?.let { it.finish(); return }
        val webView = mobileWebView
        if (webView == null) { finish(); return }
        webView.evaluateJavascript("Boolean(window.__longeditMobileBack && window.__longeditMobileBack())") { handled ->
          if (handled != "true") finish()
        }
      }
    })
  }

  override fun onPause() {
    mobileWebView?.evaluateJavascript("window.dispatchEvent(new Event('longedit-mobile-pause'))", null)
    super.onPause()
  }

  override fun onResume() {
    super.onResume()
    publishImeVisibility(mobileImeVisible)
    mobileWebView?.evaluateJavascript("window.dispatchEvent(new Event('longedit-mobile-resume'))", null)
  }
}
