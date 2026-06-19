package edu.cpcc.degreeexplorer

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

class KioskActivity : Activity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = false
            cacheMode = WebSettings.LOAD_NO_CACHE
            mediaPlaybackRequiresUserGesture = false
            setSupportZoom(false)
            builtInZoomControls = false
            textZoom = 100
        }
        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false
        webView.setOnLongClickListener { true }      // suppress text-selection/context menu
        webView.isLongClickable = false

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                // Content is fully local; refuse to navigate off the bundled site.
                return req.url.scheme != "file"
            }
        }
        webView.loadUrl("file:///android_asset/index.html?signage=1")
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
