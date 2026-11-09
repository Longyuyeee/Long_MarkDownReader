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
/** Public licensed note samples and deterministic ZIP boundary cases only. */
public final class ExternalPackFixtureActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state); LinearLayout list=new LinearLayout(this); list.setOrientation(LinearLayout.VERTICAL);
        for(String action:new String[]{"Share public ZIP","Share FSNotes ZIP","Open public ZIP","Share ordinary ZIP","Share multiple ZIP","Share missing ZIP"}) {
            Button button=new Button(this);button.setText(action);button.setAllCaps(false);list.addView(button);button.setOnClickListener(view->send(action));
        }
        setContentView(list);
    }
    private void send(String action) {
        String root=action.equals("Share FSNotes ZIP")?"external-fsnotes":action.equals("Share ordinary ZIP")?"external-generic":action.equals("Share multiple ZIP")?"external-multi":action.equals("Share missing ZIP")?"external-missing":"external-shiny";
        Uri uri=DocumentsContract.buildDocumentUri("com.longyuye.mdreader.storagefixture.documents",root+"/note");
        boolean open=action.equals("Open public ZIP");String mime=root.equals("external-fsnotes")?"application/octet-stream":"application/zip";
        Intent intent=new Intent(open?Intent.ACTION_VIEW:Intent.ACTION_SEND).setType(mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.setClipData(ClipData.newRawUri("Public note sample",uri));
        if(open)intent.setDataAndType(uri,mime);else intent.putExtra(Intent.EXTRA_STREAM,uri);
        if(action.equals("Share public ZIP"))startActivity(Intent.createChooser(intent,"Choose LongEdit for public ZIP"));
        else {String app="com.longyuye.mdreader.mobile.dev";intent.setComponent(new ComponentName(app,app+".LauncherActivity"));startActivity(intent);}
    }
}
