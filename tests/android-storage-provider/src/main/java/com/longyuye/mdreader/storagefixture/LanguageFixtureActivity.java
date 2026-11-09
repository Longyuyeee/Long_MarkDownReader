package com.longyuye.mdreader.storagefixture;
import android.app.Activity;
import android.content.ClipData;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.widget.Button;
import android.widget.LinearLayout;

/** Isolated readonly source fixtures. No compiler, interpreter or network. */
public final class LanguageFixtureActivity extends Activity {
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        LinearLayout list = new LinearLayout(this); list.setOrientation(LinearLayout.VERTICAL);
        for (String action : new String[]{"Share Rust", "Open Vue source", "Share SQL text"}) {
            Button button = new Button(this); button.setText(action); button.setAllCaps(false); list.addView(button);
            button.setOnClickListener(view -> send(action));
        }
        setContentView(list);
    }
    private void send(String action) {
        boolean vue = action.equals("Open Vue source"), sql = action.equals("Share SQL text");
        String mime = sql ? "application/sql" : vue ? "text/x-vue" : "text/x-rust";
        Intent outgoing = new Intent(vue ? Intent.ACTION_VIEW : Intent.ACTION_SEND).setType(mime);
        if (sql) outgoing.putExtra(Intent.EXTRA_TEXT, "-- 合成 SQL😎\r\nSELECT '你好' AS name;\n");
        else {
            Uri uri = DocumentsContract.buildDocumentUri("com.longyuye.mdreader.storagefixture.documents", (vue ? "code-vue" : "code-rust") + "/note");
            try (android.database.Cursor ignored = getContentResolver().query(uri, null, null, null, null)) { }
            outgoing.setClipData(ClipData.newRawUri("Synthetic source language", uri)); outgoing.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (vue) outgoing.setDataAndType(uri, mime); else outgoing.putExtra(Intent.EXTRA_STREAM, uri);
        }
        String app = "com.longyuye.mdreader.mobile.dev"; outgoing.setComponent(new ComponentName(app, app + ".LauncherActivity")); startActivity(outgoing);
    }
}
