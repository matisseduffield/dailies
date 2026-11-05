package com.matisseduffield.ladder

import android.content.Context
import android.os.SystemClock
import android.webkit.JavascriptInterface
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * The time from our server, so moving the phone's clock can't bring tomorrow's
 * puzzle early. Each reading is kept with the phone's time since boot, which
 * the clock settings don't touch, so the time carries on offline.
 *
 * Time since boot starts again on a restart. That can only make this run behind
 * the real time, so offline after a restart the next puzzle waits for a
 * connection instead of trusting the phone.
 */
class TrustedClock(context: Context) {
    private companion object {
        const val NOW_URL = "https://dailies.matisseduffield.workers.dev/now"
        const val KEY_TIME = "time"
        const val KEY_BOOT = "sinceBoot"
        const val KEY_OFFSET = "offset"
    }

    private val saved = context.getSharedPreferences("clock", Context.MODE_PRIVATE)

    /** For web/clock.js: the time and the server's zone, or empty before the first reading. */
    @JavascriptInterface
    fun read(): String {
        if (!saved.contains(KEY_TIME)) return ""
        val then = saved.getLong(KEY_BOOT, 0)
        val sinceBoot = SystemClock.elapsedRealtime()
        // Less than at the reading means a restart, and all of this boot is since then.
        val passed = if (sinceBoot >= then) sinceBoot - then else sinceBoot
        val reading = JSONObject().put("now", saved.getLong(KEY_TIME, 0) + passed)
        if (saved.contains(KEY_OFFSET)) reading.put("offset", saved.getInt(KEY_OFFSET, 0))
        return reading.toString()
    }

    /** Takes a new reading. False if the server couldn't be reached. */
    suspend fun check(): Boolean = withContext(Dispatchers.IO) {
        val conn = (URL(NOW_URL).openConnection() as HttpURLConnection).apply {
            connectTimeout = 5_000
            readTimeout = 5_000
            useCaches = false
        }
        try {
            if (conn.responseCode != 200) return@withContext false
            val reading = JSONObject(conn.inputStream.bufferedReader().readText())
            saved.edit().apply {
                putLong(KEY_TIME, reading.getLong("now"))
                putLong(KEY_BOOT, SystemClock.elapsedRealtime())
                if (reading.isNull("offset")) remove(KEY_OFFSET) else putInt(KEY_OFFSET, reading.getInt("offset"))
                apply()
            }
            true
        } catch (_: Exception) {
            false
        } finally {
            conn.disconnect()
        }
    }
}
