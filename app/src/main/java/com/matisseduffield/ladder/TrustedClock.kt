package com.matisseduffield.ladder

import android.content.Context
import android.content.SharedPreferences
import android.os.SystemClock
import android.provider.Settings
import android.webkit.JavascriptInterface
import androidx.core.content.edit
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
 * Time since boot starts again on a restart, so each reading also keeps the
 * phone's own clock and its boot count. After a restart the time moves on by
 * however far the phone's clock has, and never by less than this boot has
 * lasted, nor back before the reading. That trusts the phone's clock once per
 * restart: someone who sets it forward and restarts with no signal gets the next
 * puzzle early, until a server reading puts it right. Without it, everyone who
 * restarts overnight with no signal is held on yesterday, which is worse. From
 * then on, this boot runs on time since boot again, so moving the clock later
 * changes nothing.
 */
class TrustedClock(context: Context) {
    private companion object {
        const val NOW_URL = "https://dailies.matisseduffield.workers.dev/now"
        const val KEY_TIME = "time"
        const val KEY_BOOT = "sinceBoot"
        const val KEY_WALL = "wall"
        const val KEY_BOOTS = "boots"
        const val KEY_OFFSET = "offset"
    }

    private val saved = context.getSharedPreferences("clock", Context.MODE_PRIVATE)
    // Can't change while the app is running, and read() is called often.
    private val boots by lazy { Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, -1) }

    // Keeps a time as if read just now, with this boot's marks to carry it on.
    private fun keep(time: Long, edit: SharedPreferences.Editor) {
        edit.putLong(KEY_TIME, time)
            .putLong(KEY_BOOT, SystemClock.elapsedRealtime())
            .putLong(KEY_WALL, System.currentTimeMillis())
            .putInt(KEY_BOOTS, boots)
    }

    /** For web/clock.js: the time and the server's zone, or empty before the first reading. */
    @JavascriptInterface
    @Synchronized
    fun read(): String {
        if (!saved.contains(KEY_TIME)) return ""
        val time = saved.getLong(KEY_TIME, 0)
        val then = saved.getLong(KEY_BOOT, 0)
        val sinceBoot = SystemClock.elapsedRealtime()
        val savedBoots = saved.getInt(KEY_BOOTS, -1)
        // The boot count says for sure; without it, less time since boot than at the reading.
        val restarted = if (boots >= 0 && savedBoots >= 0) boots != savedBoots else sinceBoot < then
        val now = if (!restarted) {
            time + (sinceBoot - then)
        } else {
            // All of this boot is since the reading, so it's the least that's passed.
            val wall = if (saved.contains(KEY_WALL)) System.currentTimeMillis() - saved.getLong(KEY_WALL, 0) else 0L
            val estimate = time + maxOf(sinceBoot, wall)
            saved.edit { keep(estimate, this) }
            estimate
        }
        val reading = JSONObject().put("now", now)
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
            synchronized(this@TrustedClock) {
                saved.edit {
                    keep(reading.getLong("now"), this)
                    if (reading.isNull("offset")) remove(KEY_OFFSET) else putInt(KEY_OFFSET, reading.getInt("offset"))
                }
            }
            true
        } catch (_: Exception) {
            false
        } finally {
            conn.disconnect()
        }
    }
}
