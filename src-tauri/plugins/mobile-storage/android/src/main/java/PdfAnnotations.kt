package com.longyuye.longedit.storage

import org.json.JSONObject

/** Desktop schema v1, validated again at the native write boundary. */
internal object PdfAnnotations {
    private fun check(value: Boolean) { require(value) { "批注文件格式无效，原记录仍保留。" } }
    private fun text(value: Any?, max: Int) = value is String && value.codePointCount(0,value.length) <= max
    private fun integer(value: Any?) = value is Number && value.toDouble().isFinite() && value.toDouble() >= 0 && value.toDouble() <= 9007199254740991.0 && value.toDouble() == value.toLong().toDouble()
    fun parse(content: String, name: String): JSONObject {
        check(content.toByteArray(Charsets.UTF_8).size <= 5*1024*1024)
        val d=JSONObject(content)
        check(d.getInt("schemaVersion") == 1 && integer(d.get("schemaVersion")))
        val s=d.getJSONObject("source")
        check(text(s.get("pdfFile"),255) && s.getString("pdfFile")==name && integer(s.get("size")) && integer(s.get("modifiedAt")))
        check(!s.has("fingerprint") || text(s.get("fingerprint"),512))
        val annotations=d.getJSONArray("annotations");check(annotations.length()<=5000)
        val ids=mutableSetOf<String>()
        for (i in 0 until annotations.length()) {
            val a=annotations.getJSONObject(i)
            check(text(a.get("id"),128) && a.getString("id").isNotBlank() && ids.add(a.getString("id")))
            check(a.getString("kind") in listOf("highlight","area","comment") && a.getString("color") in listOf("yellow","green","pink","blue"))
            check(integer(a.get("page")) && a.getLong("page") in 1L..100000L)
            check(text(a.get("quote"),20000) && text(a.get("comment"),20000) && integer(a.get("createdAt")) && integer(a.get("updatedAt")) && a.getLong("updatedAt")>=a.getLong("createdAt"))
            val rects=a.getJSONArray("rects");check(rects.length()<=200)
            check(a.getString("kind")=="comment" || rects.length()>0)
            check(a.getString("kind")!="highlight" || a.getString("quote").isNotBlank())
            for (n in 0 until rects.length()) {
                val r=rects.getJSONObject(n)
                val numbers=listOf("x","y","width","height").map { r.get(it) }
                check(numbers.all { it is Number && it.toDouble().isFinite() })
                val x=r.getDouble("x");val y=r.getDouble("y");val w=r.getDouble("width");val h=r.getDouble("height")
                check(x>=0 && y>=0 && w>0 && h>0 && x+w<=1.000001 && y+h<=1.000001)
            }
        }
        return d
    }
}
