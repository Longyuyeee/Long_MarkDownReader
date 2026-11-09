package com.longyuye.longedit.storage

import android.system.Os
import android.system.OsConstants
import android.util.AtomicFile
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.UUID

/** Temporary content grants are consumed once into private, bounded intake.
 * Explicit confirmation promotes a verified independent copy; never writes the URI. */
internal class PdfImports(files: File) {
    private val directory = File(files,"pdf-imports-v1").canonicalFile
    private val library = File(files,"library").canonicalFile
    private val pattern = Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
    private val limit = 20*1024*1024
    private fun inside(base:File,path:String):File { val f=File(base,path);check(path.isNotEmpty()&&f.canonicalPath==f.absolutePath&&f.canonicalPath.startsWith(base.canonicalPath+File.separator)){"PDF 接收位置无效，已有文件未改动。"};return f }
    private fun own(id:String,extension:String):File {check(pattern.matches(id)){"PDF 接收记录编号无效。"};return inside(directory,"$id.$extension")}
    private fun read(f:File,maximum:Int):ByteArray = AtomicFile(f).openRead().use { input -> val out=ByteArrayOutputStream();val buffer=ByteArray(16384);while(true){val n=input.read(buffer);if(n<0)break;check(out.size().toLong()+n<=maximum){"PDF 内容超过读取限制。"};out.write(buffer,0,n)};out.toByteArray() }
    private fun atomic(f:File,bytes:ByteArray){f.parentFile?.mkdirs();val atomic=AtomicFile(f);val stream=atomic.startWrite();try{stream.write(bytes);atomic.finishWrite(stream)}catch(e:Exception){atomic.failWrite(stream);throw e};check(read(f,bytes.size+1).contentEquals(bytes)){"PDF 本机写入未确认，接收记录仍保留。"}}
    private fun save(r:JSONObject)=atomic(own(r.getString("id"),"json"),r.toString().toByteArray(Charsets.UTF_8))
    private fun ids()=directory.listFiles().orEmpty().map{it.name.substringBefore('.')}.filter{pattern.matches(it)}.distinct()
    fun contains(id:String)=ids().contains(id)
    private fun base(id:String):JSONObject {val r=JSONObject(String(read(own(id,"json"),16384),Charsets.UTF_8));check(r.optInt("version")==1&&r.getString("id")==id&&r.optString("status") in listOf("preparing","ready","imported","failed")&&r.optLong("bytes") in 0..limit.toLong()){ "PDF 接收记录无法读取，原记录仍保留。" };return r}
    private fun summary(r:JSONObject)=JSONObject(r.toString()).apply{remove("version");put("readable",true);if(optString("status")=="preparing"){put("status","failed");put("error","上次接收未完成，可重新核对；原文件保持原样。")}}
    fun list()=JSONArray().apply{ids().map{id->try{summary(base(id))}catch(_:Exception){JSONObject().put("id",id).put("name","暂时无法读取的 PDF 接收记录").put("created",own(id,"json").lastModified()).put("bytes",0).put("status","failed").put("readable",false).put("error","记录仍保留，可刷新重试或移除。").put("incoming",true).put("source","share-file").put("digest","").put("localPath",JSONObject.NULL)}}.sortedByDescending{it.optLong("created")}.forEach{put(it)}}
    private fun safeName(name:String):String {val base=name.replace(Regex("(?i)\\.pdf$"),"").replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"),"_").trimStart('.').trim();val p=base.codePoints().limit(40).toArray();return (if(p.isEmpty())"阅读资料" else String(p,0,p.size))+".pdf"}
    private fun source(r:JSONObject):ByteArray {val b=read(own(r.getString("id"),"pdf"),limit);check(b.size==r.optInt("bytes")&&PackageArchive.hash(b)==r.optString("digest")&&b.size>=5&&String(b,0,5,Charsets.US_ASCII)=="%PDF-"){"PDF 接收内容核对失败，原记录仍保留，请重新分享。"};return b}
    private fun friendly(e:Exception)=if(e is java.io.IOException)"PDF 读取或本机保护未完成，请检查文件访问和本机空间，再重新分享。" else e.message?:"PDF 接收未完成，请重新分享。"
    fun stage(name:String,origin:String,id:String=UUID.randomUUID().toString(),load:()->ByteArray):JSONObject {
        check(ids().size<6){"已保留 6 条 PDF 接收记录，请先移除不需要的记录；已存入的 PDF 不会删除。"}
        check(pattern.matches(id)&&!contains(id)){"PDF 接收记录已存在，请从接收记录继续。"}
        // Unknown/corrupt records are never silently evicted to make capacity.
        val used=ids().sumOf{maxOf(own(it,"pdf").length(),File(own(it,"pdf").path+".bak").length())}
        val r=JSONObject().put("version",1).put("id",id).put("name",safeName(name)).put("created",System.currentTimeMillis()).put("bytes",0).put("status","preparing").put("incoming",true).put("source",origin).put("error","").put("digest","").put("localPath",JSONObject.NULL)
        save(r)
        try {val b=load();check(b.isNotEmpty()&&b.size<=limit){"当前支持 20 MiB 以内的 PDF。"};check(b.size>=5&&String(b,0,5,Charsets.US_ASCII)=="%PDF-"){"这个文件没有可识别的 PDF 文件头，请重新分享。"};check(used+b.size<=80L*1024*1024){"PDF 接收记录已达 80 MiB，请先移除不需要的记录，再重新分享。"};r.put("bytes",b.size).put("digest",PackageArchive.hash(b));save(r);atomic(own(id,"pdf"),b);source(r);r.put("status","ready");save(r)}catch(e:Exception){r.put("status","failed").put("error",friendly(e));save(r)}
        return summary(base(id))
    }
    fun detail(id:String):JSONObject {val r=base(id);if(r.optString("status")=="preparing"){try{source(r);r.put("status","ready").put("error","")}catch(e:Exception){r.put("status","failed").put("error",friendly(e))};save(r)};val out=summary(r).put("base64",JSONObject.NULL);if(r.optString("status")=="ready")out.put("base64",Base64.encodeToString(source(r),Base64.NO_WRAP));return out}
    private fun target(r:JSONObject):String {val name=safeName(r.getString("name"));return name.dropLast(4)+"-接收-"+r.getString("id")+".pdf"}
    private fun verify(target:File,r:JSONObject){val b=read(target,limit);check(b.size==r.optInt("bytes")&&PackageArchive.hash(b)==r.optString("digest")){"已存入的 PDF 已变化，未覆盖；接收记录仍保留，请核对手机资料库。"}}
    fun commit(id:String,expected:String):String {
        val r=base(id);check(Regex("[a-f0-9]{64}").matches(expected)&&r.optString("digest")==expected&&r.optString("status") in listOf("ready","imported")){"请先重新核对这份 PDF，接收记录仍保留。"}
        val path=target(r);val destination=inside(library,path);val claimed=!r.isNull("localPath");check(!claimed||r.getString("localPath")==path){"PDF 导入目标不匹配，已有文件未改动。"}
        if(r.optString("status")=="imported"){verify(destination,r);return path}
        val b=source(r)
        if(destination.exists()){check(claimed){"同名 PDF 已存在，未覆盖已有文件。"};verify(destination,r)}
        else {r.put("localPath",path);save(r);library.mkdirs();val pending=own(id,"pending");atomic(pending,b);check(!destination.exists()&&pending.renameTo(destination)){"PDF 副本尚未完整存入，接收内容仍保留，可重试。"};for(parent in listOf(library,directory)){val fd=Os.open(parent.path,OsConstants.O_RDONLY,0);try{Os.fsync(fd)}finally{Os.close(fd)}};verify(destination,r)}
        r.put("localPath",path).put("status","imported").put("incoming",false).put("error","");save(r);check(base(id).optString("status")=="imported"){"PDF 回执尚未确认，可从接收记录重试。"};return path
    }
    fun acknowledge(id:String){val r=base(id);r.put("incoming",false);save(r)}
    fun remove(id:String){check(contains(id)){"没有找到这条 PDF 接收记录。"};for(ext in listOf("pdf","pending")){AtomicFile(own(id,ext)).delete()};AtomicFile(own(id,"json")).delete();check(!contains(id)){"PDF 接收记录尚未移除，请重试。"}}
}
