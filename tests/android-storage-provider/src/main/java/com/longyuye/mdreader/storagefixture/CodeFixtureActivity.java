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

/** Only synthetic UTF-8 source in a readonly provider; no network or user files. */
public final class CodeFixtureActivity extends Activity {
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        LinearLayout list = new LinearLayout(this); list.setOrientation(LinearLayout.VERTICAL);
        for (String action : new String[]{"Share JavaScript", "Open JavaScript", "Share Python text"}) {
            Button button = new Button(this); button.setText(action); button.setAllCaps(false); list.addView(button);
            button.setOnClickListener(view -> send(action));
        }
        setContentView(list);
    }
    private void send(String action) {
        boolean open = action.equals("Open JavaScript"), text = action.equals("Share Python text");
        Intent outgoing = new Intent(open ? Intent.ACTION_VIEW : Intent.ACTION_SEND).setType(text ? "text/x-python" : "text/javascript");
        if (text) outgoing.putExtra(Intent.EXTRA_TEXT, "name = 'phone'\r\n");
        else {
            Uri uri = DocumentsContract.buildDocumentUri("com.longyuye.mdreader.storagefixture.documents", "code-source/note");
            try (android.database.Cursor ignored = getContentResolver().query(uri, null, null, null, null)) { }
            outgoing.setClipData(ClipData.newRawUri("Synthetic code source", uri)); outgoing.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (open) outgoing.setDataAndType(uri, "text/javascript"); else outgoing.putExtra(Intent.EXTRA_STREAM, uri);
        }
        String app = "com.longyuye.mdreader.mobile.dev"; outgoing.setComponent(new ComponentName(app, app + ".LauncherActivity")); startActivity(outgoing);
    }
}
