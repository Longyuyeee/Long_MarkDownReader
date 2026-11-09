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

/** Independent, synthetic cross-app transport. Never included in LongEdit. */
public final class PackShareFixtureActivity extends Activity {
    private final String target = "com.longyuye.mdreader.mobile.dev";
    @Override public void onNewIntent(Intent incoming) { super.onNewIntent(incoming); setIntent(incoming); }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout list = new LinearLayout(this); list.setOrientation(LinearLayout.VERTICAL);
        for (String label : new String[]{"Open pack chooser", "Share pack chooser", "Open pack", "Share pack", "Octet pack", "Clip pack", "Same pack", "Wrong ZIP", "Broken pack", "Offline pack", "No pack grant", "Multiple packs", "No pack file", "Replay pack"}) {
            Button button = new Button(this); button.setText(label); button.setAllCaps(false); list.addView(button); button.setOnClickListener(view -> send(label));
        }
        ScrollView scroll = new ScrollView(this); scroll.addView(list); setContentView(scroll);
    }
    private void send(String label) {
        String root = label.equals("No pack grant") ? "pack-import-stored" : label.equals("Wrong ZIP") ? "pack-import-wrongtype" : label.equals("Broken pack") ? "pack-import-crc" : label.equals("Offline pack") ? "pack-import-offline" : label.equals("Same pack") ? "pack-import-same" : "pack-import-safe";
        Uri uri = DocumentsContract.buildDocumentUri("com.longyuye.mdreader.storagefixture.documents", root + "/note");
        // ACTION_SEND can migrate EXTRA_STREAM into granted ClipData. Use VIEW
        // without flags for an actual missing-grant test, like the text sender.
        boolean open = label.startsWith("Open") || label.equals("No pack grant"), grant = !label.equals("No pack grant");
        String mime = label.equals("Octet pack") ? "application/octet-stream" : "application/zip";
        Intent outgoing = new Intent(open ? Intent.ACTION_VIEW : Intent.ACTION_SEND).setType(mime);
        if (!label.equals("No pack file")) {
            if (open) outgoing.setDataAndType(uri, mime);
            else if (!label.equals("Clip pack")) outgoing.putExtra(Intent.EXTRA_STREAM, uri);
            if (grant) { outgoing.setClipData(ClipData.newRawUri("Synthetic TextPack", uri)); outgoing.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION); }
        } else outgoing.putExtra(Intent.EXTRA_TEXT, "This caption must never become a note.");
        if (label.equals("Multiple packs")) { outgoing.setAction(Intent.ACTION_SEND_MULTIPLE); java.util.ArrayList<Uri> files = new java.util.ArrayList<>(); files.add(uri); files.add(uri); outgoing.putParcelableArrayListExtra(Intent.EXTRA_STREAM, files); }
        if (label.equals("Replay pack")) outgoing.putExtra("com.longyuye.longedit.delivery-id", getIntent().getStringExtra("delivery-id"));
        if (label.endsWith("chooser")) startActivity(Intent.createChooser(outgoing, "Choose LongEdit for synthetic TextPack"));
        else { outgoing.setComponent(new ComponentName(target, target + (label.equals("Replay pack") ? ".MainActivity" : ".LauncherActivity"))); startActivity(outgoing); }
    }
}
