package com.longyuye.longedit.storage

import android.graphics.BitmapFactory
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest
import java.text.Normalizer
import java.util.Locale
import java.util.zip.CRC32
import java.util.zip.Inflater

/** Bounded ZIP decoding into memory only. Archive names never become output
 * paths until the entire archive and target manifest have been validated. */
internal object PackageArchive {
    const val LIMIT = 13 * 1024 * 1024
    data class Asset(val path: String, val bytes: ByteArray, val width: Int = 0, val height: Int = 0) {
        fun info() = JSONObject().put("path", path).put("bytes", bytes.size).put("digest", hash(bytes)).apply { if (width > 0) { put("width", width); put("height", height) } }
    }
    data class Parsed(val content: String, val textName: String, val assets: List<Asset>) {
        fun manifest() = JSONArray().apply { assets.forEach { put(it.info()) } }
    }
    private data class Member(val name: String, val size: Int, val compressed: Int, val method: Int, val crc: Long, val local: Int, val start: Int, val end: Int)
    fun hash(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 255) }
    fun text(bytes: ByteArray): String {
        check(bytes.size <= 4 * 1024 * 1024 && !bytes.contains(0)) { "正文需要 4 MiB 以内、没有零字节的 UTF-8 文本。" }
        return Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString()
    }
    private fun invalid(): Nothing = throw IllegalStateException("附件包 ZIP 结构无效、加密或含有不支持的条目，请重新导出标准 TextPack V2。")
    private fun safePath(name: String) {
        val parts = name.removeSuffix("/").split('/')
        check(name.isNotEmpty() && name.toByteArray(Charsets.UTF_8).size <= 1024 && parts.size <= 8 && parts.none { part -> part.isEmpty() || part == "." || part == ".." || part.contains('\\') || part.contains(':') || part.any { it.code < 32 || it.code == 127 } || part.toByteArray(Charsets.UTF_8).size > 200 }) { "附件包含有不安全或过长的路径，没有写入任何笔记。" }
    }
    private fun members(bytes: ByteArray): List<Member> {
        check(bytes.size in 22..LIMIT) { "附件包支持 13 MiB 以内的完整 ZIP 文件。" }
        fun u16(at: Int): Int { if (at < 0 || at.toLong() + 2 > bytes.size) invalid(); return (bytes[at].toInt() and 255) or ((bytes[at + 1].toInt() and 255) shl 8) }
        fun u32(at: Int): Long = u16(at).toLong() or (u16(at + 2).toLong() shl 16)
        var end = -1
        for (at in bytes.size - 22 downTo maxOf(0, bytes.size - 65557)) if (u32(at) == 0x06054b50L && at.toLong() + 22 + u16(at + 20) == bytes.size.toLong()) { end = at; break }
        if (end < 0 || u16(end + 4) != 0 || u16(end + 6) != 0 || u16(end + 8) != u16(end + 10)) invalid()
        val count = u16(end + 10); val startLong = u32(end + 16); val centralSize = u32(end + 12)
        if (count !in 1..96 || startLong + centralSize != end.toLong()) invalid()
        val start = startLong.toInt(); var cursor = start; var total = 0L
        val members = ArrayList<Member>(); val names = LinkedHashMap<String, Boolean>()
        fun extra(from: Int, length: Int) { var at = from; val last = from + length; while (at < last) { if (at + 4 > last || u16(at) == 1) invalid(); at += 4 + u16(at + 2); if (at > last) invalid() } }
        for (index in 0 until count) {
            if (cursor.toLong() + 46 > end || u32(cursor) != 0x02014b50L) invalid()
            val flags = u16(cursor + 8); val method = u16(cursor + 10); val compressedLong = u32(cursor + 20); val sizeLong = u32(cursor + 24)
            val nameLength = u16(cursor + 28); val extraLength = u16(cursor + 30); val commentLength = u16(cursor + 32); val localLong = u32(cursor + 42); val mode = (u32(cursor + 38) shr 16).toInt() and 0xf000
            if ((flags and 0x80e.inv()) != 0 || method !in listOf(0, 8) || u16(cursor + 34) != 0 || cursor.toLong() + 46 + nameLength + extraLength + commentLength > end || compressedLong > LIMIT || sizeLong > LIMIT || mode !in listOf(0, 0x4000, 0x8000) || localLong > start) invalid()
            val rawName = bytes.copyOfRange(cursor + 46, cursor + 46 + nameLength)
            val name = Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(rawName)).toString(); safePath(name)
            val key = Normalizer.normalize(name.removeSuffix("/"), Normalizer.Form.NFC).lowercase(Locale.ROOT); val directory = name.endsWith('/')
            if (names.containsKey(key) || directory && sizeLong != 0L || mode == 0x4000 && !directory) invalid()
            names[key] = directory; total += sizeLong; check(total <= LIMIT) { "附件包展开后的内容超过 13 MiB。" }; extra(cursor + 46 + nameLength, extraLength)
            val local = localLong.toInt(); val compressed = compressedLong.toInt(); val size = sizeLong.toInt()
            if (local.toLong() + 30 > start || u32(local) != 0x04034b50L || u16(local + 6) != flags || u16(local + 8) != method || u16(local + 26) != nameLength) invalid()
            val localExtra = u16(local + 28); val data = local + 30 + nameLength + localExtra
            if (data.toLong() + compressed > start || !rawName.contentEquals(bytes.copyOfRange(local + 30, local + 30 + nameLength))) invalid()
            if ((flags and 8) == 0 && (u32(local + 14) != u32(cursor + 16) || u32(local + 18) != compressedLong || u32(local + 22) != sizeLong)) invalid()
            extra(local + 30 + nameLength, localExtra)
            members.add(Member(name, size, compressed, method, u32(cursor + 16), local, data, data + compressed)); cursor += 46 + nameLength + extraLength + commentLength
        }
        if (cursor != end) invalid()
        val ordered = members.sortedBy { it.local }; if (ordered.first().local != 0) invalid()
        for (index in 1 until ordered.size) if (ordered[index].local < ordered[index - 1].end) invalid()
        names.forEach { (name, directory) -> if (!directory && names.keys.any { it.startsWith("$name/") }) invalid() }
        return members
    }
    private fun inflate(bytes: ByteArray, member: Member, maximum: Int): ByteArray {
        check(member.size <= maximum) { "附件「${member.name}」超过本次大小限制。" }
        val result = if (member.method == 0) bytes.copyOfRange(member.start, member.end) else {
            val inflater = Inflater(true); val output = ByteArrayOutputStream(); val buffer = ByteArray(16384)
            try {
                inflater.setInput(bytes, member.start, member.compressed)
                while (!inflater.finished()) {
                    val count = inflater.inflate(buffer)
                    check(output.size().toLong() + count <= maximum && output.size().toLong() + count <= member.size) { "附件包实际展开大小超限，没有写入任何笔记。" }
                    if (count > 0) output.write(buffer, 0, count) else if (!inflater.finished()) invalid()
                }
                if (inflater.remaining != 0) invalid(); output.toByteArray()
            } finally { inflater.end() }
        }
        check(result.size == member.size && CRC32().apply { update(result) }.value == member.crc) { "附件包成员「${member.name}」大小或 CRC 核对失败。" }
        return result
    }
    fun parse(bytes: ByteArray): Parsed {
        val all = members(bytes); val useful = all.filter { !it.name.startsWith("__MACOSX/") && it.name.substringAfterLast('/') != ".DS_Store" }
        val files = useful.filter { !it.name.endsWith('/') }; check(files.isNotEmpty()) { "附件包没有正文。" }
        val first = files.first().name.substringBefore('/'); val prefix = if (first.endsWith(".textbundle")) "$first/" else ""
        if (prefix.isNotEmpty() && useful.any { it.name != prefix && !it.name.startsWith(prefix) }) invalid()
        val decoded = LinkedHashMap<String, ByteArray>(); var assetBytes = 0; var ignoredBytes = 0
        all.forEach { member ->
            val name = member.name.removePrefix(prefix)
            if (!useful.contains(member)) { ignoredBytes += member.size; check(ignoredBytes <= 256 * 1024) { "系统元数据超过限制。" }; inflate(bytes, member, 64 * 1024) }
            else if (member.name.endsWith('/')) { inflate(bytes, member, 0) }
            else {
                val asset = name.startsWith("assets/")
                check(asset || name in listOf("info.json", "text.md", "text.markdown", "text.txt")) { "附件包包含不支持的文件「$name」。" }
                val data = inflate(bytes, member, if (name == "info.json") 64 * 1024 else if (asset) 2 * 1024 * 1024 else 4 * 1024 * 1024)
                if (asset) { assetBytes += data.size; check(assetBytes <= 8 * 1024 * 1024) { "附件合计超过 8 MiB。" } }; decoded[name] = data
            }
        }
        val texts = listOf("text.md", "text.markdown", "text.txt").filter { decoded.containsKey(it) }
        check(texts.size == 1 && decoded.containsKey("info.json")) { "附件包需要一份正文和 info.json，无法导入多个笔记或缺失正文的包。" }
        val textName = texts.first(); val info = JSONObject(text(decoded.getValue("info.json")).removePrefix("\uFEFF"))
        check(info.opt("version") is Number && (info.opt("version") as Number).toDouble() == 2.0 && info.optString("type", "net.daringfireball.markdown") == if (textName == "text.txt") "public.plain-text" else "net.daringfireball.markdown") { "当前支持 TextBundle V2 的 Markdown / TXT 附件包。" }
        var pixels = 0L
        val assets = decoded.filterKeys { it.startsWith("assets/") }.map { (name, data) ->
            var width = 0; var height = 0
            if (Regex("(?i).*\\.(png|jpe?g|webp)$").matches(name)) {
                val image = BitmapFactory.Options().apply { inJustDecodeBounds = true }; BitmapFactory.decodeByteArray(data, 0, data.size, image)
                width = image.outWidth; height = image.outHeight
                check(width > 0 && height > 0 && width.toLong() * height <= 8000000 && image.outMimeType in listOf("image/png", "image/jpeg", "image/webp")) { "包内图片损坏或超过当前图片限制。" }
                pixels += width.toLong() * height; check(pixels <= 12000000) { "图片总量超过本次 1,200 万像素预算。" }
                val decoded = BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply { inSampleSize = 2 })
                check(decoded != null) { "包内图片「$name」无法正常解码，请重新导出。" }; decoded.recycle()
            }
            Asset(name, data, width, height)
        }
        check(assets.size <= 24) { "一次最多导入 24 个附件。" }
        return Parsed(text(decoded.getValue(textName)), textName, assets)
    }
}
