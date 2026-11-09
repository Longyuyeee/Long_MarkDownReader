package com.longyuye.longedit.storage

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri

/** A narrow transport shared by the runtime gate and the storage receiver. */
object IncomingIntent {
    const val ID = "com.longyuye.longedit.delivery-id"
    const val REJECTED = "com.longyuye.longedit.INCOMING_REJECTED"
    private const val ERROR = "incoming-error"
    fun pdfMime(mime: String?) = mime?.substringBefore(';')?.lowercase() == "application/pdf"
    fun archiveMime(mime: String?) = mime?.substringBefore(';')?.lowercase() in listOf("application/zip", "application/x-zip-compressed")
    data class Payload(val source: String, val uri: Uri? = null, val text: String? = null, val name: String = "")
    fun supported(action: String?) = action in listOf(Intent.ACTION_VIEW, Intent.ACTION_SEND, Intent.ACTION_SEND_MULTIPLE, REJECTED)
    @Suppress("DEPRECATION")
    fun extract(intent: Intent, ownPackage: String): Payload {
        if (intent.action == REJECTED) throw IllegalArgumentException(intent.getStringExtra(ERROR)?.take(300) ?: "没有收到可用的内容，请重新分享。")
        require(intent.action != Intent.ACTION_SEND_MULTIPLE) { "请一次分享一个 PDF、文字、结构化文本、代码文件或 TextPack 附件包；本次没有导入任何文件。" }
        require(intent.action == Intent.ACTION_VIEW || intent.action == Intent.ACTION_SEND) { "请选择文件的打开方式或分享文字。" }
        val mime = intent.type?.substringBefore(';')?.lowercase()
        require(mime in listOf("application/pdf", "text/plain", "text/markdown", "text/x-markdown", "application/json", "application/toml", "application/x-toml", "text/toml", "text/x-toml", "application/xml", "text/xml", "application/yaml", "application/x-yaml", "text/yaml", "text/x-yaml", "application/octet-stream") || mime in CodeFiles.mimes || archiveMime(mime)) { "请选择受支持的文字、结构化文本、源码或 TextPack 附件包，可在应用导入面板查看支持格式。" }
        val uris = mutableListOf<Uri>()
        intent.data?.let { uris.add(it) }
        if (intent.hasExtra(Intent.EXTRA_STREAM)) {
            val stream = intent.getParcelableExtra<android.os.Parcelable>(Intent.EXTRA_STREAM)
            require(stream is Uri) { "没有收到有效文件，请从来源应用重新分享。" }; uris.add(stream)
        }
        intent.clipData?.let { clip ->
            require(clip.itemCount <= 1) { "请一次分享一个文件或一段文字；本次没有导入任何内容。" }
            if (clip.itemCount == 1) clip.getItemAt(0).uri?.let { uris.add(it) }
        }
        val distinct = uris.distinct()
        require(distinct.size <= 1) { "收到的文件位置不一致，请一次重新分享一个文件。" }
        if (distinct.isNotEmpty()) {
            val uri = distinct.single()
            require(uri.scheme == "content" && !uri.authority.isNullOrEmpty() && uri.authority != "$ownPackage.fileprovider") { "请分享文件本身；当前不接收设备路径、应用内文件或网络地址的打开请求。" }
            return Payload(if (intent.action == Intent.ACTION_VIEW) "open" else "share-file", uri = uri)
        }
        require(intent.action == Intent.ACTION_SEND && mime != "application/octet-stream" && !archiveMime(mime) && !pdfMime(mime)) { "没有收到文件，请从来源应用重新选择。" }
        val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
            ?: intent.clipData?.takeIf { it.itemCount == 1 }?.getItemAt(0)?.text?.toString()
        require(!text.isNullOrEmpty()) { "没有收到可保留的文字，请从来源应用重新分享。" }
        require(!text.contains('\u0000') && text.toByteArray(Charsets.UTF_8).size <= 4 * 1024 * 1024) { "当前接收 4 MiB 以内、没有零字节的文字。" }
        val name = CodeFiles.defaultName(mime, "分享源码") ?: if (mime == "application/json") "分享数据.json" else if (mime in listOf("application/toml", "application/x-toml", "text/toml", "text/x-toml")) "分享配置.toml" else if (mime in listOf("application/xml", "text/xml")) "分享文档.xml" else if (mime in listOf("application/yaml", "application/x-yaml", "text/yaml", "text/x-yaml")) "分享配置.yaml" else if (mime in listOf("text/markdown", "text/x-markdown")) "分享文字.md" else "分享文字.txt"
        return Payload("share-text", text = text, name = name)
    }
    fun requireReadGrant(uri: Uri, context: Context) {
        require(context.checkUriPermission(uri, android.os.Process.myPid(), android.os.Process.myUid(), Intent.FLAG_GRANT_READ_URI_PERMISSION) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            "没有收到文件的读取授权，请从来源应用重新分享或重新选择文件。"
        }
    }
    fun forward(source: Intent, context: Context, target: Class<*>): Intent {
        val destination = Intent(context, target).putExtra(ID, java.util.UUID.randomUUID().toString())
        try {
            val payload = extract(source, context.packageName)
            destination.action = if (payload.source == "open") Intent.ACTION_VIEW else Intent.ACTION_SEND
            destination.type = source.type
            if (payload.uri != null) {
                requireReadGrant(payload.uri, context)
                destination.clipData = ClipData.newRawUri("分享文件", payload.uri)
                destination.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                if (payload.source == "open") destination.setDataAndType(payload.uri, source.type)
                else destination.putExtra(Intent.EXTRA_STREAM, payload.uri)
            } else destination.putExtra(Intent.EXTRA_TEXT, payload.text)
        } catch (error: Exception) {
            destination.action = REJECTED
            destination.type = source.type
            destination.putExtra(ERROR, if (error is IllegalArgumentException) error.message?.take(300) else "收到的内容无法读取，请从来源应用重新分享。")
        }
        return destination
    }
}
