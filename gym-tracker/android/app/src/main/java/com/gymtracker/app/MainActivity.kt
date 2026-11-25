package com.gymtracker.app

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.documentfile.provider.DocumentFile
import androidx.webkit.WebViewAssetLoader
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import org.json.JSONObject

/**
 * Coquille native : affiche l'interface web embarquée (assets) dans une WebView plein écran
 * et fournit à la page trois services natifs via l'objet JavaScript "Android" :
 *  - scanner de codes-barres (Google Code Scanner),
 *  - dossier de données choisi par l'utilisateur (copie automatique de gym-tracker.json),
 *  - enregistrement / restauration d'une copie de sauvegarde.
 */
class MainActivity : ComponentActivity() {

    companion object {
        private const val PREFS = "gym"
        private const val KEY_TREE = "tree_uri"
        private const val FILE_NAME = "gym-tracker.json"
    }

    private lateinit var web: WebView
    private var pendingSaveJson: String? = null

    // ---- sélecteurs de fichiers / dossiers (Storage Access Framework) ----

    private val pickFolder =
        registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri: Uri? ->
            if (uri == null) {
                callJs("onFolder", "null")
            } else {
                contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                )
                getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_TREE, uri.toString()).apply()
                val hasFile = findBackupFile() != null
                callJs("onFolder", "{\"ok\":true,\"hasFile\":$hasFile}")
            }
        }

    private val createDoc =
        registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri: Uri? ->
            val json = pendingSaveJson
            pendingSaveJson = null
            if (uri == null || json == null) {
                callJs("onSaved", "false")
            } else {
                val ok = try {
                    contentResolver.openOutputStream(uri, "wt")?.use { it.write(json.toByteArray(Charsets.UTF_8)) } != null
                } catch (e: Exception) {
                    false
                }
                callJs("onSaved", ok.toString())
            }
        }

    private val openDoc =
        registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
            if (uri == null) {
                callJs("onRestore", "null")
            } else {
                val text = try {
                    contentResolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
                } catch (e: Exception) {
                    null
                }
                callJs("onRestore", if (text == null) "null" else JSONObject.quote(text))
            }
        }

    // ---- dossier de données ----

    /** Dossier choisi, seulement si la permission d'écriture est toujours valable. */
    private fun dataFolder(): DocumentFile? {
        val saved = getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_TREE, null) ?: return null
        val uri = Uri.parse(saved)
        val granted = contentResolver.persistedUriPermissions.any { it.uri == uri && it.isWritePermission }
        if (!granted) return null
        return DocumentFile.fromTreeUri(this, uri)?.takeIf { it.canWrite() }
    }

    private fun findBackupFile(): DocumentFile? = dataFolder()?.findFile(FILE_NAME)

    // ---- appels vers la page web ----

    /** Appelle window.__native.<fn>(<argJs>) ; argJs est du JavaScript déjà valide ("null", "true", chaîne JSON...). */
    private fun callJs(fn: String, argJs: String) {
        runOnUiThread {
            web.evaluateJavascript(
                "window.__native && window.__native.$fn && window.__native.$fn($argJs)",
                null
            )
        }
    }

    private fun startScan() {
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(
                Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8,
                Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E
            )
            .build()
        GmsBarcodeScanning.getClient(this, options).startScan()
            .addOnSuccessListener { barcode -> callJs("onScan", JSONObject.quote(barcode.rawValue ?: "")) }
            .addOnCanceledListener { callJs("onScan", "null") }
            .addOnFailureListener { e -> callJs("onScanError", JSONObject.quote(e.message ?: "erreur inconnue")) }
    }

    /** Méthodes appelables depuis la page : window.Android.xxx() (exécutées hors du thread principal). */
    inner class Bridge {
        @JavascriptInterface
        fun hasFolder(): Boolean = dataFolder() != null

        @JavascriptInterface
        fun chooseFolder() {
            runOnUiThread { pickFolder.launch(null) }
        }

        @JavascriptInterface
        fun writeBackup(json: String): Boolean {
            return try {
                val dir = dataFolder() ?: return false
                val file = dir.findFile(FILE_NAME) ?: dir.createFile("application/json", FILE_NAME) ?: return false
                contentResolver.openOutputStream(file.uri, "wt")?.use { it.write(json.toByteArray(Charsets.UTF_8)) } != null
            } catch (e: Exception) {
                false
            }
        }

        @JavascriptInterface
        fun readBackup(): String? {
            return try {
                val file = findBackupFile() ?: return null
                contentResolver.openInputStream(file.uri)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
            } catch (e: Exception) {
                null
            }
        }

        @JavascriptInterface
        fun saveCopy(json: String, name: String) {
            pendingSaveJson = json
            runOnUiThread { createDoc.launch(name) }
        }

        @JavascriptInterface
        fun restoreFromFile() {
            runOnUiThread { openDoc.launch(arrayOf("*/*")) }
        }

        @JavascriptInterface
        fun scanBarcode() {
            runOnUiThread { startScan() }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        web = WebView(this)
        web.setBackgroundColor(0xFF0E0F11.toInt())
        setContentView(web)

        // Sert les fichiers embarqués (assets) sous une origine https sécurisée.
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assetLoader.shouldInterceptRequest(request.url)
        }
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true // IndexedDB : base de données locale de l'appli
        web.settings.allowFileAccess = false
        web.settings.allowContentAccess = false
        web.addJavascriptInterface(Bridge(), "Android")

        // Retour : la page ferme d'abord sa fenêtre ouverte ; sinon on quitte l'appli.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript(
                    "window.__native && window.__native.onBack && window.__native.onBack()"
                ) { result -> if (result != "true") finish() }
            }
        })

        web.loadUrl("https://appassets.androidplatform.net/index.html")
    }

    override fun onPause() {
        super.onPause()
        web.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }
}
