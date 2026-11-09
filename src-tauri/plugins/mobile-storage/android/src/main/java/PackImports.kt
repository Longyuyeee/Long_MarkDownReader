package com.longyuye.longedit.storage

import android.system.Os
import android.system.OsConstants
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.UUID

/** Only complete, validated packages are promoted from app-private staging
 * into a new library folder. Receipts and retry paths are fixed by UUID. */
internal class PackImports(files: File) {
    private val directory = File(files, "pack-imports-v1").canonicalFile
    private val library = File(files, "library").canonicalFile
    private val pattern = Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
    private val markerName = ".longedit-pack-import.json"
    private fun own(id: String, extension: String): File { check(pattern.matches(id)) { "附件包记录编号无效" }; return inside(directory, "$id.$extension") }
    private fun inside(base: File, path: String): File {
        val target = File(base, path)
        check(path.isNotEmpty() && target.canonicalPath == target.absolutePath && target.canonicalPath.startsWith(base.canonicalPath + File.separator)) { "附件包目标位置无效，已有文件未改动。" }
        return target
    }
    private fun read(file: File, maximum: Int): ByteArray = AtomicFile(file).openRead().use { input ->
        val out = ByteArrayOutputStream(); val buffer = ByteArray(16384)
        while (true) { val count = input.read(buffer); if (count < 0) break; check(out.size().toLong() + count <= maximum) { "附件包内容超过读取限制。" }; out.write(buffer, 0, count) }; out.toByteArray()
    }
    private fun atomic(file: File, bytes: ByteArray) {
        file.parentFile?.mkdirs(); val target = AtomicFile(file); val stream = target.startWrite()
        try { stream.write(bytes); target.finishWrite(stream) } catch (error: Exception) { target.failWrite(stream); throw error }
        check(read(file, bytes.size + 1).contentEquals(bytes)) { "附件包本机写入未确认，记录仍保留。" }
    }
    private fun save(record: JSONObject) = atomic(own(record.getString("id"), "json"), record.toString().toByteArray(Charsets.UTF_8))
    private fun ids() = directory.listFiles().orEmpty().map { it.name.substringBefore('.') }.filter { pattern.matches(it) }.distinct()
    private fun base(id: String) = JSONObject(String(read(own(id, "json"), 256 * 1024), Charsets.UTF_8)).also { check(it.getString("id") == id) { "附件包记录不匹配。" } }
    private fun summary(record: JSONObject): JSONObject = JSONObject(record.toString()).apply { remove("archiveDigest"); remove("textDigest"); remove("textName"); remove("assets"); put("readable", true) }
    fun list() = JSONArray().apply {
        ids().map { id -> try { summary(base(id)) } catch (_: Exception) { JSONObject().put("id", id).put("name", "暂时无法读取的附件包记录").put("created", own(id, "json").lastModified()).put("bytes", 0).put("status", "failed").put("readable", false).put("error", "记录仍保留，可刷新重试或移除。").put("localPath", JSONObject.NULL).put("count", 0) } }.sortedByDescending { it.optLong("created") }.forEach { put(it) }
    }
    private fun archive(record: JSONObject): ByteArray {
        val bytes = try { read(own(record.getString("id"), "zip"), PackageArchive.LIMIT) } catch (_: Exception) { throw IllegalStateException("上次附件包读取未完成，请重新选择源包；现有记录仍保留。") }
        check(bytes.size == record.optInt("bytes") && PackageArchive.hash(bytes) == record.optString("archiveDigest")) { "附件包核对失败，请重新选择源包；现有记录仍保留。" }
        return bytes
    }
    private fun friendly(error: Exception): String = when (error) {
        is org.json.JSONException -> "附件包 info.json 元信息无法读取，请重新导出标准 TextPack V2。"
        is java.nio.charset.CharacterCodingException -> "附件包的正文或文件名不是有效 UTF-8。"
        is java.util.zip.DataFormatException -> "附件包压缩内容损坏，请重新导出。"
        is java.io.IOException -> "附件包读取或本机保护未完成，请检查文件访问与本机空间后重新选择。"
        else -> error.message ?: "附件包未完成读取，请重新选择。"
    }
    private fun ready(record: JSONObject, parsed: PackageArchive.Parsed) {
        record.put("textName", parsed.textName).put("textDigest", PackageArchive.hash(parsed.content.toByteArray(Charsets.UTF_8)))
            .put("assets", parsed.manifest()).put("count", parsed.assets.size).put("status", "ready").put("error", "")
        save(record)
    }
    fun contains(id: String) = ids().contains(id)
    fun acknowledge(id: String) { val record = base(id); record.put("incoming", false); save(record) }
    fun stage(name: String, origin: String = "picker", id: String = UUID.randomUUID().toString(), source: () -> ByteArray): JSONObject {
        check(ids().size < 6) { "已保留 6 份导入附件包，请先移除不需要的导入记录；已存入的笔记不会删除。" }
        check(pattern.matches(id) && !contains(id)) { "附件包接收记录已存在，请从导入记录继续。" }
        val points = name.codePoints().limit(120).toArray()
        val record = JSONObject().put("id", id).put("name", String(points, 0, points.size)).put("created", System.currentTimeMillis()).put("bytes", 0)
            .put("status", "preparing").put("error", "").put("localPath", JSONObject.NULL).put("count", 0).put("source", origin).put("incoming", origin != "picker")
        save(record)
        try {
            check(Regex("(?i).*\\.(textpack(\\.zip)?|zip)$").matches(name)) { "请选择 TextPack（.textpack）或包含单份 TextBundle V2 笔记的 ZIP 文件，原文件不会改动。" }
            val bytes = source(); check(bytes.size <= PackageArchive.LIMIT) { "附件包支持 13 MiB 以内的文件。" }
            record.put("bytes", bytes.size).put("archiveDigest", PackageArchive.hash(bytes)); save(record)
            atomic(own(id, "zip"), bytes)
            ready(record, PackageArchive.parse(archive(record)))
        } catch (error: Exception) { record.put("status", "failed").put("error", friendly(error)); save(record) }
        return summary(base(id))
    }
    fun detail(id: String): JSONObject {
        val record = base(id)
        if (record.optString("status") == "preparing") {
            try { ready(record, PackageArchive.parse(archive(record))) }
            catch (error: Exception) { record.put("status", "failed").put("error", friendly(error)); save(record) }
        }
        val result = JSONObject(record.toString()).put("readable", true).put("content", JSONObject.NULL)
        if (record.optString("status") == "ready") {
            val parsed = PackageArchive.parse(archive(record)); result.put("content", parsed.content).put("textName", parsed.textName).put("assets", parsed.manifest())
        }
        if (!result.has("assets")) result.put("assets", JSONArray())
        if (!result.has("textName")) result.put("textName", "")
        if (!result.has("archiveDigest")) result.put("archiveDigest", "")
        return result
    }
    fun image(id: String, path: String): ByteArray {
        val parsed = PackageArchive.parse(archive(base(id))); val asset = parsed.assets.find { it.path == path } ?: error("没有找到这份包内图片。")
        check(asset.width > 0) { "当前只预览 PNG、JPEG 和 WebP。" }; return asset.bytes
    }
    private fun target(record: JSONObject): Pair<String, String> {
        val id = record.getString("id"); check(pattern.matches(id))
        var source = record.getString("name").replace(Regex("(?i)\\.(textpack(\\.zip)?|zip)$"), "").removeSuffix("-附件包")
            .replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_").trimStart('.').trim()
        val points = source.codePoints().limit(40).toArray(); source = if (points.isEmpty()) "导入笔记" else String(points, 0, points.size)
        while (source.toByteArray(Charsets.UTF_8).size > 160) source = source.substring(0, source.offsetByCodePoints(source.length, -1))
        return "$source-附件-$id" to "$source${if (record.getString("textName") == "text.txt") ".txt" else ".md"}"
    }
    private fun marker(folder: File, id: String, digest: String) {
        val value = JSONObject(String(read(inside(folder, markerName), 4096), Charsets.UTF_8))
        check(value.optString("id") == id && value.optString("archiveDigest") == digest) { "导入目标身份不匹配，已有笔记未改动。" }
    }
    private fun verify(folder: File, note: String, parsed: PackageArchive.Parsed, record: JSONObject) {
        marker(folder, record.getString("id"), record.getString("archiveDigest"))
        check(read(inside(folder, note), 4 * 1024 * 1024).contentEquals(parsed.content.toByteArray(Charsets.UTF_8))) { "目标笔记已有其他内容，完整附件包仍保留，不会覆盖。" }
        parsed.assets.forEach { asset -> check(read(inside(folder, asset.path), 2 * 1024 * 1024).contentEquals(asset.bytes)) { "目标附件已有其他内容，完整附件包仍保留，不会覆盖。" } }
    }
    fun commit(id: String, expectedDigest: String): String {
        val record = base(id); val (folderName, note) = target(record); val path = "$folderName/$note"
        check(record.isNull("localPath") || record.getString("localPath") == path) { "导入目标身份不匹配。" }
        if (record.optString("status") == "imported") return path
        check(record.optString("status") == "ready" && record.optString("archiveDigest") == expectedDigest) { "附件包还不能存入，请先重新核对。" }
        val parsed = PackageArchive.parse(archive(record)); record.put("localPath", path); save(record)
        library.mkdirs(); val final = inside(library, folderName)
        if (final.exists()) verify(final, note, parsed, record)
        else {
            val pending = own(id, "pending")
            if (!pending.exists()) check(pending.mkdirs()) { "无法准备导入目录，完整附件包仍保留。" }
            val owner = inside(pending, markerName)
            if (owner.exists() || File(owner.path + ".bak").exists()) marker(pending, id, expectedDigest)
            else { check(pending.listFiles().orEmpty().isEmpty()) { "导入暂存位置不为空，已有内容未改动。" }; atomic(owner, JSONObject().put("id", id).put("archiveDigest", expectedDigest).toString().toByteArray(Charsets.UTF_8)) }
            atomic(inside(pending, note), parsed.content.toByteArray(Charsets.UTF_8))
            parsed.assets.forEach { asset -> atomic(inside(pending, asset.path), asset.bytes) }
            verify(pending, note, parsed, record)
            check(!final.exists() && pending.renameTo(final)) { "笔记和附件尚未完整存入，附件包记录仍保留，可重试。" }
            for (parent in listOf(library, directory)) { val fd = Os.open(parent.path, OsConstants.O_RDONLY, 0); try { Os.fsync(fd) } finally { Os.close(fd) } }
            verify(final, note, parsed, record)
        }
        record.put("status", "imported").put("error", ""); save(record)
        check(base(id).optString("status") == "imported") { "导入回执未确认，完整附件包仍保留，可重试。" }; return path
    }
    fun remove(id: String) {
        val pending = own(id, "pending")
        if (pending.exists()) {
            // Explicit record removal may also clear an interrupted/empty or
            // corrupt private pending folder. Never touches the library folder.
            fun removeOwned(file: File) {
                check(file.canonicalPath == file.absolutePath && (file == pending || file.path.startsWith(pending.path + File.separator))) { "暂存位置无法安全清理。" }
                if (file.isDirectory) file.listFiles().orEmpty().forEach { removeOwned(it) }
                check(file.delete()) { "暂存清理未完成，记录仍保留。" }
            }; removeOwned(pending)
        }
        listOf("json", "zip").forEach { AtomicFile(own(id, it)).delete() }
        check(!ids().contains(id)) { "导入记录未能移除，请重试。" }
    }
}
