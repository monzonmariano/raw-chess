package com.mariano.rawchess

import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.lifecycle.lifecycleScope
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val credentialManager = CredentialManager.create(this)

        // NOTE: We will set up this Client ID next!
        val googleIdOption = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId("332358829658-ih7g4lag9svuknaoo48qief75oafuqho.apps.googleusercontent.com") 
            .build()

        val request = GetCredentialRequest.Builder()
            .addCredentialOption(googleIdOption)
            .build()

        lifecycleScope.launch {
            try {
                val result = credentialManager.getCredential(
                    context = this@MainActivity,
                    request = request
                )
                
                val credential = result.credential
                if (credential is androidx.credentials.CustomCredential && 
                    credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                    
                    val googleIdTokenCredential = GoogleIdTokenCredential.createFrom(credential.data)
                    val playerName = googleIdTokenCredential.displayName ?: "Player"
                    launchWebView(playerName)
                }
            } catch (e: Exception) {
                launchWebView("Guest")
            }
        }
    }

    private fun launchWebView(playerName: String) {
        val webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccessFromFileURLs = true
        webView.settings.allowUniversalAccessFromFileURLs = true

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                view?.evaluateJavascript("window.playerName = '$playerName';", null)
            }
        }
        webView.loadUrl("file:///android_asset/index.html")
        setContentView(webView)
    }
}
