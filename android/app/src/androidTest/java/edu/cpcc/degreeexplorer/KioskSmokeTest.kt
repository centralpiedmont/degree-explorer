package edu.cpcc.degreeexplorer

import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class KioskSmokeTest {
    @Test
    fun loadsSiteWithSignageAndNoEmailButton() {
        ActivityScenario.launch(KioskActivity::class.java).use { scenario ->
            // Poll until the page renders (body text > 0) or time out after 15s.
            var bodyLen = 0
            val deadline = System.currentTimeMillis() + 15_000L
            while (bodyLen <= 0 && System.currentTimeMillis() < deadline) {
                Thread.sleep(1000)
                bodyLen = evalInt(scenario, "document.body ? document.body.innerText.length : 0")
            }
            val emailCount = evalInt(scenario, "document.querySelectorAll('.email').length")
            assertTrue("page should render content (bodyLen=$bodyLen)", bodyLen > 0)
            assertEquals("no email button under ?signage=1", 0, emailCount)
        }
    }

    private fun evalInt(scenario: ActivityScenario<KioskActivity>, js: String): Int {
        val latch = CountDownLatch(1)
        var result = -1
        scenario.onActivity { act ->
            val wv = (act.findViewById<android.view.View>(android.R.id.content) as android.view.ViewGroup)
                .getChildAt(0) as WebView
            wv.evaluateJavascript(js) { v ->
                result = v.trim('"').toIntOrNull() ?: -1
                latch.countDown()
            }
        }
        latch.await(5, TimeUnit.SECONDS)
        return result
    }
}
