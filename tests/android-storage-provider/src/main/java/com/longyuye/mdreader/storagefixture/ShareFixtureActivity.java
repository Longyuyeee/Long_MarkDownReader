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
import android.widget.ScrollView;
import android.widget.TextView;

/** Development-only sender. Every payload is deterministic and synthetic. */
public final class ShareFixtureActivity extends Activity {
    private final String target = "com.longyuye.mdreader.mobile.dev";
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        LinearLayout list = new LinearLayout(this); list.setOrientation(LinearLayout.VERTICAL); list.setPadding(24,24,24,24);
        TextView title = new TextView(this); title.setText("LongEdit synthetic incoming tests"); title.setTextSize(20); list.addView(title);
        String[] actions = { "Open chooser", "Share chooser", "Text chooser", "Open Markdown", "Open fresh", "Share Markdown", "Share Text", "Clip URI", "Broken UTF8", "Oversize", "Offline", "Wrong extension", "No grant", "Multiple", "Web URI", "Replay delivery" };
        for (String action : actions) { Button button = new Button(this); button.setText(action); button.setAllCaps(false); list.addView(button); button.setOnClickListener(view -> send(action)); }
        ScrollView scroll = new ScrollView(this); scroll.addView(list); setContentView(scroll);
    }
    @Override public void onNewIntent(Intent incoming) { super.onNewIntent(incoming); setIntent(incoming); }
    private void send(String action) {
        boolean text = action.equals("Share Text") || action.equals("Text chooser"), view = action.startsWith("Open") || action.equals("No grant") || action.equals("Web URI") || action.equals("Replay delivery");
        String root = action.equals("Broken UTF8") ? "incoming-invalid" : action.equals("Oversize") ? "incoming-large" : action.equals("Offline") ? "incoming-offline" : action.equals("Wrong extension") ? "incoming-wrongtype" : action.equals("No grant") ? "incoming-denied" : action.equals("Open fresh") ? "incoming-fresh" : action.equals("Clip URI") ? "incoming-clip" : "incoming-good";
        Uri uri = DocumentsContract.buildDocumentUri("com.longyuye.mdreader.storagefixture.documents", root + "/note");
        // Create metadata/file before the cross-app attempt, even for a missing grant.
        try (android.database.Cursor ignored = getContentResolver().query(uri, null, null, null, null)) { }
        Intent outgoing = new Intent(view ? Intent.ACTION_VIEW : Intent.ACTION_SEND).setType("text/markdown");
        if (text) outgoing.setType("text/plain").putExtra(Intent.EXTRA_TEXT, "分享中文😀\r\n下一行\nhttps://example.invalid/shared?keep=1\r\n");
        else {
            if (view) outgoing.setDataAndType(uri, "text/markdown");
            else if (!action.equals("Clip URI")) outgoing.putExtra(Intent.EXTRA_STREAM, uri);
            if (!action.equals("No grant")) outgoing.setClipData(ClipData.newRawUri("Synthetic file", uri));
            if (!action.equals("No grant")) outgoing.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        }
        if (action.equals("Multiple")) { outgoing.setAction(Intent.ACTION_SEND_MULTIPLE); java.util.ArrayList<Uri> files = new java.util.ArrayList<>(); files.add(uri); files.add(uri); outgoing.putParcelableArrayListExtra(Intent.EXTRA_STREAM, files); }
        if (action.equals("Web URI")) { outgoing.setDataAndType(Uri.parse("https://example.invalid/Inbox.md"), "text/markdown"); outgoing.setClipData(null); outgoing.setFlags(0); }
        if (action.equals("Replay delivery")) outgoing.putExtra("com.longyuye.longedit.delivery-id", getIntent().getStringExtra("delivery-id"));
        if (action.endsWith("chooser")) startActivity(Intent.createChooser(outgoing, "Choose LongEdit for synthetic content"));
        else { outgoing.setComponent(new ComponentName(target, target + (action.equals("Replay delivery") ? ".MainActivity" : ".LauncherActivity"))); startActivity(outgoing); }
    }
}
