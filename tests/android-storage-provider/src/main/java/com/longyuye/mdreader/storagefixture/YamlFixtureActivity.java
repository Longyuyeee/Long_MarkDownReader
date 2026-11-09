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

/** Synthetic YAML source only; never reads user files or sends network data. */
public final class YamlFixtureActivity extends Activity {
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        LinearLayout list = new LinearLayout(this); list.setOrientation(LinearLayout.VERTICAL);
        for (String action : new String[]{"Share YAML chooser", "Open YAML file", "Share unfinished YAML", "Share YAML text", "Share YAML structure"}) {
            Button button = new Button(this); button.setText(action); button.setAllCaps(false); list.addView(button);
            button.setOnClickListener(view -> send(action));
        }
        setContentView(list);
    }
    private void send(String action) {
        boolean open = action.equals("Open YAML file"), text = action.equals("Share YAML text");
        Intent outgoing = new Intent(open ? Intent.ACTION_VIEW : Intent.ACTION_SEND).setType("application/yaml");
        if (text) outgoing.putExtra(Intent.EXTRA_TEXT, "shared: 900719925474099312345\r\nname: 中文😎\n");
        else {
            String root = action.equals("Share YAML structure") ? "yaml-structure" : action.equals("Share unfinished YAML") ? "yaml-invalid" : "yaml-source";
            Uri uri = DocumentsContract.buildDocumentUri("com.longyuye.mdreader.storagefixture.documents", root + "/note");
            try (android.database.Cursor ignored = getContentResolver().query(uri, null, null, null, null)) { }
            outgoing.setClipData(ClipData.newRawUri("Synthetic YAML", uri)); outgoing.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (open) outgoing.setDataAndType(uri, "application/yaml"); else outgoing.putExtra(Intent.EXTRA_STREAM, uri);
        }
        if (action.endsWith("chooser")) startActivity(Intent.createChooser(outgoing, "Choose LongEdit for YAML"));
        else { String app = "com.longyuye.mdreader.mobile.dev"; outgoing.setComponent(new ComponentName(app, app + ".LauncherActivity")); startActivity(outgoing); }
    }
}
