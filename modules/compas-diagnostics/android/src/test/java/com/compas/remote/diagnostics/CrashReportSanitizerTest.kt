package com.compas.remote.diagnostics

import org.junit.Assert.*
import org.junit.Test

class CrashReportSanitizerTest {
  @Test fun removesAuthenticationHeadersAndJsonSecrets() {
    val source = "Authorization: Bearer FAKE_TOKEN\nAuthorization: Basic FAKE_BASIC\n" +
      "{\"token\":\"FAKE_JSON\",\"pin\":\"FAKE_PIN\",\"password\":\"FAKE_PASSWORD\"}\n" +
      "X-Compas-PIN: FAKE_HEADER\nremote_control_pin=FAKE_SETTING"
    val result = CrashReportSanitizer.redact(source)
    for (secret in listOf("FAKE_TOKEN", "FAKE_BASIC", "FAKE_JSON", "FAKE_PIN", "FAKE_PASSWORD", "FAKE_HEADER", "FAKE_SETTING")) {
      assertFalse("leaked $secret", result.contains(secret))
    }
    assertTrue(result.contains("[REDACTED]"))
  }

  @Test fun removesUrlsPrivatePathsAddressesAndMail() {
    val source = "https://user:FAKE_CREDENTIAL@host.invalid/private/song?token=FAKE_QUERY " +
      "/storage/emulated/0/Music/private.flac /data/mnt/sd_0/Artist/song.flac " +
      "192.168.1.203 2001:db8::1 user@example.invalid"
    val result = CrashReportSanitizer.redact(source)
    for (secret in listOf("FAKE_CREDENTIAL", "FAKE_QUERY", "private.flac", "Artist/song", "192.168.1.203", "2001:db8::1", "user@example.invalid")) {
      assertFalse("leaked $secret", result.contains(secret))
    }
  }

  @Test fun preservesUsefulCodeLocationsAndBoundsInput() {
    val frame = "TypeError: example\n at openScreen (index.android.bundle:1:49231)\n at com.compas.MainActivity.onCreate(MainActivity.kt:38)"
    assertEquals(frame, CrashReportSanitizer.redact(frame))
    assertTrue(CrashReportSanitizer.redact("x".repeat(200_000)).length <= CrashReportSanitizer.MAX_DETAILS)
  }
}
