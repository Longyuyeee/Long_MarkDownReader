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
/** Dedicated synthetic sender; separate from the consumer app. */
public final class PdfShareFixtureActivity extends Activity {
    @Override public void onCreate(Bundle saved){super.onCreate(saved);LinearLayout list=new LinearLayout(this);list.setOrientation(LinearLayout.VERTICAL);list.setPadding(24,24,24,24);String[] actions={"Open PDF chooser","Share PDF chooser","Open PDF","Share PDF","Clip PDF generic","PDF no grant","PDF multiple","PDF web","PDF broken","PDF oversize","PDF unavailable","Replay PDF"};for(String action:actions){Button b=new Button(this);b.setText(action);b.setAllCaps(false);list.addView(b);b.setOnClickListener(v->send(action));}ScrollView scroll=new ScrollView(this);scroll.addView(list);setContentView(scroll);}
    private void send(String action){String root=action.equals("PDF no grant")||action.equals("Replay PDF")?"pdf-incoming-denied":action.equals("PDF broken")?"pdf-incoming-broken":action.equals("PDF oversize")?"pdf-incoming-large":action.equals("PDF unavailable")?"pdf-incoming-offline":"pdf-navigation";Uri uri=DocumentsContract.buildDocumentUri("com.longyuye.mdreader.storagefixture.documents",root+"/note");boolean view=action.startsWith("Open")||action.equals("PDF no grant")||action.equals("PDF web")||action.equals("Replay PDF");String mime=action.equals("Clip PDF generic")?"application/octet-stream":"application/pdf";Intent out=new Intent(view?Intent.ACTION_VIEW:Intent.ACTION_SEND).setType(mime);if(view)out.setDataAndType(uri,mime);else if(!action.equals("Clip PDF generic"))out.putExtra(Intent.EXTRA_STREAM,uri);if(!action.equals("PDF no grant")&&!action.equals("Replay PDF")){out.setClipData(ClipData.newRawUri("Synthetic PDF",uri));out.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);}if(action.equals("PDF multiple")){out.setAction(Intent.ACTION_SEND_MULTIPLE);java.util.ArrayList<Uri> files=new java.util.ArrayList<>();files.add(uri);files.add(uri);out.putParcelableArrayListExtra(Intent.EXTRA_STREAM,files);}if(action.equals("PDF web")){out.setDataAndType(Uri.parse("https://example.invalid/guide.pdf"),mime);out.setClipData(null);out.setFlags(0);}if(action.equals("Replay PDF"))out.putExtra("com.longyuye.longedit.delivery-id",getIntent().getStringExtra("delivery-id"));if(action.endsWith("chooser"))startActivity(Intent.createChooser(out,"Choose LongEdit for synthetic PDF"));else{String target="com.longyuye.mdreader.mobile.dev";out.setComponent(new ComponentName(target,target+(action.equals("Replay PDF")?".MainActivity":".LauncherActivity")));startActivity(out);}}
}
