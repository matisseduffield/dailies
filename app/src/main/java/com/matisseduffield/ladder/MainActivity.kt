package com.matisseduffield.ladder

import android.annotation.SuppressLint
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.os.Bundle
import android.os.SystemClock
import android.view.HapticFeedbackConstants
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.net.toUri
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.lifecycleScope
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.matisseduffield.ladder.updates.AppUpdates
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Hosts web/index.html, the hub, and the games in the folders beside it
 * (bundled as assets) in a WebView. The asset loader serves them from a real
 * https origin, so localStorage behaves exactly as it does in a browser. A
 * message bridge, limited to that origin, lets a page drive Back, sharing,
 * haptics and update checks.
 */
class MainActivity : ComponentActivity() {
    private companion object {
        const val APP_HOST = WebViewAssetLoader.DEFAULT_DOMAIN
        const val APP_ORIGIN = "https://$APP_HOST"
        const val START_URL = "$APP_ORIGIN/assets/index.html"
        const val BRIDGE_NAME = "ladderApp"
        const val CLOCK_NAME = "ladderClock"
        const val CLOCK_INTERVAL_MS = 15 * 60 * 1000L
        // A failed check goes again while the app is open: a phone just
        // restarted is often a minute away from a signal.
        val CLOCK_RETRIES_MS = longArrayOf(0, 10_000, 30_000, 90_000)

        // A game's ladderBack() closes a sheet or leaves practice, and says
        // whether it did anything. If not, Back goes to the page before it.
        const val BACK_JS = "(() => typeof ladderBack === 'function' && ladderBack() === true)()"
    }

    private lateinit var web: WebView
    private val clock by lazy { TrustedClock(this) }
    private var lastClockCheck = 0L
    private var clockCheck: Job? = null
    private var renderGone = false
    private val updates = AppUpdates(this, ::send)
    private var page: JavaScriptReplyProxy? = null
    private var pageWantsBack = false

    // With the bridge, Back is only intercepted while there's somewhere to go
    // back to (a game's "back" message, or the hub behind a game), so the
    // system's predictive back gesture works on the hub.
    private val pageBack = object : OnBackPressedCallback(false) {
        override fun handleOnBackPressed() {
            web.evaluateJavascript(BACK_JS) { handled ->
                if (handled != "true" && web.canGoBack()) web.goBack()
            }
        }
    }

    private fun updateBack() {
        pageBack.isEnabled = pageWantsBack || web.canGoBack()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        val night = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = !night
            isAppearanceLightNavigationBars = !night
        }

        val assets = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this).apply {
            setBackgroundColor(getColor(R.color.page_bg))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            // Follow the phone's font size setting.
            settings.textZoom = (resources.configuration.fontScale * 100).toInt()
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ): WebResourceResponse? = assets.shouldInterceptRequest(request.url)

                override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                    pageWantsBack = false
                }

                // The hub is the bottom of the stack, however it was reached,
                // so Back there leaves the app.
                override fun onPageFinished(view: WebView, url: String) {
                    if (url == START_URL) view.clearHistory()
                    updateBack()
                }

                override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
                    updateBack()
                }

                // If Android ends the page's renderer (low memory), start the
                // screen again rather than letting the whole app crash.
                override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                    // From the hub, not the page that may have run it out of memory.
                    renderGone = true
                    recreate()
                    return true
                }

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.url.host == APP_HOST) return false
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
                    return true
                }
            }
        }

        val root = FrameLayout(this).apply {
            setBackgroundColor(getColor(R.color.page_bg))
            addView(web)
        }
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
            )
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            WindowInsetsCompat.CONSUMED
        }
        setContentView(root)

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, BRIDGE_NAME, setOf(APP_ORIGIN)) { _, message, origin, isMainFrame, reply ->
                if (isMainFrame && origin == APP_ORIGIN.toUri()) onPageMessage(message, reply)
            }
            onBackPressedDispatcher.addCallback(this, pageBack)
        } else {
            // Older WebView without the bridge: always ask the page first.
            onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    web.evaluateJavascript(BACK_JS) { handled ->
                        if (handled == "true") return@evaluateJavascript
                        if (web.canGoBack()) web.goBack() else moveTaskToBack(true)
                    }
                }
            })
        }
        web.addJavascriptInterface(clock, CLOCK_NAME)
        // A theme or font change, or Android ending the app in the background,
        // rebuilds the screen: carry on with the page that was open. It loads
        // afresh, so it reads the clock, says hello and takes the new colours.
        if (savedInstanceState?.let { web.restoreState(it) } == null) web.loadUrl(START_URL)

        updates.start(firstCreate = savedInstanceState == null)
    }

    // Out of sight, the page's timers stop entirely; they resume (and catch
    // up with a new day) as soon as the app is back.
    override fun onResume() {
        super.onResume()
        web.onResume()
        web.resumeTimers()
        maybeCheckClock()
        updates.onResume()
    }

    override fun onPause() {
        clockCheck?.cancel()
        web.onPause()
        web.pauseTimers()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (!renderGone) web.saveState(outState)
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    // Time since boot carries the reading between checks, so these are only for a
    // restart or a new time zone. A failed check tries a few more times while the
    // app is open, then again on the next open.
    private fun maybeCheckClock() {
        val sinceBoot = SystemClock.elapsedRealtime()
        if (lastClockCheck != 0L && sinceBoot - lastClockCheck < CLOCK_INTERVAL_MS) return
        if (clockCheck?.isActive == true) return
        clockCheck = lifecycleScope.launch {
            for (wait in CLOCK_RETRIES_MS) {
                delay(wait)
                if (clock.check()) {
                    lastClockCheck = SystemClock.elapsedRealtime()
                    web.evaluateJavascript("dispatchEvent(new Event('clock'))", null)
                    return@launch
                }
            }
        }
    }

    private fun onPageMessage(message: WebMessageCompat, reply: JavaScriptReplyProxy) {
        val msg = runCatching { JSONObject(message.data ?: return) }.getOrNull() ?: return
        when (msg.optString("type")) {
            "hello" -> {
                page = reply
                send(JSONObject().put("type", "info").put("version", BuildConfig.VERSION_NAME).put("updates", BuildConfig.SELF_UPDATER))
                updates.onPageReady()
            }
            "back" -> {
                pageWantsBack = msg.optBoolean("enabled")
                updateBack()
            }
            "share" -> runCatching {
                val send = Intent(Intent.ACTION_SEND)
                    .setType("text/plain")
                    .putExtra(Intent.EXTRA_SUBJECT, msg.optString("title"))
                    .putExtra(Intent.EXTRA_TEXT, msg.optString("text"))
                startActivity(Intent.createChooser(send, null))
            }
            // System tap feedback; Android skips it if touch feedback is off.
            "haptic" -> web.performHapticFeedback(
                if (msg.optString("kind") == "tick") HapticFeedbackConstants.CLOCK_TICK
                else HapticFeedbackConstants.VIRTUAL_KEY,
            )
            "checkUpdate" -> updates.checkNow()
            "installUpdate" -> updates.installPending()
        }
    }

    // Only reachable when WEB_MESSAGE_LISTENER is supported: [page] is set by a bridge message.
    @SuppressLint("RequiresFeature")
    private fun send(json: JSONObject) {
        runCatching { page?.postMessage(json.toString()) }
    }

}
