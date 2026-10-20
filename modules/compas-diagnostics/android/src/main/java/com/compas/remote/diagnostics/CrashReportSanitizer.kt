package com.compas.remote.diagnostics

/** Diagnostic text is local, but copying it must not reveal connection credentials. */
internal object CrashReportSanitizer {
  const val MAX_DETAILS = 48 * 1024
  private val authorization = Regex("""(?im)(["']?(?:proxy-)?authorization["']?\s*[:=]\s*)(?:["'][^"'\r\n]*["']|[^\r\n,;}]+)""")
  private val bearer = Regex("""(?i)\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+""")
  private val secretAssignment = Regex("""(?i)(["']?\b(?:password|passwd|(?:remote_control_)?pin|token|access[_-]?token|refresh[_-]?token|api[_-]?key|shared[_-]?secret|secret|cookie|set-cookie)\b["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}]+)""")
  private val url = Regex("""(?i)\b(?:https?|wss?)://[^\s<>"']+""")
  private val privatePath = Regex("""(?i)(?:/(?:data|storage|sdcard|home|Users|mnt|usr/data)(?:/[^\s"'<>:]+)+)""")
  private val ipv4 = Regex("""(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])""")
  private val ipv6 = Regex("""(?i)(?<![\w:])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?![\w:])""")
  private val email = Regex("""(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b""")

  fun redact(input: String): String {
    var value = input.take(MAX_DETAILS * 2)
    value = authorization.replace(value) { "${it.groupValues[1]}[REDACTED]" }
    value = bearer.replace(value) { "${it.groupValues[1]} [REDACTED]" }
    value = secretAssignment.replace(value) { "${it.groupValues[1]}[REDACTED]" }
    value = url.replace(value, "[URL REDACTED]")
    value = privatePath.replace(value, "[PRIVATE PATH REDACTED]")
    value = ipv4.replace(value, "[IP REDACTED]")
    value = ipv6.replace(value, "[IP REDACTED]")
    value = email.replace(value, "[EMAIL REDACTED]")
    return value.take(MAX_DETAILS)
  }
}
