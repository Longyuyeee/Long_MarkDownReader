package com.longyuye.mdreader.mobile.dev

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WebViewCompatibilityTest {
  @Test fun oldAndroidImageDoesNotOpenABlankReader() = assertFalse(WebViewCompatibility.supports("74.0.3729.185"))
  @Test fun immediatelyBelowMinimumIsBlocked() = assertFalse(WebViewCompatibility.supports("110.0.0.0"))
  @Test fun declaredMinimumIsAccepted() = assertTrue(WebViewCompatibility.supports("111.0.5563.58"))
  @Test fun testedAndroid15ProviderIsAccepted() = assertTrue(WebViewCompatibility.supports("124.0.6367.219"))
  @Test fun missingProviderHasARecoveryScreen() = assertFalse(WebViewCompatibility.supports(null))
  @Test fun unknownVersionHasARecoveryScreen() = assertFalse(WebViewCompatibility.supports("unknown"))
}
