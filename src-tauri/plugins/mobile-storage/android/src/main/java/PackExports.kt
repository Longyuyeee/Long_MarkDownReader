package com.longyuye.longedit.storage

import android.util.AtomicFile
import android.util.Base64
import app.tauri.annotation.InvokeArg
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.MessageDigest
import java.util.zip.CRC32
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

@InvokeArg
class PackAssetArgs {
    var sourcePath: String = ""
    var archivePath: String = ""
    var base64: String = ""
    var bytes: Int = 0
    var digest: String = ""
}

/** Protected immutable exports. Metadata is committed before archive bytes:
 * interrupted preparation always leaves a visible, removable record. No unzip. */
internal class PackExports(private val directory: File) {
    private val pattern = Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
    private val maximum = 13 * 1024 * 1024
    private fun file(id: String, extension: String): File {
        check(pattern.matches(id)) { "附件包记录编号无效" }
        return File(directory, "$id.$extension")
    }
    private fun hash(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 255) }
    private fun read(file: File, limit: Int): ByteArray = AtomicFile(file).openRead().use { stream ->
        val output = ByteArrayOutputStream(); val buffer = ByteArray(16384)
        while (true) { val count = stream.read(buffer); if (count < 0) break; check(output.size() + count <= limit) { "附件包记录超过读取限制" }; output.write(buffer, 0, count) }
        output.toByteArray()
    }
    private fun atomic(file: File, bytes: ByteArray) {
        directory.mkdirs(); val target = AtomicFile(file); val stream = target.startWrite()
        try { stream.write(bytes); target.finishWrite(stream) } catch (error: Exception) { target.failWrite(stream); throw error }
    }
    private fun ids(): List<String> = directory.listFiles().orEmpty().map { it.name.substringBefore('.') }.filter { pattern.matches(it) }.distinct()
    fun record(id: String): JSONObject = JSONObject(String(read(file(id, "json"), 256 * 1024), Charsets.UTF_8)).also { check(it.getString("id") == id) { "附件包记录不匹配" } }
    fun list(): JSONArray {
        val rows = ids().map { id -> try { summary(record(id)) } catch (_: Exception) {
            JSONObject().put("id", id).put("name", "暂时无法读取的附件包记录").put("created", file(id, "json").lastModified()).put("bytes", 0).put("count", 0).put("readable", false)
        } }.sortedByDescending { it.optLong("created") }
        return JSONArray().apply { rows.forEach { put(it) } }
    }
    private fun summary(record: JSONObject) = JSONObject().put("id", record.getString("id")).put("name", record.getString("name"))
        .put("created", record.getLong("created")).put("bytes", record.getInt("bytes")).put("count", record.getJSONArray("assets").length()).put("readable", true)
    fun bytes(id: String): ByteArray {
        val metadata = record(id)
        val bytes = try { read(file(id, "zip"), maximum) } catch (_: Exception) { throw IllegalStateException("附件包不完整，记录仍保留。请回到原笔记重新准备。") }
        check(bytes.size == metadata.getInt("bytes") && hash(bytes) == metadata.getString("digest")) { "附件包核对失败，记录仍保留。请回到原笔记重新准备。" }
        return bytes
    }
    fun info(id: String): JSONObject { bytes(id); return summary(record(id)).put("assets", record(id).getJSONArray("assets")) }
    fun remove(id: String) {
        listOf("json", "zip").forEach { extension -> AtomicFile(file(id, extension)).delete() }
        check(!ids().contains(id)) { "附件包记录未能移除，请重试" }
    }
    fun stage(args: StorageArgs, sources: () -> JSONArray): JSONObject {
        check(args.relativePath.length <= 4096 && Regex("(?i).*\\.(md|txt)$").matches(args.relativePath)) { "附件包先支持 Markdown 和 TXT" }
        val text = args.content.toByteArray(Charsets.UTF_8); check(text.size <= 4 * 1024 * 1024 && args.assets.size <= 24) { "正文或附件数量超过本次限制" }
        val manifest = JSONArray()
        val members = mutableListOf<Pair<String, ByteArray>>()
        val markdown = args.relativePath.endsWith(".md", true)
        members.add("info.json" to JSONObject().put("version", 2).put("type", if (markdown) "net.daringfireball.markdown" else "public.plain-text").put("creatorIdentifier", "com.longyuye.mdreader").toString().toByteArray(Charsets.UTF_8))
        members.add((if (markdown) "text.markdown" else "text.txt") to text)
        var total = 0; val paths = HashSet<String>(); val names = HashSet<String>()
        args.assets.forEach { asset ->
            check(asset.sourcePath.isNotEmpty() && asset.sourcePath.length <= 4096 && asset.sourcePath.split('/').none { it.isEmpty() || it == "." || it == ".." || it.contains('\\') || it.any { char -> char.code < 32 || char.code == 127 } }) { "附件源位置无效" }
            check(Regex("assets/[0-9]{3}-[^/\\\\\\p{Cntrl}]+").matches(asset.archivePath) && asset.archivePath.toByteArray(Charsets.UTF_8).size <= 200 && paths.add(asset.sourcePath) && names.add(asset.archivePath)) { "附件清单重复或位置无效" }
            check(asset.bytes in 0..2 * 1024 * 1024 && asset.base64.length <= 2800000) { "每个附件最多 2 MiB" }
            val bytes = Base64.decode(asset.base64, Base64.NO_WRAP)
            check(bytes.size == asset.bytes && hash(bytes) == asset.digest) { "附件内容核对失败" }
            total += bytes.size; check(total <= 8 * 1024 * 1024) { "附件合计最多 8 MiB" }
            members.add(asset.archivePath to bytes)
            manifest.put(JSONObject().put("sourcePath", asset.sourcePath).put("archivePath", asset.archivePath).put("bytes", bytes.size).put("digest", asset.digest))
        }
        val output = ByteArrayOutputStream()
        ZipOutputStream(output, Charsets.UTF_8).use { zip -> members.forEach { (path, bytes) ->
            val entry = ZipEntry("note.textbundle/$path").apply { method = ZipEntry.STORED; size = bytes.size.toLong(); compressedSize = size; crc = CRC32().apply { update(bytes) }.value; time = 315532800000L }
            zip.putNextEntry(entry); zip.write(bytes); zip.closeEntry()
        } }
        val archive = output.toByteArray(); check(archive.size <= maximum) { "附件包超过本次限制" }
        val digest = hash(archive)
        val metadataFile = file(args.packId, "json")
        if (ids().contains(args.packId)) {
            val old = record(args.packId)
            check(old.getString("rootId") == args.rootId && old.getString("relativePath") == args.relativePath && old.getString("digest") == digest && old.getJSONArray("assets").toString() == manifest.toString()) { "附件包记录不匹配，请关闭后重新准备" }
            bytes(args.packId); return old
        }
        check(ids().size < 6) { "已保留 6 份附件包，请先在「附件包导出记录」移除不需要的记录。" }
        val base = args.relativePath.substringAfterLast('/').replace(Regex("(?i)\\.(md|txt)$"), "").replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_").trimStart('.').trim()
        val points = base.codePoints().limit(60).toArray(); var name = if (points.isEmpty()) "笔记" else String(points, 0, points.size)
        while (name.toByteArray(Charsets.UTF_8).size > 220) name = name.substring(0, name.offsetByCodePoints(name.length, -1))
        val metadata = JSONObject().put("id", args.packId).put("rootId", args.rootId).put("relativePath", args.relativePath).put("name", "$name-附件包.textpack")
            .put("created", System.currentTimeMillis()).put("bytes", archive.size).put("digest", digest).put("assets", manifest).put("sources", sources())
        atomic(metadataFile, metadata.toString().toByteArray(Charsets.UTF_8))
        atomic(file(args.packId, "zip"), archive)
        bytes(args.packId); return record(args.packId)
    }
}
