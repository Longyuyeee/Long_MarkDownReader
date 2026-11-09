package com.longyuye.mdreader.mobile.dev

// Mobile uses inert, structuredClone, randomUUID and dynamic viewport units.
// Keep this explicit instead of treating Android's API level as a browser version.
object WebViewCompatibility {
  const val MINIMUM_MAJOR = 111
  fun supports(version: String?): Boolean {
    val major = version?.substringBefore('.')?.toIntOrNull() ?: return false
    return major >= MINIMUM_MAJOR
  }
}
