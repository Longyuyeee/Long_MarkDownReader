package com.longyuye.longedit.storage

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.res.Configuration
import android.content.res.Resources
import android.graphics.Color
import android.view.View
import androidx.core.view.WindowCompat
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.DocumentsContract
import android.database.Cursor
import android.provider.OpenableColumns
import android.util.AtomicFile
import android.util.Base64
import android.webkit.WebView
import java.util.concurrent.atomic.AtomicInteger
import androidx.activity.result.ActivityResult
import androidx.documentfile.provider.DocumentFile
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

@InvokeArg
class StorageArgs {
    var op: String = ""
    var rootId: String = "local"
    var relativePath: String = ""
    var content: String = ""
    var surface: String = "default"
    var expectedSignature: String? = null
    var expectedRevision: String = ""
    var revision: Long = 0
    var recoveryId: String = ""
    var version: String = "candidate"
    var imageId: String = ""
    var importId: String = ""
    var sourceRootId: String = "local"
    var sourcePath: String = ""
    var all: Boolean = false
    var packId: String = ""
    var assets: Array<PackAssetArgs> = emptyArray()
}

/** IO is serialized. The frontend supplies identities, never arbitrary URIs or absolute paths. */
@TauriPlugin
class StoragePlugin(private val activity: Activity) : Plugin(activity) {
    private val io = Executors.newSingleThreadExecutor()
    private var incomingWebView: WebView? = null
    private val incomingJobs = AtomicInteger(0)
    private val incomingPrefs get() = activity.getSharedPreferences("longedit-incoming-v1", 0)
    override fun load(webView: WebView) { incomingWebView = webView; receiveIncoming(activity.intent) }
    override fun onNewIntent(intent: Intent) { receiveIncoming(intent) }
    private fun notifyIncoming() { activity.runOnUiThread { incomingWebView?.evaluateJavascript("window.dispatchEvent(new Event('longedit-mobile-incoming'))", null) } }
    private fun receiveIncoming(intent: Intent) {
        if (!IncomingIntent.supported(intent.action)) return
        val delivery = Intent(intent)
        // A lifecycle callback must not consume the same cold-start payload twice.
        if (activity.intent === intent) activity.intent = Intent(Intent.ACTION_MAIN)
        if (incomingJobs.incrementAndGet() > 8) {
            incomingJobs.decrementAndGet()
            incomingPrefs.edit().putString("error", "接收任务较多，请待当前完成后重新分享；本次没有导入。").putString("errorKind", if (IncomingIntent.pdfMime(delivery.type)) "pdf" else if (IncomingIntent.archiveMime(delivery.type)) "pack" else "text").commit()
            notifyIncoming(); return
        }
        try { io.execute {
            var incomingKind = if (IncomingIntent.pdfMime(delivery.type)) "pdf" else if (IncomingIntent.archiveMime(delivery.type)) "pack" else "text"
            try {
                val id = delivery.getStringExtra(IncomingIntent.ID)?.takeIf { recoveryIdPattern.matches(it) } ?: UUID.randomUUID().toString()
                if (fileImportFile(id).exists() || File(fileImportFile(id).path + ".bak").exists()) { fileImportRecord(id) }
                else if (pdfIntakes.contains(id)) { /* Private intake survives temporary grants and replay. */ }
                else if (packIntakes.contains(id)) { /* Already retained; do not reopen a temporary source grant. */ }
                else {
                    val payload = IncomingIntent.extract(delivery, activity.packageName)
                    if (payload.uri != null) {
                        IncomingIntent.requireReadGrant(payload.uri, activity)
                        val name = displayName(payload.uri)
                        if (name.endsWith(".pdf",true) || IncomingIntent.pdfMime(delivery.type) || IncomingIntent.pdfMime(activity.contentResolver.getType(payload.uri))) { incomingKind = "pdf"; pdfIntakes.stage(name, payload.source, id) { readUri(payload.uri,20*1024*1024) } }
                        else if (Regex("(?i).*\\.(textpack(\\.zip)?|zip)$").matches(name) || IncomingIntent.archiveMime(delivery.type)) { incomingKind = "pack"; stagePackFile(payload.uri, name, payload.source, id) }
                        else stageTextFile(payload.uri, payload.source, id)
                    }
                    else stageSharedText(payload.text ?: "", payload.name, id)
                }
            } catch (error: Exception) {
                val message = if (error is IllegalArgumentException) error.message ?: "收到的内容无法读取，请重新分享。" else errorMessage(error, "importTextFile")
                if (!incomingPrefs.edit().putString("error", message.take(500)).putString("errorKind", incomingKind).commit()) activity.runOnUiThread {
                    android.widget.Toast.makeText(activity, "接收未完成，本机记录无法保存；请稍后重新分享。", android.widget.Toast.LENGTH_LONG).show()
                }
            } finally { incomingJobs.decrementAndGet(); notifyIncoming() }
        } } catch (_: java.util.concurrent.RejectedExecutionException) { incomingJobs.decrementAndGet() }
    }
    private val pickerBusy = AtomicBoolean(false)
    private val packs by lazy { PackExports(File(activity.filesDir, "pack-exports-v1")) }
    private val pdfIntakes by lazy { PdfImports(activity.filesDir) }
    private val packIntakes by lazy { PackImports(activity.filesDir) }
    override fun onDestroy() { io.shutdown(); super.onDestroy() }
    private val prefs = activity.getSharedPreferences("longedit-mobile-roots-v1", 0)
    private val library get() = File(activity.filesDir, "library").apply { mkdirs() }
    private val drafts get() = File(activity.filesDir, "drafts-v1").apply { mkdirs() }
    private val limit = 4 * 1024 * 1024
    private val rootIdPattern = Regex("[0-9a-f]{64}")
    private val recoveryIdPattern = Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
    private val recoveryDirectory get() = File(activity.filesDir, "write-recovery")
    private val imageDirectory get() = File(activity.filesDir, "image-imports-v1").apply { mkdirs() }
    private val fileImportDirectory get() = File(activity.filesDir, "text-imports-v1")
    private fun obj(vararg fields: Pair<String, Any?>) = JSObject().apply {
        fields.forEach { put(it.first, it.second ?: JSONObject.NULL) }
    }
    private fun fail(message: String): Nothing = throw IllegalStateException(message)
    private fun errorMessage(error: Exception, op: String): String = when (error) {
        is SecurityException -> if (op == "importTextFile") "PERMISSION: 没有收到文件的读取授权，或来源已不可用；请从来源应用重新分享或重新选择文件。原文件未改动。"
            else "PERMISSION: 资料库访问授权已失效，请重新选择；私有草稿仍保留。"
        is java.nio.charset.CharacterCodingException -> "UNSUPPORTED: 当前仅支持 UTF-8 文本，原文件未改动。"
        is java.io.IOException -> if (op == "importTextFile") "READ_FAILED: 导入未完成，请检查源文件访问或本机空间后重新选择；原文件未改动。"
            else if (op == "packExport") "WRITE_FAILED: 附件包导出未确认，请检查目标空间或重新选择位置；完整本机附件包记录仍保留。"
            else if (op == "commitPackImport") "WRITE_FAILED: 笔记和附件尚未确认存入；完整附件包记录仍保留，请检查本机空间后重试。"
            else if (op == "commitFileImport") "WRITE_FAILED: 本机副本尚未确认，完整导入记录仍保留；请释放空间或稍后重试。"
            else if (op == "exportDocument") "WRITE_FAILED: 文字副本导出未确认，请检查目标空间或重新选择位置；已保护的导出内容仍保留。"
            else if (op == "write" || op == "copyRecovery" || op == "exportRecovery")
            if (generateSequence<Throwable>(error) { it.cause }.take(8).any { it.message?.contains("ENOSPC", true) == true })
                "WRITE_FAILED: 文件提供器报告空间不足，保存未确认；草稿和已有恢复记录仍保留，可另存到手机资料库。"
            else "WRITE_FAILED: 保存未确认，草稿和已有恢复记录仍保留，请重试或存入手机资料库。"
            else "READ_FAILED: 文件暂时无法读取，可能已移动或提供器离线，请重试。"
        else -> error.message ?: "文件操作失败，当前输入仍保留。"
    }
    private fun background(invoke: Invoke, op: String, action: () -> JSObject) {
        try { io.execute {
            try { invoke.resolve(action()) } catch (error: Exception) { invoke.reject(errorMessage(error, op)) }
        } } catch (error: java.util.concurrent.RejectedExecutionException) { invoke.reject("页面正在关闭，请重新打开后重试。") }
    }
    private fun hash(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes)
        .joinToString("") { "%02x".format(it.toInt() and 255) }
    private fun parts(path: String): List<String> {
        if (path.isEmpty()) return emptyList()
        val result = path.split('/')
        if (path.length > 4096 || result.any { it.isEmpty() || it == "." || it == ".." || it.contains('\\') || it.contains('\u0000') }) fail("INVALID_PATH: 文件位置无效")
        return result
    }
    private fun root(id: String): DocumentFile {
        if (id == "local") return DocumentFile.fromFile(library)
        if (!rootIdPattern.matches(id)) fail("PERMISSION: 未登记的资料库")
        val uri = Uri.parse(prefs.getString(id, null) ?: fail("PERMISSION: 请重新选择这个资料库"))
        if (activity.contentResolver.persistedUriPermissions.none { it.uri == uri && it.isReadPermission }) fail("PERMISSION: 资料库授权已失效，请重新选择")
        return DocumentFile.fromTreeUri(activity, uri) ?: fail("PERMISSION: 资料库不可用")
    }
    private fun resolve(id: String, path: String): DocumentFile {
        var current = root(id)
        for (name in parts(path)) current = childNamed(current, name) ?: fail("NOT_FOUND: 文件已移动或不存在")
        if (id == "local") {
            val resolved = File(current.uri.path ?: fail("INVALID_PATH")).canonicalFile
            if (resolved != library.canonicalFile && !resolved.path.startsWith(library.canonicalPath + File.separator)) fail("INVALID_PATH: 文件超出资料库")
        }
        return current
    }
    // DocumentFile.listFiles swallows provider errors and returns an empty array.
    // Query directly so an offline provider is not presented as an empty folder.
    private fun children(directory: DocumentFile, maximum: Int = Int.MAX_VALUE): List<DocumentFile> {
        if (directory.uri.scheme == "file") return directory.listFiles().take(maximum)
        val uri = DocumentsContract.buildChildDocumentsUriUsingTree(directory.uri, DocumentsContract.getDocumentId(directory.uri))
        val cursor = try { activity.contentResolver.query(uri, arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID), null, null, null) }
            catch (error: SecurityException) { throw error }
            catch (error: Exception) { fail("READ_FAILED: 目录提供器暂不可用，可能处于离线状态，请重试。") }
        if (cursor == null) fail("READ_FAILED: 目录提供器暂不可用，请重试。")
        return cursor.use {
            val files = ArrayList<DocumentFile>()
            while (files.size < maximum && it.moveToNext()) {
                val child = DocumentsContract.buildDocumentUriUsingTree(directory.uri, it.getString(0))
                files.add(DocumentFile.fromSingleUri(activity, child) ?: fail("READ_FAILED: 无法读取目录条目"))
            }
            files
        }
    }
    private fun <T> childCursor(directory: DocumentFile, projection: Array<String>, action: (Cursor) -> T): T {
        val uri = DocumentsContract.buildChildDocumentsUriUsingTree(directory.uri, DocumentsContract.getDocumentId(directory.uri))
        try {
            val cursor = activity.contentResolver.query(uri, projection, null, null, null)
                ?: fail("READ_FAILED: 目录提供器暂不可用，请重试。")
            return cursor.use(action)
        } catch (error: SecurityException) { throw error }
        catch (error: Exception) {
            if (error.message?.startsWith("READ_FAILED:") == true) throw error
            fail("READ_FAILED: 目录提供器暂不可用或未返回完整文件信息，请重试。")
        }
    }
    // Read a name snapshot, never DocumentFile.name in a loop: each getter is
    // another provider query. Reject ambiguous names instead of selecting one.
    private fun childNamed(directory: DocumentFile, name: String): DocumentFile? {
        if (directory.uri.scheme == "file") return directory.listFiles().firstOrNull { it.name == name }
        return childCursor(directory, arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME)) { cursor ->
            val idColumn = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
            val nameColumn = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
            var selected: String? = null
            while (cursor.moveToNext()) if ((cursor.getString(nameColumn) ?: fail("READ_FAILED: 提供器未返回文件名称。")) == name) {
                if (selected != null) fail("READ_FAILED: 同名条目无法唯一定位，请先在文件管理器中整理。")
                selected = cursor.getString(idColumn) ?: fail("READ_FAILED: 文件提供器未返回有效位置。")
            }
            selected?.let { DocumentFile.fromSingleUri(activity, DocumentsContract.buildDocumentUriUsingTree(directory.uri, it)) }
        }
    }
    private data class EntryInfo(val name: String, val directory: Boolean, val modified: Long, val size: Long)
    private data class EntryListing(val rows: List<EntryInfo>, val truncated: Boolean)
    private fun entryInfo(directory: DocumentFile, maximum: Int): EntryListing {
        if (directory.uri.scheme == "file") {
            val files = directory.listFiles().take(maximum)
            return EntryListing(files.mapNotNull { file -> file.name?.let { EntryInfo(it, file.isDirectory, file.lastModified(), file.length()) } }, files.size >= maximum)
        }
        return childCursor(directory, arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED, DocumentsContract.Document.COLUMN_SIZE)) { cursor ->
            val nameColumn = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
            val typeColumn = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_MIME_TYPE)
            val modifiedColumn = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED)
            val sizeColumn = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE)
            val rows = ArrayList<EntryInfo>()
            var inspected = 0
            while (inspected < maximum && cursor.moveToNext()) {
                inspected++
                val name = cursor.getString(nameColumn) ?: fail("READ_FAILED: 提供器未返回文件名称。")
                val type = cursor.getString(typeColumn) ?: fail("READ_FAILED: 提供器未返回文件类型。")
                rows.add(EntryInfo(name, type == DocumentsContract.Document.MIME_TYPE_DIR,
                    if (modifiedColumn < 0 || cursor.isNull(modifiedColumn)) 0 else cursor.getLong(modifiedColumn),
                    if (sizeColumn < 0 || cursor.isNull(sizeColumn)) 0 else cursor.getLong(sizeColumn)))
            }
            EntryListing(rows, inspected >= maximum)
        }
    }
    private fun read(file: DocumentFile, maximum: Int = limit): ByteArray {
        if (!file.isFile) fail("NOT_FOUND: 请选择文件")
        return readUri(file.uri, maximum)
    }
    private fun readUri(uri: Uri, maximum: Int, export: Boolean = false): ByteArray {
        return activity.contentResolver.openInputStream(uri)?.use { stream ->
            val out = ByteArrayOutputStream()
            val buffer = ByteArray(16384)
            while (true) {
                val count = stream.read(buffer)
                if (count < 0) break
                if (out.size() + count > maximum && export) fail("WRITE_UNCONFIRMED: 导出文件回读大小不一致，完整导出内容仍保留。")
                if (out.size() + count > maximum) fail("TOO_LARGE: ${if (maximum == limit) "首版支持 4 MiB 以内的文本" else if (maximum == 20 * 1024 * 1024) "当前支持 20 MiB 以内的 PDF。" else "图片支持 2 MiB 以内的文件"}")
                out.write(buffer, 0, count)
            }
            out.toByteArray()
        } ?: fail("READ_FAILED: 无法读取文件")
    }
    private fun decode(bytes: ByteArray) = Charsets.UTF_8.newDecoder()
        .onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
        .decode(ByteBuffer.wrap(bytes)).toString()
    private fun snapshot(id: String, path: String, file: DocumentFile, bytes: ByteArray) = obj(
        "rootId" to id, "relativePath" to path, "content" to decode(bytes),
        "signature" to hash(bytes), "modified" to file.lastModified())
    private fun atomic(file: File, bytes: ByteArray) {
        file.parentFile?.mkdirs()
        val target = AtomicFile(file)
        val stream = target.startWrite()
        try { stream.write(bytes); target.finishWrite(stream) }
        catch (error: Exception) { target.failWrite(stream); throw error }
    }
    private fun draftFile(id: String, path: String) = File(drafts, hash("$id\n$path".toByteArray()) + ".json")
    private fun draft(id: String, path: String): JSONObject? = try {
        JSONObject(String(AtomicFile(draftFile(id, path)).readFully(), Charsets.UTF_8))
    } catch (error: java.io.FileNotFoundException) { null }
    private val recentFile get() = File(activity.filesDir, "recent-v1.json")
    private val pdfBookmarksFile get() = File(activity.filesDir, "pdf-bookmarks-v1.json")
    private val pdfBookmarksLimit = 512 * 1024
    private fun checkedPdfBookmarkContent(content: String) {
        if (content.toByteArray(Charsets.UTF_8).size > pdfBookmarksLimit) fail("WRITE_FAILED: 本机书签空间已达上限，原记录仍保留。")
        try {
            val record = JSONObject(content)
            if (record.opt("version") != 1 || record.opt("records") !is JSONObject) fail("READ_FAILED: 书签记录版本无法读取，原数据仍保留。")
        } catch (error: org.json.JSONException) { fail("READ_FAILED: 书签记录无法读取，原数据仍保留。") }
    }
    private fun pdfBookmarkContent(): String? {
        val file = pdfBookmarksFile
        if (file.length() > pdfBookmarksLimit || File(file.path + ".bak").length() > pdfBookmarksLimit) fail("READ_FAILED: 书签记录较大，暂不改写，原数据仍保留。")
        val bytes = try { AtomicFile(file).readFully() } catch (error: java.io.FileNotFoundException) {
            if (file.exists() || File(file.path + ".bak").exists()) fail("READ_FAILED: 本机书签暂时无法读取，原数据仍保留，请重试。")
            return null
        }
        val content = Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString()
        checkedPdfBookmarkContent(content)
        return content
    }
    private fun pdfBookmarkSnapshot(content: String?) = obj("content" to content, "revision" to (content?.let { hash(it.toByteArray(Charsets.UTF_8)) } ?: "missing"))
    private val recentLimit = 512 * 1024
    private val pdfRecoveryFile get() = File(activity.filesDir, "pdf-annotation-recovery-v1.json")
    private val pdfRecoveryLimit = 5 * 1024 * 1024
    private val pdfReadingLimit = 5 * 1024 * 1024
    private val pdfReadingFile get() = File(activity.filesDir, "pdf-reading-v1.json")
    private fun checkedPdfReading(content: String) {
        if (content.toByteArray(Charsets.UTF_8).size > pdfReadingLimit) fail("WRITE_FAILED: 阅读位置记录超过5 MiB，原记录仍保留。")
        try {
            val input = org.json.JSONTokener(content)
            val record = input.nextValue() as? JSONObject ?: fail("READ_FAILED: 阅读位置格式无法读取，原记录仍保留。")
            if (input.nextClean() != '\u0000' || record.opt("version") != 1 || record.opt("records") !is JSONObject) fail("READ_FAILED: 阅读位置版本无法读取，原记录仍保留。")
        } catch (error: org.json.JSONException) { fail("READ_FAILED: 阅读位置无法读取，原记录仍保留。") }
    }
    private fun pdfReadingContent(): String? {
        val file = pdfReadingFile
        if (file.length() > pdfReadingLimit || File(file.path + ".bak").length() > pdfReadingLimit) fail("READ_FAILED: 阅读位置记录较大，原记录仍保留。")
        val bytes = try { AtomicFile(file).readFully() } catch (error: java.io.FileNotFoundException) {
            if (file.exists() || File(file.path + ".bak").exists()) fail("READ_FAILED: 阅读位置暂时无法读取，原记录仍保留。")
            return null
        } catch (error: java.io.IOException) { fail("READ_FAILED: 阅读位置暂时无法读取，原记录仍保留。") }
        val content = try { Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString() }
        catch (error: java.nio.charset.CharacterCodingException) { fail("READ_FAILED: 阅读位置编码无法读取，原记录仍保留。") }
        checkedPdfReading(content)
        return content
    }
    private val textReadingLimit = 5 * 1024 * 1024
    private val textReadingFile get() = File(activity.filesDir, "text-reading-v1.json")
    private fun checkedTextReading(content: String) {
        if (content.toByteArray(Charsets.UTF_8).size > textReadingLimit) fail("WRITE_FAILED: 阅读位置记录超过5 MiB，原记录仍保留。")
        try {
            val input = org.json.JSONTokener(content)
            val record = input.nextValue() as? JSONObject ?: fail("READ_FAILED: 阅读位置格式无法读取，原记录仍保留。")
            if (input.nextClean() != '\u0000' || record.opt("version") != 1 || record.opt("records") !is JSONObject) fail("READ_FAILED: 阅读位置版本无法读取，原记录仍保留。")
        } catch (error: org.json.JSONException) { fail("READ_FAILED: 阅读位置无法读取，原记录仍保留。") }
    }
    private fun textReadingContent(): String? {
        val file = textReadingFile
        if (file.length() > textReadingLimit || File(file.path + ".bak").length() > textReadingLimit) fail("READ_FAILED: 阅读位置记录较大，原记录仍保留。")
        val bytes = try { AtomicFile(file).readFully() } catch (error: java.io.FileNotFoundException) {
            if (file.exists() || File(file.path + ".bak").exists()) fail("READ_FAILED: 阅读位置暂时无法读取，原记录仍保留。")
            return null
        } catch (error: java.io.IOException) { fail("READ_FAILED: 阅读位置暂时无法读取，原记录仍保留。") }
        val content = try { Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString() }
        catch (error: java.nio.charset.CharacterCodingException) { fail("READ_FAILED: 阅读位置编码无法读取，原记录仍保留。") }
        checkedTextReading(content)
        return content
    }
    private val preferencesLimit = 16 * 1024
    private val preferencesFile get() = File(activity.filesDir, "preferences-v1.json")
    private fun checkedPreferences(content: String) {
        if (content.toByteArray(Charsets.UTF_8).size > preferencesLimit) fail("WRITE_FAILED: 外观设置超过16 KiB，原设置仍保留。")
        try {
            val input = org.json.JSONTokener(content)
            val record = input.nextValue() as? JSONObject ?: fail("READ_FAILED: 外观设置格式无法读取，原设置仍保留。")
            if (input.nextClean() != '\u0000' || record.opt("version") != 1 || record.opt("theme") !in listOf("system", "light", "dark")) fail("READ_FAILED: 外观设置版本无法核对，原设置仍保留。")
        } catch (error: org.json.JSONException) { fail("READ_FAILED: 外观设置无法读取，原设置仍保留。") }
    }
    private fun preferencesContent(): String? {
        val file = preferencesFile
        if (file.length() > preferencesLimit || File(file.path + ".bak").length() > preferencesLimit) fail("READ_FAILED: 外观设置较大，原设置仍保留。")
        val bytes = try { AtomicFile(file).readFully() } catch (error: java.io.FileNotFoundException) {
            if (file.exists() || File(file.path + ".bak").exists()) fail("READ_FAILED: 外观设置暂时无法读取，原设置仍保留。")
            return null
        } catch (error: java.io.IOException) { fail("READ_FAILED: 外观设置暂时无法读取，原设置仍保留。") }
        val content = try { Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString() }
        catch (error: java.nio.charset.CharacterCodingException) { fail("READ_FAILED: 外观设置编码无法读取，原设置仍保留。") }
        checkedPreferences(content)
        return content
    }
    private val sourceReadingLimit = 5 * 1024 * 1024
    private val sourceReadingFile get() = File(activity.filesDir, "source-reading-v1.json")
    private fun checkedSourceReading(content: String) {
        if (content.toByteArray(Charsets.UTF_8).size > sourceReadingLimit) fail("WRITE_FAILED: 阅读位置记录超过5 MiB，原记录仍保留。")
        try {
            val input = org.json.JSONTokener(content)
            val record = input.nextValue() as? JSONObject ?: fail("READ_FAILED: 阅读位置格式无法读取，原记录仍保留。")
            if (input.nextClean() != '\u0000' || record.opt("version") != 1 || record.opt("records") !is JSONObject) fail("READ_FAILED: 阅读位置版本无法读取，原记录仍保留。")
        } catch (error: org.json.JSONException) { fail("READ_FAILED: 阅读位置无法读取，原记录仍保留。") }
    }
    private fun sourceReadingContent(): String? {
        val file = sourceReadingFile
        if (file.length() > sourceReadingLimit || File(file.path + ".bak").length() > sourceReadingLimit) fail("READ_FAILED: 阅读位置记录较大，原记录仍保留。")
        val bytes = try { AtomicFile(file).readFully() } catch (error: java.io.FileNotFoundException) {
            if (file.exists() || File(file.path + ".bak").exists()) fail("READ_FAILED: 阅读位置暂时无法读取，原记录仍保留。")
            return null
        } catch (error: java.io.IOException) { fail("READ_FAILED: 阅读位置暂时无法读取，原记录仍保留。") }
        val content = try { Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString() }
        catch (error: java.nio.charset.CharacterCodingException) { fail("READ_FAILED: 阅读位置编码无法读取，原记录仍保留。") }
        checkedSourceReading(content)
        return content
    }
    private fun checkedPdfRecovery(content: String) {
        if (content.toByteArray(Charsets.UTF_8).size > pdfRecoveryLimit) fail("WRITE_FAILED: 批注恢复记录超过5 MiB，原数据仍保留。")
        try {
            val input = org.json.JSONTokener(content)
            val record = input.nextValue() as? JSONObject ?: fail("READ_FAILED: 批注恢复记录格式无法读取，原数据仍保留。")
            if (input.nextClean() != '\u0000' || record.opt("version") != 1 || record.opt("drafts") !is JSONObject || record.opt("deletions") !is JSONObject) fail("READ_FAILED: 批注恢复记录版本无法读取，原数据仍保留。")
        } catch (error: org.json.JSONException) { fail("READ_FAILED: 批注恢复记录无法读取，原数据仍保留。") }
    }
    private fun pdfRecoveryContent(): String? {
        val file = pdfRecoveryFile
        if (file.length() > pdfRecoveryLimit || File(file.path + ".bak").length() > pdfRecoveryLimit) fail("READ_FAILED: 批注恢复记录较大，原数据仍保留。")
        val bytes = try { AtomicFile(file).readFully() } catch (error: java.io.FileNotFoundException) {
            if (file.exists() || File(file.path + ".bak").exists()) fail("READ_FAILED: 批注恢复记录暂时无法读取，原数据仍保留。")
            return null
        } catch (error: java.io.IOException) { fail("READ_FAILED: 批注恢复记录暂时无法读取，原数据仍保留。") }
        val content = try { Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString() }
        catch (error: java.nio.charset.CharacterCodingException) { fail("READ_FAILED: 批注恢复记录编码无法读取，原数据仍保留。") }
        checkedPdfRecovery(content)
        return content
    }
    private fun recentIdentity(value: JSONObject): JSONObject {
        val id = value.opt("rootId") as? String ?: fail("READ_FAILED: 最近记录格式无法读取。")
        val path = value.opt("relativePath") as? String ?: fail("READ_FAILED: 最近记录格式无法读取。")
        if ((id != "local" && !rootIdPattern.matches(id)) || parts(path).isEmpty()) fail("READ_FAILED: 最近记录格式无法读取。")
        return obj("rootId" to id, "relativePath" to path)
    }
    private fun checkedRecent(values: org.json.JSONArray): List<JSONObject> {
        if (values.length() > 12) fail("READ_FAILED: 最近记录格式无法读取。")
        val seen = HashSet<String>()
        return (0 until values.length()).map { index ->
            val item = recentIdentity(values.getJSONObject(index))
            if (!seen.add(item.getString("rootId") + "\n" + item.getString("relativePath"))) fail("READ_FAILED: 最近记录格式无法读取。")
            item
        }
    }
    private fun saveRecent(entries: List<JSONObject>) {
        val bytes = obj("version" to 1, "entries" to org.json.JSONArray(entries)).toString().toByteArray(Charsets.UTF_8)
        if (bytes.size > recentLimit) fail("WRITE_FAILED: 最近记录过大，原记录仍保留。")
        atomic(recentFile, bytes)
    }
    private fun recentEntries(legacy: String = ""): List<JSONObject> {
        if (recentFile.length() > recentLimit || File(recentFile.path + ".bak").length() > recentLimit) fail("READ_FAILED: 最近记录过大，原记录仍保留。")
        val bytes = try { AtomicFile(recentFile).readFully() } catch (error: java.io.FileNotFoundException) {
            if (recentFile.exists() || File(recentFile.path + ".bak").exists()) throw error
            null
        }
        if (bytes != null) {
            val record = JSONObject(String(bytes, Charsets.UTF_8))
            if (record.optInt("version") != 1) fail("READ_FAILED: 最近记录版本无法读取。")
            return checkedRecent(record.getJSONArray("entries"))
        }
        if (legacy.isNotEmpty()) {
            if (legacy.toByteArray(Charsets.UTF_8).size > recentLimit) fail("READ_FAILED: 旧最近记录过大，原记录仍保留。")
            val entries = checkedRecent(org.json.JSONArray(legacy))
            saveRecent(entries)
            return entries
        }
        // A WebView profile can disappear independently of private drafts.
        // Recover identities only; the existing recovery task still owns content.
        val files = drafts.listFiles() ?: fail("READ_FAILED: 暂时无法读取草稿入口，草稿仍保留。")
        val names = files.map { it.name.removeSuffix(".bak") }.filter { Regex("[0-9a-f]{64}\\.json").matches(it) }.distinct()
        if (names.size > 512) fail("READ_FAILED: 草稿入口较多，暂时无法读取最近记录。")
        if (names.sumOf { name -> maxOf(File(drafts, name).length(), File(drafts, name + ".bak").length()) } > limit * 64L) fail("READ_FAILED: 草稿入口读取量较大，原草稿仍保留。")
        return names.map { name ->
            val file = File(drafts, name)
            if (file.length() > limit * 8L || File(file.path + ".bak").length() > limit * 8L) fail("READ_FAILED: 草稿入口无法读取，原草稿仍保留。")
            val record = JSONObject(String(AtomicFile(file).readFully(), Charsets.UTF_8))
            val item = recentIdentity(record)
            if (draftFile(item.getString("rootId"), item.getString("relativePath")).name != name || record.opt("content") !is String) fail("READ_FAILED: 草稿入口格式无法读取，原草稿仍保留。")
            Pair(record.getLong("updated"), item)
        }.sortedWith(compareByDescending<Pair<Long, JSONObject>> { it.first }.thenBy { it.second.toString() }).take(12).map { it.second }
    }
    private fun requireText(path: String) {
        if (!Regex("(?i).*\\.(md|txt|json|ya?ml|xml|toml)$").matches(path) && !CodeFiles.supports(path)) fail("UNSUPPORTED: 请选择受支持的文字、结构化文本或源码文件")
    }
    private fun textExtension(path: String) = CodeFiles.extension(path) ?: Regex("(?i)\\.(md|txt|json|ya?ml|xml|toml)$").find(path)?.value?.lowercase() ?: ".txt"
    private fun textMime(path: String) = CodeFiles.mime(path) ?: if (path.endsWith(".json", true)) "application/json" else if (path.endsWith(".toml", true)) "application/toml" else if (path.endsWith(".xml", true)) "application/xml" else if (Regex("(?i).*\\.ya?ml$").matches(path)) "application/yaml" else if (path.endsWith(".md", true)) "text/markdown" else "text/plain"
    private fun recoveryFile(id: String): File {
        if (!recoveryIdPattern.matches(id)) fail("INVALID_PATH: 恢复记录编号无效")
        return File(recoveryDirectory, "$id.json")
    }
    private fun recovery(id: String): JSONObject {
        val file = recoveryFile(id)
        if (maxOf(file.length(), File(file.path + ".bak").length()) > limit.toLong() * 12 + 65536) fail("TOO_LARGE: 恢复记录过大，原记录仍保留。")
        val record = JSONObject(String(AtomicFile(file).readFully(), Charsets.UTF_8))
        record.getString("candidate")
        val sourceId = record.optString("rootId")
        val sourceName = if (sourceId == "local") "手机资料库" else prefs.getString("$sourceId:name", "来源文件夹")
        return record.put("id", id).put("created", record.optLong("created", file.lastModified()))
            .put("libraryName", record.optString("libraryName", sourceName))
    }
    private fun recoverySummary(id: String): JSObject = try {
        val record = recovery(id)
        obj("id" to id, "relativePath" to record.getString("relativePath"), "libraryName" to record.getString("libraryName"), "created" to record.getLong("created"),
            "hasOriginal" to !record.isNull("original"), "readable" to true, "purpose" to record.optString("purpose", "write"))
    } catch (error: Exception) {
        obj("id" to id, "relativePath" to "暂时无法读取的恢复记录", "created" to recoveryFile(id).lastModified(), "hasOriginal" to false, "readable" to false)
    }

    private fun imageSnapshot(bytes: ByteArray): JSObject {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outMimeType !in listOf("image/png", "image/jpeg", "image/webp") || bounds.outWidth <= 0 || bounds.outHeight <= 0)
            fail("UNSUPPORTED: 图片内容无法识别，支持 PNG、JPEG 和 WebP")
        if (bounds.outWidth > 8192 || bounds.outHeight > 8192 || bounds.outWidth.toLong() * bounds.outHeight > 8000000)
            fail("TOO_LARGE: 图片分辨率超过当前阅读限制")
        return obj("dataUrl" to "data:${bounds.outMimeType};base64,${Base64.encodeToString(bytes, Base64.NO_WRAP)}",
            "width" to bounds.outWidth, "height" to bounds.outHeight, "bytes" to bytes.size, "mime" to bounds.outMimeType)
    }
    private fun imageFile(id: String, suffix: String): File {
        if (!recoveryIdPattern.matches(id)) fail("INVALID_PATH: 图片记录编号无效")
        return File(imageDirectory, "$id.$suffix")
    }
    private fun imageRecord(id: String): JSONObject {
        val file = imageFile(id, "json")
        if (maxOf(file.length(), File(file.path + ".bak").length()) > 65536) fail("TOO_LARGE: 图片记录暂时无法读取")
        return JSONObject(String(AtomicFile(file).readFully(), Charsets.UTF_8))
    }
    private fun imageSummary(record: JSONObject) = obj(
        "id" to record.getString("id"), "rootId" to record.getString("rootId"), "notePath" to record.getString("notePath"),
        "name" to record.getString("name"), "status" to record.getString("status"), "imagePath" to record.opt("imagePath"),
        "width" to record.getInt("width"), "height" to record.getInt("height"), "bytes" to record.getInt("bytes"),
        "created" to record.getLong("created"), "error" to record.optString("error"), "attempts" to record.optInt("attempts"),
        "previousPaths" to JSONArray().apply { val paths = record.optJSONArray("attemptPaths") ?: JSONArray(); for (i in 0 until paths.length()) if (paths.getString(i) != record.optString("imagePath")) put(paths.getString(i)) })
    private fun saveImageRecord(record: JSONObject) = atomic(imageFile(record.getString("id"), "json"), record.toString().toByteArray(Charsets.UTF_8))
    private fun candidateImage(id: String): ByteArray {
        val file = imageFile(id, "bin")
        if (maxOf(file.length(), File(file.path + ".bak").length()) > 2 * 1024 * 1024) fail("TOO_LARGE: 图片恢复副本超过限制")
        return AtomicFile(file).readFully()
    }
    private fun requireImageNote(id: String, path: String) {
        if (parts(path).isEmpty() || !path.endsWith(".md", true)) fail("UNSUPPORTED: 图片引用用于 Markdown 笔记")
        if (id != "local" && (!rootIdPattern.matches(id) || !prefs.contains(id))) fail("PERMISSION: 未登记的资料库")
    }
    private fun stageImage(id: String, path: String, name: String, bytes: ByteArray): JSObject {
        requireImageNote(id, path)
        val info = imageSnapshot(bytes)
        val files = imageDirectory.listFiles().orEmpty()
        if (files.count { it.name.endsWith(".json") } >= 1000 || files.filter { it.name.endsWith(".bin") || it.name.endsWith(".bin.bak") }.map { it.name.removeSuffix(".bak") }.distinct().size >= 12)
            fail("TOO_LARGE: 图片导入记录或待恢复图片已达到当前上限，请先重试未完成项。")
        val imageId = UUID.randomUUID().toString()
        val points = name.codePoints().limit(160).toArray()
        val record = obj("id" to imageId, "rootId" to id, "notePath" to path, "name" to String(points, 0, points.size),
            "status" to "unconfirmed", "imagePath" to null, "width" to info.getInt("width"), "height" to info.getInt("height"),
            "bytes" to bytes.size, "mime" to info.getString("mime"), "signature" to hash(bytes),
            "created" to System.currentTimeMillis(), "attempts" to 0, "error" to "")
        saveImageRecord(record)
        atomic(imageFile(imageId, "bin"), bytes)
        return retryImage(imageId)
    }
    private fun retryImage(id: String): JSObject {
        val record = imageRecord(id)
        if (record.getString("status") == "ready") return imageSummary(record)
        try {
            val bytes = candidateImage(id)
            if (hash(bytes) != record.getString("signature")) fail("READ_FAILED: 图片恢复副本校验失败，请重新选择原图")
            imageSnapshot(bytes)
            if (record.optInt("attempts") >= 5) fail("TOO_LARGE: 此记录已尝试 5 次，请核对目标文件夹后重新选择原图")
            val rootId = record.getString("rootId")
            val notePath = record.getString("notePath")
            requireImageNote(rootId, notePath)
            val parentPath = parts(notePath).dropLast(1).joinToString("/")
            val parent = resolve(rootId, parentPath)
            if (!parent.isDirectory || !parent.canWrite()) fail("PERMISSION: 没有附件写入授权，图片恢复副本仍保留")
            record.put("attempts", record.optInt("attempts") + 1); saveImageRecord(record)
            // Resolved descendants are SingleDocumentFile instances, whose
            // createDirectory throws even when the scoped provider is writable.
            val folder = childNamed(parent, "attachments") ?: (if (rootId == "local") parent.createDirectory("attachments") else
                DocumentsContract.createDocument(activity.contentResolver, parent.uri, DocumentsContract.Document.MIME_TYPE_DIR, "attachments")?.let { DocumentFile.fromSingleUri(activity, it) })
                ?: fail("WRITE_FAILED: 无法创建 attachments 文件夹，图片恢复副本仍保留")
            if (!folder.isDirectory) fail("WRITE_FAILED: 目标位置的 attachments 是文件，请改名后重试")
            if (!folder.canWrite()) fail("PERMISSION: attachments 文件夹不可写，图片恢复副本仍保留")
            val folderName = folder.name ?: fail("WRITE_FAILED: 无法确认附件文件夹名称")
            parts(folderName)
            if (folderName.contains('/')) fail("INVALID_PATH: 附件文件夹名称无效")
            val extension = when (record.getString("mime")) { "image/jpeg" -> "jpg"; "image/webp" -> "webp"; else -> "png" }
            val name = "longedit-${UUID.randomUUID()}.$extension"
            val imagePath = listOf(parentPath, folderName, name).filter { it.isNotEmpty() }.joinToString("/")
            parts(imagePath)
            val attempts = record.optJSONArray("attemptPaths") ?: JSONArray()
            attempts.put(imagePath); record.put("attemptPaths", attempts)
            record.put("imagePath", imagePath); saveImageRecord(record)
            val existing = children(folder).map { it.uri }.toSet()
            val file = if (rootId == "local") {
                val target = File(library, imagePath).canonicalFile
                if (!target.path.startsWith(library.canonicalPath + File.separator) || target.exists()) fail("INVALID_PATH: 无法安全创建图片副本")
                atomic(target, bytes); DocumentFile.fromFile(target)
            } else {
                val uri = DocumentsContract.createDocument(activity.contentResolver, folder.uri, record.getString("mime"), name)
                    ?: fail("WRITE_FAILED: 无法创建图片副本")
                val created = DocumentFile.fromSingleUri(activity, uri) ?: fail("WRITE_FAILED: 无法确认图片文件")
                if (uri in existing || created.name != name || !created.isFile) fail("WRITE_FAILED: 提供器返回意外的图片位置，未写入，恢复副本仍保留")
                activity.contentResolver.openOutputStream(uri, "wt")?.use { it.write(bytes); it.flush() }
                    ?: fail("WRITE_FAILED: 无法写入图片，恢复副本仍保留")
                created
            }
            if (!read(file, 2 * 1024 * 1024).contentEquals(bytes)) fail("WRITE_UNCONFIRMED: 图片写入未确认，私有恢复副本仍保留；目标可能有未完成文件。")
            record.put("status", "ready").put("error", ""); saveImageRecord(record)
            AtomicFile(imageFile(id, "bin")).delete()
        } catch (error: Exception) { record.put("error", errorMessage(error, "write")); saveImageRecord(record) }
        return imageSummary(record)
    }

    @Command
    fun execute(invoke: Invoke) {
        val args = invoke.parseArgs(StorageArgs::class.java)
        if (args.op == "metadataDirectory") {
            invoke.resolve(obj("path" to activity.filesDir.canonicalPath))
            return
        }
        if (args.op == "systemAppearance") {
            activity.runOnUiThread {
                val flags = activity.window.decorView.systemUiVisibility
                invoke.resolve(obj("dark" to ((Resources.getSystem().configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES),
                    "statusColor" to activity.window.statusBarColor, "navigationColor" to activity.window.navigationBarColor,
                    "lightStatusBar" to ((flags and View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR) != 0),
                    "lightNavigationBar" to ((flags and View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR) != 0)))
            }
            return
        }
        if (args.op == "copyText") {
            if (args.content.toByteArray(Charsets.UTF_8).size > 128 * 1024) { invoke.reject("TOO_LARGE: 代码内容较长，未复制。"); return }
            activity.runOnUiThread {
                try {
                    val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    clipboard.setPrimaryClip(ClipData.newPlainText("Long编辑代码", args.content))
                    val copied = clipboard.primaryClip
                    if (copied == null || copied.itemCount != 1 || copied.getItemAt(0).text?.toString() != args.content) invoke.reject("COPY_FAILED: 复制尚未确认，请重试。")
                    else invoke.resolve(obj("copied" to true))
                } catch (_: Exception) { invoke.reject("COPY_FAILED: 复制尚未确认，请重试。") }
            }
            return
        }
        if (args.op == "applyAppearance") {
            if (args.content != "dark" && args.content != "light") { invoke.reject("INVALID: 无效外观。"); return }
            activity.runOnUiThread {
                val dark = args.content == "dark"
                val color = Color.parseColor(if ((args.surface == "article" || args.surface == "code")) { if (dark) "#111c28" else "#fafbf8" } else { if (dark) "#202722" else "#fcfcf8" })
                activity.findViewById<View>(android.R.id.content).setBackgroundColor(color)
                activity.window.statusBarColor = color
                activity.window.navigationBarColor = if (args.surface == "code") Color.parseColor("#111f29") else color
                val controller = WindowCompat.getInsetsController(activity.window, activity.window.decorView)
                controller.isAppearanceLightStatusBars = !dark
                controller.isAppearanceLightNavigationBars = !dark && args.surface != "code"
                invoke.resolve(obj("applied" to true))
            }
            return
        }
        if (args.op == "exportDocument") { beginTextExport(invoke, args); return }
        if (args.op == "exportPack" || args.op == "retryPack") { beginPackExport(invoke, args); return }
        if (args.op == "choose" || args.op == "exportRecovery" || args.op == "importImage" || args.op == "importTextFile" || args.op == "importPackFile" || args.op == "importPdf") {
            if (!pickerBusy.compareAndSet(false, true)) { invoke.reject("BUSY: 文件选择器已打开，请先完成或取消当前操作。"); return }
            try {
                if (args.op == "choose") {
                    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or
                        Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or Intent.FLAG_GRANT_PREFIX_URI_PERMISSION)
                    startActivityForResult(invoke, intent, "rootPicked")
                } else if (args.op == "importPdf") {
                    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/pdf")
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    startActivityForResult(invoke, intent, "pdfPicked")
                } else if (args.op == "importPackFile") {
                    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                        .putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/zip", "application/octet-stream", "application/x-zip-compressed"))
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    startActivityForResult(invoke, intent, "packFilePicked")
                } else if (args.op == "importTextFile") {
                    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                        .putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("text/markdown", "text/plain", "application/json", "application/toml", "application/x-toml", "text/toml", "text/x-toml", "application/xml", "text/xml", "application/yaml", "application/x-yaml", "text/yaml", "text/x-yaml", "application/octet-stream", *CodeFiles.mimes.toTypedArray()))
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    startActivityForResult(invoke, intent, "textFilePicked")
                } else if (args.op == "importImage") {
                    requireImageNote(args.rootId, args.relativePath)
                    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*")
                        .putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/png", "image/jpeg", "image/webp"))
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    startActivityForResult(invoke, intent, "imagePicked")
                } else {
                    recoveryFile(args.recoveryId)
                    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json")
                        .putExtra(Intent.EXTRA_TITLE, "Long编辑-保存恢复-${args.recoveryId.take(8)}.json")
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                    startActivityForResult(invoke, intent, "recoveryExported")
                }
            } catch (error: Exception) { pickerBusy.set(false); invoke.reject(errorMessage(error, args.op)) }
        } else background(invoke, args.op) { dispatch(args) }
    }

    private fun fileImportFile(id: String): File {
        if (!recoveryIdPattern.matches(id)) fail("INVALID_PATH: 导入记录编号无效")
        return File(fileImportDirectory, "$id.json")
    }

    private fun pdfBytes(bytes: ByteArray): ByteArray {
        if (bytes.isEmpty() || bytes.size > 20 * 1024 * 1024) fail("TOO_LARGE: 当前支持 20 MiB 以内的 PDF。")
        if (bytes.size < 5 || String(bytes.copyOfRange(0,5), Charsets.US_ASCII) != "%PDF-") fail("UNSUPPORTED: 这个文件没有可识别的 PDF 文件头，请重新选择。")
        return bytes
    }
    @ActivityCallback
    fun pdfPicked(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode == Activity.RESULT_CANCELED) { pickerBusy.set(false); invoke.resolve(obj("identity" to null)); return }
        background(invoke,"importPdf") { try {
            val uri = result.data?.data ?: fail("READ_FAILED: 没有取得 PDF 文件。")
            val name = displayName(uri)
            if (name.isNotEmpty() && !name.endsWith(".pdf",true)) fail("UNSUPPORTED: 请选择 PDF 文件。")
            val bytes = pdfBytes(readUri(uri,20 * 1024 * 1024))
            val clean = (if (name.endsWith(".pdf",true)) name.dropLast(4) else name).replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"),"_").trimStart('.').trim().ifEmpty { "阅读资料" }
            val points = clean.codePoints().limit(40).toArray()
            val base = String(points,0,points.size)
            val path = "$base-导入-${UUID.randomUUID()}.pdf"
            val target = File(library,path)
            if (target.exists()) fail("CONFLICT: 名称已被占用，请重新选择。")
            atomic(target,bytes)
            if (!target.readBytes().contentEquals(bytes)) fail("WRITE_UNCONFIRMED: PDF 副本未确认，原文件保持原样，请重新核对手机资料库。")
            obj("identity" to obj("rootId" to "local", "relativePath" to path))
        } finally { pickerBusy.set(false) } }
    }
    private fun fileImportIds(): List<String> = fileImportDirectory.listFiles()?.map { it.name.removeSuffix(".bak").removeSuffix(".json") }
        ?.filter { recoveryIdPattern.matches(it) }?.distinct()?.sortedByDescending { fileImportFile(it).lastModified() } ?: emptyList()
    private fun fileImportRecord(id: String): JSONObject {
        val file = fileImportFile(id)
        if (maxOf(file.length(), File(file.path + ".bak").length()) > limit.toLong() * 12 + 65536) fail("TOO_LARGE: 导入记录过大，原记录仍保留。")
        return JSONObject(String(AtomicFile(file).readFully(), Charsets.UTF_8))
    }
    private fun fileImportSummary(id: String, record: JSONObject): JSObject {
        val status = record.getString("status")
        if (status !in listOf("preparing", "ready", "imported", "failed")) fail("READ_FAILED: 导入记录状态无法读取。")
        return obj("id" to id, "name" to record.getString("name"), "created" to record.getLong("created"), "bytes" to record.optLong("bytes"),
            "status" to if (status == "preparing") "failed" else status, "readable" to true,
            "error" to if (status == "preparing") "上次导入未完成，请重新选择文件；原文件未改动。" else record.optString("error"),
            "localPath" to if (record.isNull("localPath")) null else record.getString("localPath"),
            "incoming" to record.optBoolean("incoming"), "source" to record.optString("source", "picker"))
    }
    private fun ensureImportCapacity() {
        val ids = fileImportIds()
        if (ids.size >= 100 || ids.count { try { fileImportRecord(it).optString("status") in listOf("preparing", "ready") } catch (error: Exception) { true } } >= 12)
            fail("TOO_LARGE: 待导入文件或记录已达当前上限，请先存入笔记或清理不需要的导入记录。")
    }
    private fun importedName(name: String, mime: String): String {
        val source = name.trim().ifEmpty { CodeFiles.defaultName(mime) ?: when (mime.substringBefore(';')) { "text/markdown" -> "导入笔记.md"; "text/plain" -> "导入文字.txt"; "application/json" -> "导入数据.json"; "application/toml", "application/x-toml", "text/toml", "text/x-toml" -> "导入配置.toml"; "application/xml", "text/xml" -> "导入文档.xml"; "application/yaml", "application/x-yaml", "text/yaml", "text/x-yaml" -> "导入配置.yaml"; else -> "" } }
        requireText(source)
        val extension = textExtension(source)
        val base = source.dropLast(extension.length).replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_").trimStart('.').trim()
        val points = base.codePoints().limit(40).toArray()
        var safe = if (points.isEmpty()) "导入笔记" else String(points, 0, points.size)
        while (safe.toByteArray(Charsets.UTF_8).size > 160) safe = safe.substring(0, safe.offsetByCodePoints(safe.length, -1))
        return safe + extension
    }
    private fun importedPath(record: JSONObject, id: String): String {
        val name = importedName(record.getString("name"), "")
        val extension = textExtension(name)
        val path = "${name.dropLast(extension.length)}-导入-$id$extension"
        if (!record.isNull("localPath") && record.getString("localPath") != path) fail("WRITE_FAILED: 导入副本位置不匹配，记录仍保留。")
        return path
    }
    private fun importContent(record: JSONObject): String {
        if (record.optString("status") != "ready" || record.isNull("content")) fail("READ_FAILED: 这份文件尚未完整导入，请重新选择源文件。")
        val content = record.getString("content")
        val bytes = content.toByteArray(Charsets.UTF_8)
        if (bytes.size > limit || bytes.size.toLong() != record.getLong("bytes") || hash(bytes) != record.getString("digest"))
            fail("READ_FAILED: 导入内容核对失败，记录仍保留，请重新选择源文件。")
        return content
    }
    private fun stageTextFile(uri: Uri, source: String = "picker", id: String = UUID.randomUUID().toString()): JSObject {
        if (uri.scheme != "content") fail("UNSUPPORTED: 请通过系统文件选择器选择文件，原文件未改动。")
        ensureImportCapacity()
        val displayName = activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
            if (it.moveToFirst() && !it.isNull(0)) it.getString(0) else ""
        } ?: ""
        val record = obj("name" to displayName.take(256).ifEmpty { "未命名文件" }, "created" to System.currentTimeMillis(),
            "bytes" to 0, "status" to "preparing", "error" to "", "localPath" to null, "content" to null, "digest" to null, "source" to source, "incoming" to (source != "picker"))
        atomic(fileImportFile(id), record.toString().toByteArray(Charsets.UTF_8))
        try {
            record.put("name", importedName(displayName, activity.contentResolver.getType(uri) ?: ""))
            val bytes = readUri(uri, limit)
            if (bytes.any { it == 0.toByte() }) fail("UNSUPPORTED: 文件含有零字节，请选择 UTF-8 文本；原文件未改动。")
            val content = decode(bytes)
            record.put("bytes", bytes.size).put("digest", hash(bytes)).put("content", content).put("status", "ready")
            atomic(fileImportFile(id), record.toString().toByteArray(Charsets.UTF_8))
            importContent(fileImportRecord(id))
        } catch (error: Exception) {
            record.put("status", "failed").put("content", JSONObject.NULL).put("digest", JSONObject.NULL).put("error", errorMessage(error, "importTextFile"))
            atomic(fileImportFile(id), record.toString().toByteArray(Charsets.UTF_8))
        }
        return fileImportSummary(id, record)
    }
    private fun stageSharedText(text: String, name: String, id: String): JSObject {
        ensureImportCapacity()
        val record = obj("name" to importedName(name, "text/plain"), "created" to System.currentTimeMillis(), "bytes" to 0,
            "status" to "preparing", "error" to "", "localPath" to null, "content" to null, "digest" to null, "source" to "share-text", "incoming" to true)
        atomic(fileImportFile(id), record.toString().toByteArray(Charsets.UTF_8))
        try {
            val buffer = Charsets.UTF_8.newEncoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).encode(java.nio.CharBuffer.wrap(text))
            val bytes = ByteArray(buffer.remaining()); buffer.get(bytes)
            if (bytes.size > limit || bytes.any { it == 0.toByte() }) fail("UNSUPPORTED: 当前接收 4 MiB 以内、没有零字节的文字。")
            record.put("bytes", bytes.size).put("digest", hash(bytes)).put("content", text).put("status", "ready")
            atomic(fileImportFile(id), record.toString().toByteArray(Charsets.UTF_8)); importContent(fileImportRecord(id))
        } catch (error: Exception) {
            record.put("status", "failed").put("content", JSONObject.NULL).put("digest", JSONObject.NULL).put("error", errorMessage(error, "importTextFile"))
            atomic(fileImportFile(id), record.toString().toByteArray(Charsets.UTF_8))
        }
        return fileImportSummary(id, record)
    }
    @ActivityCallback
    fun textFilePicked(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode == Activity.RESULT_CANCELED) { pickerBusy.set(false); invoke.resolve(obj("entry" to null)); return }
        background(invoke, "importTextFile") { try {
            val uri = result.data?.data ?: fail("READ_FAILED: 未取得文件，原文件未改动。")
            obj("entry" to stageTextFile(uri))
        } finally { pickerBusy.set(false) } }
    }
    @ActivityCallback
    fun packFilePicked(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode == Activity.RESULT_CANCELED) { pickerBusy.set(false); invoke.resolve(obj("entry" to null)); return }
        background(invoke, "importPackFile") { try {
            val uri = result.data?.data ?: fail("READ_FAILED: 未取得附件包，原文件未改动。")
            obj("entry" to stagePackFile(uri, displayName(uri)))
        } finally { pickerBusy.set(false) } }
    }
    private fun displayName(uri: Uri): String = activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
        if (it.moveToFirst() && !it.isNull(0)) it.getString(0)?.take(1024) else null
    } ?: "未命名文件"
    private fun stagePackFile(uri: Uri, name: String, source: String = "picker", id: String = UUID.randomUUID().toString()) = packIntakes.stage(name, source, id) {
        try { readUri(uri, PackageArchive.LIMIT) } catch (error: Exception) { if (error.message?.startsWith("TOO_LARGE:") == true) fail("附件包支持 13 MiB 以内的文件。"); throw error }
    }
    private fun commitFileImport(id: String): JSObject {
        val record = fileImportRecord(id)
        if (record.optString("status") == "imported") {
            val path = importedPath(record, id)
            val file = resolve("local", path)
            return snapshot("local", path, file, read(file))
        }
        val content = importContent(record)
        val path = importedPath(record, id)
        record.put("localPath", path)
        atomic(fileImportFile(id), record.toString().toByteArray(Charsets.UTF_8))
        val existing = childNamed(root("local"), path)
        val document = if (existing != null) {
            val bytes = read(existing)
            if (!bytes.contentEquals(content.toByteArray(Charsets.UTF_8))) fail("CONFLICT: 目标副本已有其他内容，完整导入记录仍保留，不会覆盖。")
            snapshot("local", path, existing, bytes)
        } else write(StorageArgs().apply { rootId = "local"; relativePath = path; this.content = content })
        // Release the temporary full text only after verified file persistence;
        // a failed receipt leaves the ready snapshot and the same retry target.
        record.put("status", "imported").put("content", JSONObject.NULL).put("error", "")
        atomic(fileImportFile(id), record.toString().toByteArray(Charsets.UTF_8))
        return document
    }

    private fun textExportName(path: String): String {
        val name = path.substringAfterLast('/')
        val extension = textExtension(name)
        val base = name.dropLast(extension.length)
            .replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_").trimStart('.').trim()
        val points = base.codePoints().limit(60).toArray()
        var safe = if (points.isEmpty()) "笔记" else String(points, 0, points.size)
        while (safe.toByteArray(Charsets.UTF_8).size > 220) safe = safe.substring(0, safe.offsetByCodePoints(safe.length, -1))
        return "$safe-导出副本$extension"
    }
    private fun stageTextExport(args: StorageArgs) {
        if (parts(args.relativePath).isEmpty()) fail("INVALID_PATH: 请先打开一份文稿")
        requireText(args.relativePath)
        if (args.rootId != "local" && !rootIdPattern.matches(args.rootId)) fail("INVALID_PATH: 资料库编号无效")
        if (args.content.toByteArray(Charsets.UTF_8).size > limit) fail("TOO_LARGE: 导出支持 4 MiB 以内的文本")
        val file = recoveryFile(args.recoveryId)
        if (file.exists() || File(file.path + ".bak").exists()) {
            val old = recovery(args.recoveryId)
            if (old.optString("purpose") != "text-export" || old.getString("rootId") != args.rootId ||
                old.getString("relativePath") != args.relativePath || old.getString("candidate") != args.content)
                fail("WRITE_FAILED: 导出记录不匹配，请关闭面板后重新导出。")
            return
        }
        val record = obj("purpose" to "text-export", "rootId" to args.rootId, "relativePath" to args.relativePath,
            "original" to null, "candidate" to args.content, "expectedSignature" to args.expectedSignature,
            "revision" to args.revision, "created" to System.currentTimeMillis())
        atomic(file, record.toString().toByteArray(Charsets.UTF_8))
        if (recovery(args.recoveryId).getString("candidate") != args.content) fail("WRITE_FAILED: 导出内容保护未确认，请重试。")
    }
    // Stage before launching the picker. Do not resolve the command until its
    // Activity callback finishes; a process interruption leaves this snapshot.
    private fun beginTextExport(invoke: Invoke, args: StorageArgs) {
        if (!pickerBusy.compareAndSet(false, true)) { invoke.reject("BUSY: 文件选择器已打开，请先完成或取消当前操作。"); return }
        try { io.execute {
            try {
                stageTextExport(args)
                activity.runOnUiThread {
                    try {
                        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                            .setType(textMime(args.relativePath))
                            .putExtra(Intent.EXTRA_TITLE, textExportName(args.relativePath))
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                        startActivityForResult(invoke, intent, "textExported")
                    } catch (error: Exception) { pickerBusy.set(false); invoke.reject(errorMessage(error, "exportDocument")) }
                }
            } catch (error: Exception) { pickerBusy.set(false); invoke.reject(errorMessage(error, "exportDocument")) }
        } } catch (error: java.util.concurrent.RejectedExecutionException) { pickerBusy.set(false); invoke.reject("页面正在关闭，请重新打开后重试；已保护的导出内容仍保留。") }
    }
    private fun packSources(args: StorageArgs): JSONArray {
        if (parts(args.relativePath).isEmpty()) fail("INVALID_PATH: 请先打开文稿")
        // Capture provider identities before showing the picker. Retry never
        // needs live root authorization and still protects zero-byte sources.
        val sources = JSONArray()
        (listOf(args.relativePath) + args.assets.map { it.sourcePath }).distinct().forEach { path ->
            val source = try { resolve(args.rootId, path) } catch (error: Exception) {
                if (path == args.relativePath && error.message?.startsWith("NOT_FOUND:") == true) null else throw error
            }
            if (source != null) sources.put(JSONObject().put("uri", source.uri.toString()).put("authority", source.uri.authority ?: "")
                .put("documentId", if (source.uri.scheme == "content") DocumentsContract.getDocumentId(source.uri) else ""))
        }
        return sources
    }
    private fun beginPackExport(invoke: Invoke, args: StorageArgs) {
        if (!pickerBusy.compareAndSet(false, true)) { invoke.reject("BUSY: 请先完成或取消当前文件选择。"); return }
        try { io.execute {
            try {
                val record = if (args.op == "exportPack") packs.stage(args) { packSources(args) } else { packs.bytes(args.packId); packs.record(args.packId) }
                activity.runOnUiThread { try {
                    // DocumentsUI appends .zip for application/zip, hiding the
                    // public .textpack extension from compatible importers.
                    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/octet-stream")
                        .putExtra(Intent.EXTRA_TITLE, record.getString("name"))
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                    startActivityForResult(invoke, intent, "packExported")
                } catch (error: Exception) { pickerBusy.set(false); invoke.reject("附件包未导出：${error.message}") } }
            } catch (error: Exception) { pickerBusy.set(false); invoke.reject("附件包未导出：${error.message ?: "请检查本机空间或来源文件"}") }
        } } catch (_: java.util.concurrent.RejectedExecutionException) { pickerBusy.set(false); invoke.reject("页面正在关闭，请重新打开后检查附件包记录。") }
    }
    @ActivityCallback
    fun packExported(invoke: Invoke, result: ActivityResult) {
        background(invoke, "packExport") { try {
            val args = invoke.parseArgs(StorageArgs::class.java)
            if (result.resultCode == Activity.RESULT_CANCELED) obj("cancelled" to true, "retained" to true)
            else {
                val record = packs.record(args.packId)
                val bytes = packs.bytes(args.packId)
                val target = result.data?.data ?: fail("WRITE_FAILED: 未取得导出位置，附件包记录仍保留。")
                if (target.scheme != "content" || target.authority?.startsWith(activity.packageName) == true) fail("WRITE_FAILED: 请选择系统文件夹中的新副本位置。")
                val targetId = try { DocumentsContract.getDocumentId(target) } catch (_: Exception) { fail("WRITE_FAILED: 无法核对目标位置，请选择系统文档位置。") }
                val sources = record.getJSONArray("sources")
                for (index in 0 until sources.length()) {
                    val source = sources.getJSONObject(index)
                    if (source.getString("uri") == target.toString() || source.getString("authority") == target.authority && source.getString("documentId") == targetId)
                        fail("WRITE_FAILED: 导出位置指向源笔记或源附件，请选择新的副本位置；源文件未改动。")
                }
                val empty = activity.contentResolver.openInputStream(target)?.use { it.read() == -1 }
                    ?: fail("WRITE_FAILED: 无法核对新副本位置，附件包记录仍保留。")
                if (!empty) fail("WRITE_FAILED: 目标位置已有内容，请选择新的空副本位置；已有文件未改动。")
                activity.contentResolver.openOutputStream(target, "wt")?.use { it.write(bytes); it.flush() }
                    ?: fail("WRITE_FAILED: 无法写出附件包，记录仍保留。")
                if (!readUri(target, bytes.size, true).contentEquals(bytes)) fail("WRITE_UNCONFIRMED: 导出回读内容不一致，完整附件包记录仍保留。")
                // The provider may rename the suggested file. Metadata is
                // optional: a failed query cannot invalidate verified bytes.
                val exportedName = try {
                    activity.contentResolver.query(target, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
                        if (it.moveToFirst() && !it.isNull(0)) it.getString(0)?.takeIf { name -> name.isNotBlank() && name.length <= 1024 } else null
                    }
                } catch (_: Exception) { null }
                obj("exported" to true, "retained" to true, "displayName" to exportedName)
            }
        } finally { pickerBusy.set(false) } }
    }
    private fun clearTextExport(id: String): Boolean {
        if (recovery(id).optString("purpose") != "text-export") fail("WRITE_FAILED: 导出记录类型不匹配，原记录仍保留。")
        val file = recoveryFile(id)
        AtomicFile(file).delete()
        return !file.exists() && !File(file.path + ".bak").exists() && !File(file.path + ".new").exists()
    }
    private fun protectExportSource(record: JSONObject, target: Uri) {
        val id = record.getString("rootId")
        if (id == "local") return // App-private files cannot be selected in SAF.
        val sourceTree = prefs.getString(id, null)?.let { Uri.parse(it) }
            ?: fail("PERMISSION: 来源授权暂不可用，请重新授权后导出；导出内容仍保留。")
        if (sourceTree.authority != target.authority) return
        val source = resolve(id, record.getString("relativePath")).uri
        if (source == target || DocumentsContract.getDocumentId(source) == DocumentsContract.getDocumentId(target))
            fail("WRITE_FAILED: 导出位置指向原文件，请选择一个新的副本位置；原文未改动。")
    }
    @ActivityCallback
    fun textExported(invoke: Invoke, result: ActivityResult) {
        background(invoke, "exportDocument") { try {
            val args = invoke.parseArgs(StorageArgs::class.java)
            val record = recovery(args.recoveryId)
            if (record.optString("purpose") != "text-export") fail("WRITE_FAILED: 导出记录类型不匹配，原记录仍保留。")
            if (result.resultCode == Activity.RESULT_CANCELED) {
                val cleared = try { clearTextExport(args.recoveryId) } catch (error: Exception) { false }
                obj("cancelled" to true, "retained" to !cleared)
            } else {
                val uri = result.data?.data ?: fail("WRITE_FAILED: 没有取得导出位置，导出内容仍保留。")
                protectExportSource(record, uri)
                val bytes = record.getString("candidate").toByteArray(Charsets.UTF_8)
                val empty = activity.contentResolver.openInputStream(uri)?.use { it.read() == -1 }
                    ?: fail("WRITE_FAILED: 无法核对新副本位置，导出内容仍保留。")
                if (!empty) fail("WRITE_FAILED: 目标位置已有内容，请选择新的空副本位置；已有文件未改动。")
                activity.contentResolver.openOutputStream(uri, "wt")?.use { it.write(bytes); it.flush() }
                    ?: fail("WRITE_FAILED: 无法导出，导出内容仍保留。")
                val verified = readUri(uri, bytes.size, true)
                if (!verified.contentEquals(bytes)) fail("WRITE_UNCONFIRMED: 导出文件回读内容不一致，完整导出内容仍保留。")
                // A metadata failure must not turn verified output into a failed
                // export, or substitute the proposed name after the user renamed it.
                val exportedName = try {
                    activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
                        if (it.moveToFirst() && !it.isNull(0)) it.getString(0)?.takeIf { name -> name.isNotBlank() && name.length <= 1024 } else null
                    }
                } catch (_: Exception) { null }
                val cleared = try { clearTextExport(args.recoveryId) } catch (error: Exception) { false }
                obj("exported" to true, "retained" to !cleared, "displayName" to exportedName)
            }
        } finally { pickerBusy.set(false) } }
    }

    @ActivityCallback
    fun imagePicked(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode == Activity.RESULT_CANCELED) { pickerBusy.set(false); invoke.resolve(obj("image" to null)); return }
        background(invoke, "importImage") { try {
            val args = invoke.parseArgs(StorageArgs::class.java)
            val uri = result.data?.data ?: fail("READ_FAILED: 未取得图片，正文未改动")
            val name = try { activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { if (it.moveToFirst()) it.getString(0) else null } } catch (error: Exception) { null }
            obj("image" to stageImage(args.rootId, args.relativePath, name ?: "图片", readUri(uri, 2 * 1024 * 1024)))
        } finally { pickerBusy.set(false) } }
    }

    @ActivityCallback
    fun rootPicked(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode == Activity.RESULT_CANCELED) { pickerBusy.set(false); invoke.resolve(obj("cancelled" to true)); return }
        background(invoke, "choose") { try {
            val uri = result.data?.data ?: fail("PERMISSION: 未取得资料库授权")
            val flags = (result.data?.flags ?: 0) and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            activity.contentResolver.takePersistableUriPermission(uri, flags)
            val id = hash(uri.toString().toByteArray())
            if (!prefs.edit().putString(id, uri.toString()).commit()) fail("PERMISSION: 授权登记未保存，请重试")
            val directory = root(id)
            val name = directory.name ?: "外部资料库"
            if (!prefs.edit().putString("$id:name", name).commit()) fail("PERMISSION: 资料库名称未保存，请重试")
            obj("root" to obj("id" to id, "name" to name, "external" to true, "available" to true, "writable" to directory.canWrite()))
        } finally { pickerBusy.set(false) } }
    }

    @ActivityCallback
    fun recoveryExported(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode == Activity.RESULT_CANCELED) { pickerBusy.set(false); invoke.resolve(obj("cancelled" to true)); return }
        background(invoke, "exportRecovery") { try {
            val args = invoke.parseArgs(StorageArgs::class.java)
            val record = recovery(args.recoveryId).put("format", "longedit-write-recovery").put("version", 1)
            val bytes = record.toString(2).toByteArray(Charsets.UTF_8)
            val uri = result.data?.data ?: fail("WRITE_FAILED: 没有取得导出位置，恢复记录仍保留。")
            activity.contentResolver.openOutputStream(uri, "wt")?.use { it.write(bytes); it.flush() }
                ?: fail("WRITE_FAILED: 无法导出，恢复记录仍保留。")
            val verified = activity.contentResolver.openInputStream(uri)?.use { stream ->
                val buffer = ByteArray(16384); val out = ByteArrayOutputStream()
                while (true) { val count = stream.read(buffer); if (count < 0) break
                    if (out.size() + count > bytes.size) fail("WRITE_UNCONFIRMED: 导出未确认，恢复记录仍保留。")
                    out.write(buffer, 0, count)
                }; out.toByteArray()
            }
            if (verified == null || !verified.contentEquals(bytes)) fail("WRITE_UNCONFIRMED: 导出未确认，恢复记录仍保留。")
            obj("exported" to true)
        } finally { pickerBusy.set(false) } }
    }

    private fun dispatch(args: StorageArgs): JSObject {
        parts(args.relativePath)
        return when (args.op) {
            "packImports" -> obj("entries" to packIntakes.list())
            "packImport" -> JSObject(packIntakes.detail(args.packId).toString())
            "packImportImage" -> imageSnapshot(packIntakes.image(args.packId, args.sourcePath))
            "commitPackImport" -> { val path = packIntakes.commit(args.packId, args.expectedSignature ?: ""); val file = resolve("local", path); snapshot("local", path, file, read(file)) }
            "removePackImport" -> { packIntakes.remove(args.packId); obj("removed" to true) }
            "packExports" -> obj("entries" to packs.list())
            "packExport" -> JSObject(packs.info(args.packId).toString())
            "removePack" -> { packs.remove(args.packId); obj("removed" to true) }
            "readAttachment" -> {
                val bytes = try { read(resolve(args.rootId, args.relativePath), 2 * 1024 * 1024) }
                catch (error: Exception) { if (error.message?.startsWith("TOO_LARGE:") == true) fail("TOO_LARGE: 每个附件最多 2 MiB"); throw error }
                obj("base64" to Base64.encodeToString(bytes, Base64.NO_WRAP))
            }
            "roots" -> {
                val values = JSONArray().put(obj("id" to "local", "name" to "手机资料库", "external" to false, "available" to true, "writable" to true))
                prefs.all.keys.filter { rootIdPattern.matches(it) }.sorted().forEach { id ->
                    val directory = try { root(id) } catch (error: Exception) { null }
                    values.put(obj("id" to id, "name" to (directory?.name ?: prefs.getString("$id:name", "需要重新授权的资料库")), "external" to true,
                        "available" to (directory?.canRead() == true), "writable" to (directory?.canWrite() == true)))
                }
                obj("roots" to values)
            }
            "disconnect" -> {
                if (args.rootId == "local") fail("PERMISSION: 手机资料库不需要外部授权")
                if (!rootIdPattern.matches(args.rootId)) fail("PERMISSION: 资料库编号无效")
                val uri = Uri.parse(prefs.getString(args.rootId, null) ?: fail("PERMISSION: 没有找到这个资料库"))
                try { root(args.rootId).name?.let { prefs.edit().putString("${args.rootId}:name", it).commit() } } catch (error: Exception) { /* Already unavailable; keep its existing name. */ }
                val grant = activity.contentResolver.persistedUriPermissions.find { it.uri == uri }
                var flags = 0
                if (grant?.isReadPermission == true) flags = flags or Intent.FLAG_GRANT_READ_URI_PERMISSION
                if (grant?.isWritePermission == true) flags = flags or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                if (flags != 0) activity.contentResolver.releasePersistableUriPermission(uri, flags)
                obj("ok" to true)
            }
            "list" -> {
                val directory = resolve(args.rootId, args.relativePath)
                if (!directory.isDirectory || !directory.canRead()) fail("PERMISSION: 目录暂时无法读取")
                val raw = entryInfo(directory, 1001)
                val all = raw.rows.filter { !it.name.startsWith('.') }
                    .sortedWith(compareBy<EntryInfo> { !it.directory }.thenBy { it.name })
                val entries = JSONArray()
                all.take(1000).forEach { file ->
                    val name = file.name
                    entries.put(obj("name" to name, "relativePath" to listOf(args.relativePath, name).filter { it.isNotEmpty() }.joinToString("/"),
                        "directory" to file.directory, "modified" to file.modified, "size" to file.size))
                }
                obj("entries" to entries, "truncated" to raw.truncated)
            }
            "read" -> { requireText(args.relativePath); val file = resolve(args.rootId, args.relativePath); snapshot(args.rootId, args.relativePath, file, read(file)) }
            "readPdf" -> {
                if (!args.relativePath.endsWith(".pdf",true)) fail("UNSUPPORTED: 请选择 PDF 文件。")
                val file = resolve(args.rootId,args.relativePath)
                val bytes = pdfBytes(read(file,20 * 1024 * 1024))
                obj("rootId" to args.rootId,"relativePath" to args.relativePath,"base64" to Base64.encodeToString(bytes,Base64.NO_WRAP),"signature" to hash(bytes),"bytes" to bytes.size,"modified" to file.lastModified())
            }
            "readPdfAnnotations", "writePdfAnnotations" -> pdfAnnotations(args)
            "readImage" -> {
                if (!Regex("(?i).*\\.(png|jpe?g|webp)$").matches(args.relativePath)) fail("UNSUPPORTED: 当前支持 PNG、JPEG 和 WebP 相对图片")
                imageSnapshot(read(resolve(args.rootId, args.relativePath), 2 * 1024 * 1024))
            }
            "imageImports" -> {
                var unreadable = 0
                val all = imageDirectory.listFiles().orEmpty().filter { it.name.endsWith(".json") || it.name.endsWith(".json.bak") }
                    .map { it.name.removeSuffix(".bak").removeSuffix(".json") }.distinct().mapNotNull { id -> try { imageRecord(id) } catch (error: Exception) { unreadable++; null } }
                    .filter { args.all || it.getString("rootId") == args.rootId && it.getString("notePath") == args.relativePath }
                    .sortedByDescending { it.getLong("created") }
                val entries = JSONArray(); all.take(25).forEach { entries.put(imageSummary(it)) }
                obj("entries" to entries, "truncated" to (all.size > 25), "unreadable" to unreadable)
            }
            "retryImage" -> retryImage(args.imageId)
            "imageImportPreview" -> {
                val record = imageRecord(args.imageId)
                if (record.getString("status") == "ready") imageSnapshot(read(resolve(record.getString("rootId"), record.getString("imagePath")), 2 * 1024 * 1024))
                else imageSnapshot(candidateImage(args.imageId))
            }
            "copyImage" -> {
                parts(args.sourcePath)
                if (!Regex("(?i).*\\.(png|jpe?g|webp)$").matches(args.sourcePath)) fail("UNSUPPORTED: 只复制支持的相对图片")
                val source = resolve(args.sourceRootId, args.sourcePath)
                stageImage(args.rootId, args.relativePath, source.name ?: "图片", read(source, 2 * 1024 * 1024))
            }
            "write" -> write(args)
            "incomingStatus" -> {
                val entries = JSONArray()
                fileImportIds().forEach { id -> try { val record = fileImportRecord(id); if (record.optBoolean("incoming")) entries.put(fileImportSummary(id, record)) } catch (_: Exception) { } }
                val retainedPacks = packIntakes.list(); val incomingPacks = JSONArray()
                for (index in 0 until retainedPacks.length()) { val record = retainedPacks.getJSONObject(index); if (record.optBoolean("incoming")) incomingPacks.put(record) }
                val incomingPdfs = JSONArray(); val retainedPdfs = pdfIntakes.list(); for (index in 0 until retainedPdfs.length()) { val record = retainedPdfs.getJSONObject(index); if (record.optBoolean("incoming")) incomingPdfs.put(record) }
                obj("entries" to entries, "pdfs" to incomingPdfs, "packs" to incomingPacks, "error" to incomingPrefs.getString("error", ""), "errorKind" to incomingPrefs.getString("errorKind", "text"))
            }
            "pdfImports" -> obj("entries" to pdfIntakes.list())
            "pdfImport" -> JSObject(pdfIntakes.detail(args.importId).toString())
            "commitPdfImport" -> obj("rootId" to "local", "relativePath" to pdfIntakes.commit(args.importId,args.expectedSignature ?: ""))
            "removePdfImport" -> { pdfIntakes.remove(args.importId); obj("removed" to true) }
            "acknowledgeIncoming" -> {
                if (args.version == "pdf") pdfIntakes.acknowledge(args.importId)
                else
                if (args.packId.isNotEmpty()) packIntakes.acknowledge(args.packId)
                else if (args.importId.isEmpty()) { if (!incomingPrefs.edit().remove("error").remove("errorKind").commit()) fail("WRITE_FAILED: 接收提示尚未确认，请稍后重试。") }
                else { val record = fileImportRecord(args.importId); record.put("incoming", false); atomic(fileImportFile(args.importId), record.toString().toByteArray(Charsets.UTF_8)) }
                obj("acknowledged" to true)
            }
            "fileImports" -> {
                val ids = fileImportIds()
                val entries = JSONArray()
                ids.take(100).forEach { id -> entries.put(try { fileImportSummary(id, fileImportRecord(id)) }
                    catch (error: Exception) { obj("id" to id, "name" to "暂时无法读取的导入记录", "created" to fileImportFile(id).lastModified(), "bytes" to 0,
                        "status" to "failed", "readable" to false, "error" to "记录仍保留，可刷新重试或移除记录。", "localPath" to null) }) }
                obj("entries" to entries, "truncated" to (ids.size > 100))
            }
            "fileImport" -> {
                val record = fileImportRecord(args.importId)
                val summary = fileImportSummary(args.importId, record)
                summary.put("content", if (record.optString("status") == "ready") importContent(record) else JSONObject.NULL)
                summary.put("digest", record.opt("digest") ?: JSONObject.NULL)
                summary
            }
            "commitFileImport" -> commitFileImport(args.importId)
            "removeFileImport" -> {
                val file = fileImportFile(args.importId)
                AtomicFile(file).delete()
                if (file.exists() || File(file.path + ".bak").exists() || File(file.path + ".new").exists()) fail("WRITE_FAILED: 导入记录未能移除，请重试。")
                obj("removed" to true)
            }
            "recoveries" -> {
                val files = recoveryDirectory.listFiles()?.map { it.name.removeSuffix(".bak").removeSuffix(".json") }
                    ?.filter { recoveryIdPattern.matches(it) }?.distinct()?.sortedByDescending { recoveryFile(it).lastModified() } ?: emptyList()
                val entries = JSONArray(); files.take(25).forEach { entries.put(recoverySummary(it)) }
                obj("entries" to entries, "truncated" to (files.size > 25))
            }
            "recovery" -> {
                val record = recovery(args.recoveryId)
                obj("id" to args.recoveryId, "rootId" to record.getString("rootId"), "relativePath" to record.getString("relativePath"),
                    "libraryName" to record.getString("libraryName"), "purpose" to record.optString("purpose", "write"),
                    "created" to record.getLong("created"), "hasOriginal" to !record.isNull("original"), "readable" to true,
                    "candidate" to record.getString("candidate"), "original" to if (record.isNull("original")) null else record.getString("original"))
            }
            "copyRecovery" -> {
                val record = recovery(args.recoveryId)
                if (args.version != "candidate" && args.version != "original") fail("UNSUPPORTED: 恢复版本无效")
                val key = if (args.version == "original") "original" else "candidate"
                if (record.isNull(key)) fail("NOT_FOUND: 这条新建记录没有原文版本")
                val name = record.getString("relativePath").substringAfterLast('/')
                val extension = textExtension(name)
                val base = name.dropLast(extension.length).replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_").trimStart('.')
                val points = base.codePoints().limit(40).toArray()
                val safe = if (points.isEmpty()) "笔记" else String(points, 0, points.size)
                write(StorageArgs().apply { rootId = "local"; relativePath = "$safe-${if (key == "original") "原文" else "草稿"}恢复-${UUID.randomUUID()}$extension"; content = record.getString(key) })
            }
            "recent" -> obj("entries" to org.json.JSONArray(recentEntries(args.content)))
            "readPdfBookmarks" -> pdfBookmarkSnapshot(pdfBookmarkContent())
            "readPdfAnnotationRecovery" -> pdfBookmarkSnapshot(pdfRecoveryContent())
            "readPdfReading" -> pdfBookmarkSnapshot(pdfReadingContent())
            "writePdfReading" -> {
                checkedPdfReading(args.content)
                val current = pdfReadingContent()
                val revision = current?.let { hash(it.toByteArray(Charsets.UTF_8)) } ?: "missing"
                if (revision != args.expectedRevision) fail("CONFLICT: 阅读位置已在别处变化，原记录仍保留，请重试。")
                if (current != args.content) {
                    try { atomic(pdfReadingFile, args.content.toByteArray(Charsets.UTF_8)) }
                    catch (error: java.io.IOException) { fail("WRITE_FAILED: 阅读位置暂未保存，本机空间可能不足；原记录仍保留。") }
                }
                if (pdfReadingContent() != args.content) fail("WRITE_UNCONFIRMED: 阅读位置保存尚未核对，原记录仍保留。")
                pdfBookmarkSnapshot(args.content)
            }
            "readTextReading" -> pdfBookmarkSnapshot(textReadingContent())
            "writeTextReading" -> {
                checkedTextReading(args.content)
                val current = textReadingContent()
                val revision = current?.let { hash(it.toByteArray(Charsets.UTF_8)) } ?: "missing"
                if (revision != args.expectedRevision) fail("CONFLICT: 阅读位置已在别处变化，原记录仍保留，请重试。")
                if (current != args.content) {
                    try { atomic(textReadingFile, args.content.toByteArray(Charsets.UTF_8)) }
                    catch (error: java.io.IOException) { fail("WRITE_FAILED: 阅读位置暂未保存，本机空间可能不足；原记录仍保留。") }
                }
                if (textReadingContent() != args.content) fail("WRITE_UNCONFIRMED: 阅读位置保存尚未核对，原记录仍保留。")
                pdfBookmarkSnapshot(args.content)
            }
            "readPreferences" -> pdfBookmarkSnapshot(preferencesContent())
            "writePreferences" -> {
                checkedPreferences(args.content)
                val current = preferencesContent()
                val revision = current?.let { hash(it.toByteArray(Charsets.UTF_8)) } ?: "missing"
                if (args.expectedRevision != revision) fail("CONFLICT: 外观设置已在别处变化，请重新读取。")
                if (current != args.content) {
                    try { atomic(preferencesFile, args.content.toByteArray(Charsets.UTF_8)) }
                    catch (error: java.io.IOException) { fail("WRITE_FAILED: 外观设置暂未保存，原设置仍保留。") }
                }
                if (preferencesContent() != args.content) fail("WRITE_UNCONFIRMED: 外观保存尚未确认，原设置仍保留。")
                pdfBookmarkSnapshot(args.content)
            }
            "readSourceReading" -> pdfBookmarkSnapshot(sourceReadingContent())
            "writeSourceReading" -> {
                checkedSourceReading(args.content)
                val current = sourceReadingContent()
                val revision = current?.let { hash(it.toByteArray(Charsets.UTF_8)) } ?: "missing"
                if (revision != args.expectedRevision) fail("CONFLICT: 阅读位置已在别处变化，原记录仍保留，请重试。")
                if (current != args.content) {
                    try { atomic(sourceReadingFile, args.content.toByteArray(Charsets.UTF_8)) }
                    catch (error: java.io.IOException) { fail("WRITE_FAILED: 阅读位置暂未保存，本机空间可能不足；原记录仍保留。") }
                }
                if (sourceReadingContent() != args.content) fail("WRITE_UNCONFIRMED: 阅读位置保存尚未核对，原记录仍保留。")
                pdfBookmarkSnapshot(args.content)
            }
            "writePdfAnnotationRecovery" -> {
                checkedPdfRecovery(args.content)
                val current = pdfRecoveryContent()
                val revision = current?.let { hash(it.toByteArray(Charsets.UTF_8)) } ?: "missing"
                if (revision != args.expectedRevision) fail("CONFLICT: 批注恢复记录已在别处变化，当前输入仍保留，请重试。")
                if (current != args.content) {
                    try { atomic(pdfRecoveryFile, args.content.toByteArray(Charsets.UTF_8)) }
                    catch (error: java.io.IOException) { fail("WRITE_FAILED: 输入暂存未完成，本机空间可能不足；原恢复记录仍保留，请重试。") }
                }
                if (pdfRecoveryContent() != args.content) fail("WRITE_UNCONFIRMED: 批注恢复保存尚未核对，当前输入仍保留，请重试。")
                pdfBookmarkSnapshot(args.content)
            }
            "writePdfBookmarks" -> {
                checkedPdfBookmarkContent(args.content)
                val current = pdfBookmarkContent()
                val revision = current?.let { hash(it.toByteArray(Charsets.UTF_8)) } ?: "missing"
                if (revision != args.expectedRevision) fail("CONFLICT: 书签已在别处变化。请重新读取；当前名称输入会保留。")
                if (current != args.content) {
                    try { atomic(pdfBookmarksFile, args.content.toByteArray(Charsets.UTF_8)) }
                    catch (error: java.io.IOException) { fail("WRITE_FAILED: 书签未保存，本机空间可能不足；原记录仍保留，请重试。") }
                }
                if (pdfBookmarkContent() != args.content) fail("WRITE_UNCONFIRMED: 书签保存尚未核对，请重新读取；当前输入仍保留。")
                pdfBookmarkSnapshot(args.content)
            }
            "remember" -> {
                val item = recentIdentity(obj("rootId" to args.rootId, "relativePath" to args.relativePath))
                val entries = listOf(item) + recentEntries().filter { it.getString("rootId") != args.rootId || it.getString("relativePath") != args.relativePath }
                saveRecent(entries.take(12)); obj("ok" to true)
            }
            "draft" -> obj("draft" to draft(args.rootId, args.relativePath))
            "saveDraft" -> {
                val old = draft(args.rootId, args.relativePath)
                if (old == null || old.optLong("revision") <= args.revision) {
                    if (args.content.toByteArray().size > limit) fail("TOO_LARGE: 草稿超过首版文本限制")
                    atomic(draftFile(args.rootId, args.relativePath), obj("rootId" to args.rootId, "relativePath" to args.relativePath,
                        "content" to args.content, "revision" to args.revision, "expectedSignature" to args.expectedSignature,
                        "updated" to System.currentTimeMillis()).toString().toByteArray())
                }
                obj("ok" to true)
            }
            "discardDraft" -> {
                val old = draft(args.rootId, args.relativePath)
                if (old != null && old.optLong("revision") <= args.revision) AtomicFile(draftFile(args.rootId, args.relativePath)).delete()
                obj("ok" to true)
            }
            else -> fail("UNSUPPORTED: 未知操作")
        }
    }

    private fun pdfAnnotations(args: StorageArgs): JSObject {
        if (!args.relativePath.endsWith(".pdf",true)) fail("UNSUPPORTED: 请选择 PDF 文件。")
        val pdf = resolve(args.rootId,args.relativePath)
        val source = pdfBytes(read(pdf,20 * 1024 * 1024))
        val signature = hash(source)
        val names = parts(args.relativePath)
        val parent = resolve(args.rootId,names.dropLast(1).joinToString("/"))
        val name = names.last()+".annotations.json"
        val localTarget = if (args.rootId == "local") File(library,(names.dropLast(1)+name).joinToString("/")).canonicalFile else null
        if (localTarget != null && !localTarget.path.startsWith(library.canonicalPath+File.separator)) fail("INVALID_PATH")
        val previous = if (localTarget != null) {
            if (localTarget.exists() || File(localTarget.path+".bak").exists()) {
                if (maxOf(localTarget.length(),File(localTarget.path+".bak").length()) > 5*1024*1024) fail("TOO_LARGE: 批注文件超过 5 MiB。")
                AtomicFile(localTarget).readFully()
            } else null
        } else childNamed(parent,name)?.let { read(resolve(args.rootId,(names.dropLast(1)+name).joinToString("/")),5 * 1024 * 1024) }
        val revision = previous?.let { hash(it) } ?: "missing"
        if (args.op == "readPdfAnnotations") return obj("content" to previous?.let { decode(it) },"revision" to revision,"sourceSignature" to signature)
        if (args.rootId != "local") fail("PERMISSION: 来源文件夹中的 PDF 暂时仅可阅读；请先导入手机资料库再批注。")
        if (signature != args.expectedSignature || revision != args.expectedRevision) fail("CONFLICT: PDF 或批注已变化，本次输入仍保留，请先核对。")
        val document = PdfAnnotations.parse(args.content, names.last())
        document.getJSONObject("source").put("size",source.size).put("modifiedAt",pdf.lastModified()/1000)
        val content = document.toString(2)+"\n"
        val bytes = content.toByteArray(Charsets.UTF_8)
        if (bytes.size > 5 * 1024 * 1024) fail("TOO_LARGE: 批注文件超过 5 MiB，本次输入仍保留。")
        val target = localTarget ?: fail("INVALID_PATH")
        // The single IO executor serializes app writes. Only our private local
        // library is writable here; no SAF provider truncation is involved.
        atomic(target,bytes)
        if (!AtomicFile(target).readFully().contentEquals(bytes)) fail("WRITE_UNCONFIRMED: 批注保存尚未确认，本次输入仍保留。")
        return obj("content" to content,"revision" to hash(bytes),"sourceSignature" to signature)
    }
    private fun write(args: StorageArgs): JSObject {
        requireText(args.relativePath)
        val bytes = args.content.toByteArray(Charsets.UTF_8)
        if (bytes.size > limit) fail("TOO_LARGE: 首版支持 4 MiB 以内的文本")
        val names = parts(args.relativePath)
        val parent = resolve(args.rootId, names.dropLast(1).joinToString("/"))
        var file = childNamed(parent, names.last())
        if (!(file?.canWrite() ?: parent.canWrite())) fail("PERMISSION: 没有写入授权，请将草稿存入手机资料库。")
        val previous = file?.let { read(it) }
        if (args.expectedSignature == null && file != null) fail("CONFLICT: 同名文件已存在，请更换名称")
        if (args.expectedSignature != null && (previous == null || hash(previous) != args.expectedSignature)) fail("CONFLICT: 原文件已变化，草稿已保留，请另存或重新核对")
        // SAF has no compare-and-swap guarantee. Retain both versions privately before any provider write.
        val recovery = File(recoveryDirectory, "${UUID.randomUUID()}.json")
        atomic(recovery, obj("rootId" to args.rootId, "relativePath" to args.relativePath, "original" to previous?.let { decode(it) },
            "libraryName" to (if (args.rootId == "local") "手机资料库" else prefs.getString("${args.rootId}:name", "来源文件夹")),
            "candidate" to args.content, "expectedSignature" to args.expectedSignature, "created" to System.currentTimeMillis()).toString().toByteArray())
        if (args.rootId == "local") {
            val target = File(library, args.relativePath).canonicalFile
            if (!target.path.startsWith(library.canonicalPath + File.separator)) fail("INVALID_PATH")
            atomic(target, bytes)
            file = DocumentFile.fromFile(target)
        } else {
            if (file != null && hash(read(file)) != args.expectedSignature) fail("CONFLICT: 原文件已变化")
            if (file == null) {
                val existingIds = children(parent).map { DocumentsContract.getDocumentId(it.uri) }.toSet()
                val uri = DocumentsContract.createDocument(activity.contentResolver, parent.uri,
                    textMime(args.relativePath), names.last())
                file = uri?.let { DocumentFile.fromSingleUri(activity, it) }
                val created = file ?: fail("WRITE_FAILED: 无法创建文件，草稿和恢复记录仍保留。")
                // A provider can rename a creation or return an unexpected handle.
                // Refuse to send any candidate bytes until its identity is checked.
                if (DocumentsContract.getDocumentId(created.uri) in existingIds || created.name != names.last() ||
                    !created.isFile || read(created).isNotEmpty())
                    fail("WRITE_FAILED: 文件夹未能按这个名称新建笔记。草稿和恢复记录仍保留，可存入手机资料库。")
                val located = try { childNamed(parent, names.last()) } catch (_: Exception) { null }
                if (located == null || DocumentsContract.getDocumentId(located.uri) != DocumentsContract.getDocumentId(created.uri))
                    fail("WRITE_FAILED: 无法唯一确认新笔记的位置。草稿和恢复记录仍保留，可存入手机资料库。")
            }
            val target = file ?: fail("WRITE_FAILED: 无法创建文件，恢复记录已保留")
            activity.contentResolver.openOutputStream(target.uri, "wt")?.use { it.write(bytes); it.flush() }
                ?: fail("WRITE_FAILED: 无法写入，恢复记录已保留")
        }
        val committed = file ?: fail("WRITE_FAILED")
        val actual = read(committed)
        if (!actual.contentEquals(bytes)) fail("WRITE_UNCONFIRMED: 写入结果未确认，原文与草稿的恢复记录已保留")
        AtomicFile(recovery).delete()
        return snapshot(args.rootId, (names.dropLast(1) + (committed.name ?: names.last())).joinToString("/"), committed, actual)
    }
}
