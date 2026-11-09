package com.longyuye.mdreader.storagefixture;

import android.database.Cursor;
import android.database.MatrixCursor;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import org.json.JSONObject;
import android.provider.DocumentsContract.Document;
import android.provider.DocumentsContract.Root;
import android.provider.DocumentsProvider;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** Separate test APK: contains only deterministic fixture text, never user files. */
public final class FixtureProvider extends DocumentsProvider {
    private static final String[] ROOTS = { Root.COLUMN_ROOT_ID, Root.COLUMN_DOCUMENT_ID, Root.COLUMN_TITLE, Root.COLUMN_FLAGS, Root.COLUMN_MIME_TYPES };
    private static final String[] DOCS = { Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME, Document.COLUMN_MIME_TYPE, Document.COLUMN_FLAGS, Document.COLUMN_SIZE, Document.COLUMN_LAST_MODIFIED };
    private static final String[] SCENARIOS = { "readonly", "offline", "unconfirmed", "nulls", "duplicate", "nospace", "interrupted", "create-safe", "create-renamed", "create-alias", "export-safe", "export-unconfirmed", "export-nospace", "export-metadata-error", "import-safe", "import-same", "import-txt", "import-invalid", "import-large", "import-offline", "import-wrongtype", "incoming-good", "incoming-clip", "incoming-invalid", "incoming-large", "incoming-offline", "incoming-wrongtype", "incoming-nogrant", "incoming-denied", "incoming-fresh", "pack-alias", "pack-import-safe", "pack-import-same", "pack-import-stored", "pack-import-traversal", "pack-import-missing", "pack-import-invalid", "pack-import-wrongtype", "pack-import-txt", "pack-import-offline", "pack-import-crc", "pack-import-bomb", "pack-import-symlink", "json-source", "json-invalid", "yaml-source", "yaml-invalid", "yaml-structure", "xml-source", "xml-invalid", "xml-structure", "toml-source", "toml-invalid", "toml-structure", "code-source", "code-rust", "code-vue", "pdf-reading", "pdf-navigation", "pdf-incoming-broken", "pdf-incoming-large", "pdf-incoming-offline", "pdf-incoming-denied" };
    private boolean creation(String id) { return id.equals("pack-alias") || id.equals("export-safe") || id.equals("export-unconfirmed") || id.equals("export-nospace") || id.equals("export-metadata-error") || id.equals("create-safe") || id.equals("create-renamed") || id.equals("create-alias"); }
    private static final String[] EXTERNAL = {"external-shiny","external-fsnotes","external-generic","external-multi","external-missing"};
    private String externalAsset(String root) { switch(root) { case "external-shiny": return "shinyfrog-v2.textpack"; case "external-fsnotes": return "fsnotes-ios.textpack"; case "external-generic": return "not-a-bundle.zip"; case "external-multi": return "multiple-notes.zip"; case "external-missing": return "missing-assets.zip"; default: return null; } }
    private String externalName(String root) { switch(root) { case "external-shiny": return "公开示例.zip"; case "external-fsnotes": return "FSNotes笔记.zip"; case "external-generic": return "普通文件.zip"; case "external-multi": return "多篇笔记.zip"; default: return "缺失附件.zip"; } }
    @Override public boolean onCreate() { return true; }
    private boolean valid(String id) {
        String[] parts = id.split("/", -1);
        if (creation(parts[0])) return parts.length == 1 || (parts.length == 2 && !parts[1].isEmpty() && !parts[1].equals(".") && !parts[1].equals("..") && !parts[1].contains("\\"));
        for (String root : SCENARIOS) if (id.equals(root) || id.equals(root + "/note")) return true;
        for (String root : EXTERNAL) if (id.equals(root) || id.equals(root + "/note")) return true;
        return id.equals("duplicate/other");
    }
    private void check(String id) throws FileNotFoundException { if (!valid(id)) throw new FileNotFoundException("Unknown fixture"); }
    private File fixtureFile(String id) throws FileNotFoundException {
        check(id);
        String root = id.split("/")[0];
        if (root.equals("pdf-reading") || root.equals("pdf-navigation")) {
            File file = new File(getContext().getFilesDir(), root + ".source");
            String asset = root.equals("pdf-reading") ? "pdf-reading/reading-guide.pdf" : "pdf-navigation/navigation-guide.pdf";
            if (!file.exists()) try (java.io.InputStream source = getContext().getAssets().open(asset); FileOutputStream target = new FileOutputStream(file)) { byte[] buffer = new byte[16384]; int count; while ((count=source.read(buffer))>=0) target.write(buffer,0,count); }
            catch (IOException error) { throw new FileNotFoundException(error.getMessage()); }
            return file;
        }
        if (root.equals("code-rust") || root.equals("code-vue")) {
            File file = new File(getContext().getFilesDir(), root + ".source");
            String asset = "code-languages/" + root + (root.equals("code-rust") ? ".rs" : ".vue");
            if (!file.exists()) try (java.io.InputStream source = getContext().getAssets().open(asset); FileOutputStream target = new FileOutputStream(file)) { byte[] buffer = new byte[16384]; int count; while ((count=source.read(buffer))>=0) target.write(buffer,0,count); }
            catch (IOException error) { throw new FileNotFoundException(error.getMessage()); }
            return file;
        }
        if (root.equals("code-source")) {
            File file = new File(getContext().getFilesDir(), root + ".source");
            if (!file.exists()) try (java.io.InputStream source = getContext().getAssets().open("code-source/code-source.js"); FileOutputStream target = new FileOutputStream(file)) { byte[] buffer = new byte[16384]; int count; while ((count=source.read(buffer))>=0) target.write(buffer,0,count); }
            catch (IOException error) { throw new FileNotFoundException(error.getMessage()); }
            return file;
        }
        if (root.equals("toml-source") || root.equals("toml-invalid") || root.equals("toml-structure")) {
            File file = new File(getContext().getFilesDir(), root + ".source");
            if (!file.exists()) try (java.io.InputStream source = getContext().getAssets().open("toml-source/" + root + ".toml"); FileOutputStream target = new FileOutputStream(file)) { byte[] buffer = new byte[16384]; int count; while ((count=source.read(buffer))>=0) target.write(buffer,0,count); }
            catch (IOException error) { throw new FileNotFoundException(error.getMessage()); }
            return file;
        }
        if (root.equals("xml-source") || root.equals("xml-invalid") || root.equals("xml-structure")) {
            File file = new File(getContext().getFilesDir(), root + ".source");
            if (!file.exists()) try (java.io.InputStream source = getContext().getAssets().open((root.equals("xml-structure") ? "xml-structure/" : "xml-source/") + root + ".xml"); FileOutputStream target = new FileOutputStream(file)) { byte[] buffer = new byte[16384]; int count; while ((count=source.read(buffer))>=0) target.write(buffer,0,count); }
            catch (IOException error) { throw new FileNotFoundException(error.getMessage()); }
            return file;
        }
        if (root.equals("yaml-source") || root.equals("yaml-invalid") || root.equals("yaml-structure")) {
            File file = new File(getContext().getFilesDir(), root + ".source");
            if (!file.exists()) try (java.io.InputStream source = getContext().getAssets().open("yaml-source/" + root + (root.equals("yaml-source") ? ".yaml" : ".yml")); FileOutputStream target = new FileOutputStream(file)) { byte[] buffer = new byte[16384]; int count; while ((count=source.read(buffer))>=0) target.write(buffer,0,count); }
            catch (IOException error) { throw new FileNotFoundException(error.getMessage()); }
            return file;
        }
        if (root.equals("json-source") || root.equals("json-invalid")) {
            File file = new File(getContext().getFilesDir(), root + ".source");
            if (!file.exists()) try (java.io.InputStream source = getContext().getAssets().open("json-source/" + root + ".json"); FileOutputStream target = new FileOutputStream(file)) { byte[] buffer = new byte[16384]; int count; while ((count=source.read(buffer))>=0) target.write(buffer,0,count); }
            catch (IOException error) { throw new FileNotFoundException(error.getMessage()); }
            return file;
        }
        if (externalAsset(root) != null) {
            File file = new File(getContext().getFilesDir(), root + ".source");
            if (!file.exists()) try (java.io.InputStream source = getContext().getAssets().open(externalAsset(root)); FileOutputStream target = new FileOutputStream(file)) { byte[] buffer = new byte[16384]; int count; while ((count=source.read(buffer))>=0) target.write(buffer,0,count); }
            catch (IOException error) { throw new FileNotFoundException(error.getMessage()); }
            return file;
        }
        if (root.startsWith("pack-import-")) {
            File file = new File(getContext().getFilesDir(), root + ".source");
            if (!file.exists()) try (java.io.InputStream source = getContext().getAssets().open("pack-import/" + root.substring("pack-import-".length()) + ".textpack"); FileOutputStream target = new FileOutputStream(file)) {
                byte[] buffer = new byte[16384]; int count; while ((count = source.read(buffer)) >= 0) target.write(buffer, 0, count);
            } catch (IOException error) { throw new FileNotFoundException(error.getMessage()); }
            return file;
        }
        if (creation(root)) {
            File directory = new File(getContext().getFilesDir(), root);
            if (!directory.exists() && !directory.mkdirs()) throw new FileNotFoundException("Fixture folder unavailable");
            File original = new File(directory, "Existing.md");
            if (!original.exists()) try (FileOutputStream out = new FileOutputStream(original)) { out.write((root.equals("pack-alias") ? "# Empty attachment\r\n[空附件](empty.pdf)\r\n" : "# Existing original\r\n\r\n已有中文😀必须保留。\r\n").getBytes(StandardCharsets.UTF_8)); }
            catch (IOException error) { throw new FileNotFoundException(error.getMessage()); }
            if (root.equals("pack-alias")) {
                File empty = new File(directory, "empty.pdf");
                if (!empty.exists()) try (FileOutputStream ignored = new FileOutputStream(empty)) { }
                catch (IOException error) { throw new FileNotFoundException(error.getMessage()); }
            }
            return id.equals(root) ? directory : new File(directory, id.substring(root.length() + 1));
        }
        File file = new File(getContext().getFilesDir(), (root.startsWith("import-") || root.startsWith("incoming-")) ? root + ".source" : root.equals("nospace") || root.equals("interrupted") ? root + ".md" : id.startsWith("readonly") ? "readonly.md" : "unconfirmed.md");
        if (!file.exists()) try (FileOutputStream out = new FileOutputStream(file)) {
            String original = "# Provider original\n\n原始中文内容必须保留。\n";
            if (root.equals("interrupted")) {
                StringBuilder source = new StringBuilder("# Interrupted original\r\n\r\n");
                for (int i = 0; i < 8192; i++) source.append("Original 中文😀\r\n");
                original = source.append("TailRecover\r\n保留最后一句。\r\n").toString();
            }
            if (root.startsWith("incoming-")) original = "\ufeff# Incoming 中文😀\r\n首行\r尾行\n![图](images/a.png)\r\n";
            if (root.startsWith("import-")) original = "\ufeff# Import 中文😀\r\n首行\r尾行\n![图](images/a.png)\r\n" + (root.equals("import-same") ? "第二份同名内容\r\n" : "");
            if ((root.equals("import-invalid") || root.equals("incoming-invalid"))) out.write(new byte[] { (byte)0xff, (byte)0xfe, 65, 0 });
            else if ((root.equals("import-large") || root.equals("incoming-large"))) { byte[] block = new byte[65536]; java.util.Arrays.fill(block, (byte)65); for(int i=0;i<64;i++) out.write(block); out.write(65); }
            else out.write(original.getBytes(StandardCharsets.UTF_8));
        } catch (IOException error) { throw new FileNotFoundException(error.getMessage()); }
        return file;
    }
    @Override public Cursor queryRoots(String[] projection) {
        MatrixCursor result = new MatrixCursor(projection == null ? ROOTS : projection);
        java.util.ArrayList<String> scenarios = new java.util.ArrayList<>(java.util.Arrays.asList(SCENARIOS)); scenarios.addAll(java.util.Arrays.asList(EXTERNAL));
        for (String scenario : scenarios) {
            MatrixCursor.RowBuilder row = result.newRow();
            row.add(Root.COLUMN_ROOT_ID, scenario).add(Root.COLUMN_DOCUMENT_ID, scenario)
                .add(Root.COLUMN_TITLE, "LongEdit Test " + scenario).add(Root.COLUMN_MIME_TYPES, "text/markdown\ntext/plain\napplication/json\napplication/zip\napplication/octet-stream\napplication/pdf")
                .add(Root.COLUMN_FLAGS, Root.FLAG_LOCAL_ONLY | Root.FLAG_SUPPORTS_IS_CHILD | (creation(scenario) ? Root.FLAG_SUPPORTS_CREATE : 0));
        }
        return result;
    }
    private void addDocument(MatrixCursor result, String id) throws FileNotFoundException {
        check(id); boolean folder = !id.contains("/");
        MatrixCursor.RowBuilder row = result.newRow();
        String root = id.split("/")[0]; boolean writable = root.equals("unconfirmed") || root.equals("nospace") || root.equals("interrupted") || creation(root);
        if (creation(root) && !fixtureFile(id).exists()) throw new FileNotFoundException("Unknown fixture file");
        row.add(Document.COLUMN_DOCUMENT_ID, id).add(Document.COLUMN_DISPLAY_NAME, folder ? "LongEdit Test " + id : root.startsWith("pdf-incoming-") ? root.substring(13)+".pdf" : root.equals("pdf-navigation") ? "MobileNavigation.pdf" : root.equals("pdf-reading") ? "MobileReading.pdf" : root.equals("code-rust") ? "MobileRust.rs" : root.equals("code-vue") ? "MobileComponent.vue" : root.equals("code-source") ? "MobileSource.js" : root.equals("toml-structure") ? "StructureConfig.toml" : root.equals("toml-source") ? "MobileConfig.toml" : root.equals("toml-invalid") ? "RepairConfig.toml" : root.equals("xml-structure") ? "StructureXML.xml" : root.equals("xml-source") ? "MobileXML.xml" : root.equals("xml-invalid") ? "RepairXML.xml" : root.equals("yaml-structure") ? "StructureConfig.yml" : root.equals("yaml-source") ? "MobileConfig.yaml" : root.equals("yaml-invalid") ? "RepairConfig.yml" : root.equals("json-source") ? "MobileData.json" : root.equals("json-invalid") ? "Unfinished.json" : externalAsset(root)!=null ? externalName(root) : root.startsWith("pack-import-") ? root.equals("pack-import-safe") || root.equals("pack-import-same") ? "携带.textpack" : root.equals("pack-import-wrongtype") ? "Wrong.zip" : root + ".textpack" : root.startsWith("incoming-") ? root.equals("incoming-wrongtype") ? "Wrong.pdf" : "Inbox.md" : root.startsWith("import-") ? root.equals("import-safe") || root.equals("import-same") ? "Import.md" : root.equals("import-wrongtype") ? "Unsupported.pdf" : root + ".txt" : creation(root) ? fixtureFile(id).getName() : root.equals("nospace") || root.equals("interrupted") ? root + "-note.md" : "provider-note.md")
            .add(Document.COLUMN_MIME_TYPE, folder ? Document.MIME_TYPE_DIR : (root.equals("pdf-reading") || root.equals("pdf-navigation") || root.startsWith("pdf-incoming-")) ? "application/pdf" : root.equals("code-rust") ? "text/x-rust" : root.equals("code-vue") ? "text/x-vue" : root.equals("code-source") ? "text/javascript" : root.startsWith("toml-") ? "application/toml" : root.startsWith("xml-") ? "application/xml" : root.startsWith("yaml-") ? "application/yaml" : root.startsWith("json-") ? "application/json" : root.startsWith("pack-import-") || externalAsset(root)!=null ? "application/octet-stream" : id.endsWith(".txt") || root.startsWith("import-") ? "text/plain" : "text/markdown")
            .add(Document.COLUMN_FLAGS, writable ? (folder ? Document.FLAG_DIR_SUPPORTS_CREATE : Document.FLAG_SUPPORTS_WRITE) : 0)
            .add(Document.COLUMN_SIZE, id.startsWith("nulls") ? null : folder ? 0 : root.equals("pdf-incoming-large") ? 20L*1024*1024+1 : root.startsWith("pdf-incoming-") ? 20 : fixtureFile(id).length()).add(Document.COLUMN_LAST_MODIFIED, id.startsWith("nulls") ? null : 1792756800000L);
    }
    @Override public Cursor queryDocument(String id, String[] projection) throws FileNotFoundException {
        // Exercise best-effort export metadata only after actual bytes exist.
        if (id.startsWith("export-metadata-error/") && fixtureFile(id).length() > 0) {
            try (FileOutputStream audit = new FileOutputStream(new File(getContext().getFilesDir(), "export-metadata-error-queries.txt"), true)) {
                audit.write((android.os.Binder.getCallingUid() + " " + id + " " + fixtureFile(id).length() + "\n").getBytes(StandardCharsets.UTF_8));
            } catch (IOException error) { throw new FileNotFoundException(error.getMessage()); }
            throw new FileNotFoundException("Synthetic exported-name metadata unavailable");
        }
        MatrixCursor result = new MatrixCursor(projection == null ? DOCS : projection); addDocument(result, id); return result;
    }
    @Override public Cursor queryChildDocuments(String parent, String[] projection, String sortOrder) throws FileNotFoundException {
        check(parent); if (parent.equals("offline")) throw new FileNotFoundException("Fixture provider offline");
        MatrixCursor result = new MatrixCursor(projection == null ? DOCS : projection);
        if (creation(parent)) {
            File[] files = fixtureFile(parent).listFiles();
            if (files == null) throw new FileNotFoundException("Fixture enumeration unavailable");
            for (File file : files) addDocument(result, parent + "/" + file.getName());
            return result;
        }
        addDocument(result, parent + "/note");
        if (parent.equals("duplicate")) addDocument(result, parent + "/other");
        return result;
    }
    @Override public boolean isChildDocument(String parent, String child) { return valid(parent) && valid(child) && child.startsWith(parent + "/"); }
    @Override public ParcelFileDescriptor openDocument(String id, String mode, CancellationSignal signal) throws FileNotFoundException {
        check(id); if (!id.contains("/")) throw new FileNotFoundException("Not a file");
        if (!mode.contains("w")) {
            String root = id.split("/")[0];
            if(root.startsWith("pdf-incoming-")) {
                if(root.equals("pdf-incoming-offline")) throw new FileNotFoundException("Synthetic PDF source unavailable");
                try { final ParcelFileDescriptor[] pipe=ParcelFileDescriptor.createPipe();new Thread(()->{try(FileOutputStream output=new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])){if(root.equals("pdf-incoming-large")){byte[] block=new byte[16384];block[0]='%';block[1]='P';block[2]='D';block[3]='F';block[4]='-';int remaining=20*1024*1024+1;while(remaining>0){int n=Math.min(block.length,remaining);output.write(block,0,n);remaining-=n;}}else output.write("This is not a PDF.".getBytes(StandardCharsets.UTF_8));}catch(IOException ignored){}},"synthetic-pdf-stream").start();return pipe[0];}catch(IOException e){throw new FileNotFoundException("Synthetic stream unavailable");}
            }
            if (externalAsset(root)!=null) {
                try (FileOutputStream audit = new FileOutputStream(new File(getContext().getFilesDir(),root+"-reads.txt"),true)) { audit.write((id+"\n").getBytes(StandardCharsets.UTF_8)); }
                catch(IOException error) { throw new FileNotFoundException(error.getMessage()); }
            }
            if (root.startsWith("pack-import-")) {
                try (FileOutputStream audit = new FileOutputStream(new File(getContext().getFilesDir(), root + "-reads.txt"), true)) { audit.write((id + "\n").getBytes(StandardCharsets.UTF_8)); }
                catch (IOException error) { throw new FileNotFoundException(error.getMessage()); }
                if (root.equals("pack-import-offline") || new File(getContext().getFilesDir(), root + "-offline").exists()) throw new FileNotFoundException("Synthetic package source offline");
            }
            if (root.startsWith("import-") || root.startsWith("incoming-")) {
                try (FileOutputStream audit = new FileOutputStream(new File(getContext().getFilesDir(), root + "-reads.txt"), true)) { audit.write((id + "\n").getBytes(StandardCharsets.UTF_8)); }
                catch (IOException error) { throw new FileNotFoundException(error.getMessage()); }
                if (root.equals("import-offline") || root.equals("incoming-offline") || new File(getContext().getFilesDir(), root + "-offline").exists()) throw new FileNotFoundException("Synthetic import provider unavailable");
            }
            return ParcelFileDescriptor.open(fixtureFile(id), ParcelFileDescriptor.MODE_READ_ONLY);
        }
        if (creation(id.split("/")[0])) {
            try (FileOutputStream audit = new FileOutputStream(new File(getContext().getFilesDir(), id.split("/")[0] + "-writes.txt"), true)) { audit.write((id + "\n").getBytes(StandardCharsets.UTF_8)); }
            catch (IOException error) { throw new FileNotFoundException(error.getMessage()); }
            if (id.startsWith("export-nospace/")) throw new FileNotFoundException("ENOSPC: synthetic export destination full");
            if (id.startsWith("export-unconfirmed/")) return discardWrite();
            return ParcelFileDescriptor.open(fixtureFile(id), ParcelFileDescriptor.MODE_WRITE_ONLY | ParcelFileDescriptor.MODE_TRUNCATE);
        }
        if (id.startsWith("nospace/")) throw new FileNotFoundException("ENOSPC: synthetic provider quota exhausted before opening target");
        if (id.startsWith("interrupted/")) return interruptedWrite(id);
        if (!id.startsWith("unconfirmed")) throw new SecurityException("Fixture is read only");
        // Accept the write through Android's real provider pipe but retain the
        // original file. The application's readback must detect the mismatch.
        return discardWrite();
    }
    private ParcelFileDescriptor discardWrite() throws FileNotFoundException {
        try {
            final ParcelFileDescriptor[] pipe = ParcelFileDescriptor.createReliablePipe();
            new Thread(() -> {
                try (ParcelFileDescriptor.AutoCloseInputStream input = new ParcelFileDescriptor.AutoCloseInputStream(pipe[0])) {
                    byte[] buffer = new byte[16384]; while (input.read(buffer) >= 0) { /* Deliberately discard fixture writes. */ }
                } catch (IOException ignored) { }
            }, "fixture-discard-writer").start();
            return pipe[1];
        } catch (IOException error) { throw new FileNotFoundException(error.getMessage()); }
    }
    @Override public String createDocument(String parent, String mimeType, String displayName) throws FileNotFoundException {
        check(parent);
        if (!creation(parent) || displayName.isEmpty() || displayName.contains("/") || displayName.contains("\\") || displayName.equals(".") || displayName.equals("..")) throw new FileNotFoundException("Unsupported fixture creation");
        File directory = fixtureFile(parent);
        if (parent.equals("create-alias")) return parent + "/Existing.md";
        if (parent.equals("pack-alias")) return parent + "/empty.pdf";
        String name = parent.equals("create-renamed") ? "Renamed-" + displayName : displayName;
        try {
            if (!new File(directory, name).createNewFile()) throw new FileNotFoundException("Fixture name already exists");
            return parent + "/" + name;
        } catch (IOException error) { throw new FileNotFoundException(error.getMessage()); }
    }
    private ParcelFileDescriptor interruptedWrite(String id) throws FileNotFoundException {
        final File target = fixtureFile(id);
        try {
            final ParcelFileDescriptor[] pipe = ParcelFileDescriptor.createReliablePipe();
            final String attempt = UUID.randomUUID().toString();
            new Thread(() -> {
                try (ParcelFileDescriptor.AutoCloseInputStream input = new ParcelFileDescriptor.AutoCloseInputStream(pipe[0])) {
                    byte[] prefix = new byte[8]; int count = 0;
                    while (count < prefix.length) { int read = input.read(prefix, count, prefix.length - count); if (read < 0) throw new IOException("Writer ended before fixture prefix"); count += read; }
                    try (FileOutputStream output = new FileOutputStream(target, false)) { output.write(prefix); output.flush(); output.getFD().sync(); }
                    JSONObject marker = new JSONObject().put("attempt", attempt).put("prefixBytes", count);
                    try (FileOutputStream output = new FileOutputStream(new File(getContext().getFilesDir(), "interrupted-started.json"))) { output.write(marker.toString().getBytes(StandardCharsets.UTF_8)); }
                    File release = new File(getContext().getFilesDir(), "interrupt-release-" + attempt);
                    long deadline = SystemClock.elapsedRealtime() + 60000;
                    while (!release.exists() && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(50);
                    // Keep only the real first eight submitted bytes. Never drain or
                    // acknowledge the rest: the test kills the writer while blocked.
                    pipe[0].closeWithError("Controlled interruption after partial provider commit");
                } catch (Exception error) { try { pipe[0].closeWithError("Fixture interruption failed: " + error.getMessage()); } catch (IOException ignored) { } }
            }, "fixture-partial-commit").start();
            return pipe[1];
        } catch (IOException error) { throw new FileNotFoundException(error.getMessage()); }
    }
}
