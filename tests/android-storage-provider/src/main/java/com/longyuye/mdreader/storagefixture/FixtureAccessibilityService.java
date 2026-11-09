package com.longyuye.mdreader.storagefixture;

import android.accessibilityservice.AccessibilityService;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;

/** Dedicated emulator only. Keeps a service connected between dumps.
 * Does not inspect events or request touch exploration. Explicit shell requests
 * may activate a named button in the development app on the API 29 emulator. */
public final class FixtureAccessibilityService extends AccessibilityService {
    private boolean registered;
    private static final String CLICK = "com.longyuye.mdreader.storagefixture.TEST_CLICK";
    private static final String INPUT = "com.longyuye.mdreader.storagefixture.TEST_FOCUSED_INPUT";
    private static final String PINCH = "com.longyuye.mdreader.storagefixture.TEST_PDF_PINCH";
    private static final String SNAPSHOT = "com.longyuye.mdreader.storagefixture.TEST_ACCESSIBILITY_SNAPSHOT";
    private final BroadcastReceiver click = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if ((!CLICK.equals(intent.getAction()) && !INPUT.equals(intent.getAction()) && !PINCH.equals(intent.getAction()) && !SNAPSHOT.equals(intent.getAction())) || Build.VERSION.SDK_INT != 29
                    || !(Build.HARDWARE.contains("ranchu") || Build.HARDWARE.contains("goldfish"))) { setResultCode(-1); return; }
            AccessibilityNodeInfo root = currentApplicationRoot();
            if (root == null) { setResultCode(-2); return; }
            try {
                boolean control = SNAPSHOT.equals(intent.getAction()) && intent.getBooleanExtra("control", false);
                if (control ? !isControlWindow(root) : !"com.longyuye.mdreader.mobile.dev".equals(String.valueOf(root.getPackageName()))) { setResultCode(-3); return; }
                if (SNAPSHOT.equals(intent.getAction())) { snapshot(root, intent, this); return; }
                if (PINCH.equals(intent.getAction())) { pinchPdf(root, intent, this); return; }
                if (INPUT.equals(intent.getAction())) {
                    String encoded = intent.getStringExtra("valueBase64");
                    if (encoded == null || encoded.length() > 1024) { setResultCode(0); return; }
                    String value;
                    try { value = new String(android.util.Base64.decode(encoded, android.util.Base64.DEFAULT), java.nio.charset.StandardCharsets.UTF_8); }
                    catch (IllegalArgumentException invalid) { setResultCode(0); return; }
                    AccessibilityNodeInfo focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
                    if (focused != null && !isDevelopmentInput(focused)) { focused.recycle(); focused = null; }
                    // WebView 124 on API29 can omit its virtual text node from
                    // findFocus even though the current tree marks it focused.
                    if (focused == null) focused = findFocusedDevelopmentInput(root);
                    if (focused == null) { setResultCode(-4); return; }
                    try {
                        if (value.length() > 160 || !isDevelopmentInput(focused)) { setResultCode(-5); return; }
                        android.os.Bundle arguments = new android.os.Bundle();
                        arguments.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value);
                        setResultCode(focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments) ? 1 : -6);
                    } finally { focused.recycle(); }
                    return;
                }
                String text = intent.getStringExtra("text");
                setResultCode(text != null && text.length() <= 256 && activate(root, text) ? 1 : 0);
            } finally { root.recycle(); }
        }
    };
    private boolean isControlWindow(AccessibilityNodeInfo root) {
        if (!"com.longyuye.mdreader.storagefixture".equals(String.valueOf(root.getPackageName()))) return false;
        java.util.List<AccessibilityWindowInfo> windows = getWindows();
        try {
            for (AccessibilityWindowInfo window : windows) {
                if (window.getId() == root.getWindowId() && window.getType() == AccessibilityWindowInfo.TYPE_APPLICATION
                        && (window.isActive() || window.isFocused()) && AccessibilityControlActivity.TITLE.contentEquals(window.getTitle() == null ? "" : window.getTitle())) return true;
            }
            return false;
        } finally { for (AccessibilityWindowInfo window : windows) window.recycle(); }
    }
    private boolean isDevelopmentInput(AccessibilityNodeInfo node) {
        return node.isEditable() && node.isFocused()
                && "android.widget.EditText".equals(String.valueOf(node.getClassName()))
                && "com.longyuye.mdreader.mobile.dev".equals(String.valueOf(node.getPackageName()));
    }
    private AccessibilityNodeInfo findFocusedDevelopmentInput(AccessibilityNodeInfo node) {
        if (isDevelopmentInput(node)) return AccessibilityNodeInfo.obtain(node);
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                try { AccessibilityNodeInfo found = findFocusedDevelopmentInput(child); if (found != null) return found; }
                finally { child.recycle(); }
            }
        }
        return null;
    }
    private AccessibilityNodeInfo currentApplicationRoot() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root != null) return root;
        // API29 may temporarily lose the active root after UIAutomator exits.
        // Only inspect an active/focused application window, never an arbitrary
        // background window or system picker. The receiver still checks package.
        java.util.List<AccessibilityWindowInfo> windows = getWindows();
        try {
            for (AccessibilityWindowInfo window : windows) {
                if (window.getType() == AccessibilityWindowInfo.TYPE_APPLICATION
                        && (window.isActive() || window.isFocused())) {
                    root = window.getRoot();
                    if (root != null) return root;
                }
            }
            return null;
        } finally { for (AccessibilityWindowInfo window : windows) window.recycle(); }
    }
    @Override protected void onServiceConnected() {
        if (Build.VERSION.SDK_INT != 29 || !(Build.HARDWARE.contains("ranchu") || Build.HARDWARE.contains("goldfish"))) return;
        if (!registered) {
            // DUMP is held by adb shell, not ordinary third-party apps.
            IntentFilter requests = new IntentFilter(CLICK);
            requests.addAction(INPUT);
            requests.addAction(PINCH);
            requests.addAction(SNAPSHOT);
            registerReceiver(click, requests, "android.permission.DUMP", null);
            registered = true;
        }
    }
    /** An explicit, bounded Android node observation without attaching UiAutomation.
     * Only the foreground development app, or the explicitly requested control
     * activity with its matching application-window title, can be recorded.
     * No event collection, DOM access, node actions or production endpoint. */
    private void snapshot(AccessibilityNodeInfo root, Intent intent, BroadcastReceiver receiver) {
        String token = intent.getStringExtra("token");
        if (token == null || !token.matches("[a-z0-9-]{1,48}")) { receiver.setResultCode(-20); return; }
        java.io.File file = new java.io.File(getFilesDir(), "a11y-snapshot-" + token + ".json");
        if (file.exists()) { receiver.setResultCode(-21); return; }
        try {
            org.json.JSONObject report = new org.json.JSONObject();
            org.json.JSONArray nodes = new org.json.JSONArray();
            report.put("elapsedRealtime", android.os.SystemClock.elapsedRealtime());
            report.put("api", Build.VERSION.SDK_INT);
            report.put("serviceFlags", getServiceInfo().flags);
            report.put("serviceEventTypes", getServiceInfo().eventTypes);
            report.put("observation", "AccessibilityService; no UiAutomation attachment");
            report.put("refreshRequested", intent.getBooleanExtra("refresh", false));
            boolean refreshDescendants = intent.getBooleanExtra("refreshDescendants", false);
            report.put("refreshDescendantsRequested", refreshDescendants);
            if (intent.getBooleanExtra("refresh", false)) report.put("rootRefreshResult", root.refresh());
            collectSnapshot(root, -1, 0, nodes, refreshDescendants);
            report.put("nodes", nodes);
            report.put("nodeLimitReached", nodes.length() >= 2000);
            try (java.io.FileOutputStream output = new java.io.FileOutputStream(file)) {
                output.write(report.toString(2).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            }
            receiver.setResultData(file.getName());
            receiver.setResultCode(1);
        } catch (Exception error) {
            receiver.setResultData(error.getClass().getSimpleName());
            receiver.setResultCode(-22);
        }
    }
    private void collectSnapshot(AccessibilityNodeInfo node, int parent, int depth, org.json.JSONArray nodes, boolean refresh)
            throws org.json.JSONException {
        if (depth > 64 || nodes.length() >= 2000) return;
        int index = nodes.length();
        org.json.JSONObject value = new org.json.JSONObject();
        if (refresh) value.put("refreshResult", node.refresh());
        android.graphics.Rect bounds = new android.graphics.Rect();
        node.getBoundsInScreen(bounds);
        value.put("parent", parent); value.put("class", String.valueOf(node.getClassName()));
        value.put("package", String.valueOf(node.getPackageName()));
        value.put("text", node.getText() == null ? "" : node.getText().toString());
        value.put("description", node.getContentDescription() == null ? "" : node.getContentDescription().toString());
        value.put("hint", node.getHintText() == null ? "" : node.getHintText().toString());
        value.put("bounds", bounds.flattenToString()); value.put("visible", node.isVisibleToUser());
        value.put("focused", node.isFocused()); value.put("accessibilityFocused", node.isAccessibilityFocused());
        value.put("clickable", node.isClickable()); value.put("editable", node.isEditable());
        value.put("enabled", node.isEnabled()); value.put("children", node.getChildCount());
        nodes.put(value);
        org.json.JSONArray missing = new org.json.JSONArray();
        for (int i = 0; i < node.getChildCount() && nodes.length() < 2000; i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                try { collectSnapshot(child, index, depth + 1, nodes, refresh); }
                finally { child.recycle(); }
            } else { missing.put(i); }
        }
        value.put("unavailableChildren", missing);
    }
    /** Real two-pointer Android input, restricted to the visible development PDF canvas.
     * Shell DUMP permission, API29 and dedicated emulator guards apply above.
     * No DOM injection, document mutation or production-app gesture endpoint. */
    private void pinchPdf(AccessibilityNodeInfo root, Intent intent, BroadcastReceiver receiver) {
        android.graphics.Rect page = new android.graphics.Rect();
        int cx = intent.getIntExtra("cx", -1), cy = intent.getIntExtra("cy", -1);
        int start = intent.getIntExtra("startSpan", -1), end = intent.getIntExtra("endSpan", -1);
        if (!pdfBounds(root, page, cx, cy, Math.max(start, end) / 2)) { receiver.setResultCode(-10); return; }
        android.util.DisplayMetrics display = getResources().getDisplayMetrics();
        if (start < 40 || end < 40 || start > 500 || end > 500 || cx < 0 || cy < 0
                || cx - Math.max(start, end) / 2 < 0 || cx + Math.max(start, end) / 2 >= display.widthPixels
                || cy < 24 || cy >= display.heightPixels - 24
                || !page.contains(cx - Math.max(start, end) / 2, cy) || !page.contains(cx + Math.max(start, end) / 2, cy)) {
            receiver.setResultCode(-11); return;
        }
        android.graphics.Path left = new android.graphics.Path(), right = new android.graphics.Path();
        left.moveTo(cx - start / 2f, cy); left.lineTo(cx - end / 2f, cy);
        right.moveTo(cx + start / 2f, cy); right.lineTo(cx + end / 2f, cy);
        android.accessibilityservice.GestureDescription gesture = new android.accessibilityservice.GestureDescription.Builder()
                .addStroke(new android.accessibilityservice.GestureDescription.StrokeDescription(left, 0, 650))
                .addStroke(new android.accessibilityservice.GestureDescription.StrokeDescription(right, 0, 650)).build();
        BroadcastReceiver.PendingResult pending = receiver.goAsync();
        boolean accepted = dispatchGesture(gesture, new GestureResultCallback() {
            @Override public void onCompleted(android.accessibilityservice.GestureDescription description) {
                pending.setResultCode(1); pending.setResultData("PDF two-pointer gesture completed"); pending.finish();
            }
            @Override public void onCancelled(android.accessibilityservice.GestureDescription description) {
                pending.setResultCode(-12); pending.finish();
            }
        }, null);
        if (!accepted) { pending.setResultCode(-13); pending.finish(); }
    }
    private boolean pdfBounds(AccessibilityNodeInfo node, android.graphics.Rect bounds, int cx, int cy, int halfSpan) {
        CharSequence label = node.getContentDescription() == null ? node.getText() : node.getContentDescription();
        if (label != null && label.toString().startsWith("PDF 第") && label.toString().contains("可长按选文")
                && "com.longyuye.mdreader.mobile.dev".equals(String.valueOf(node.getPackageName()))) {
            node.getBoundsInScreen(bounds); if (!bounds.isEmpty() && bounds.contains(cx - halfSpan, cy) && bounds.contains(cx + halfSpan, cy)) return true;
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) { try { if (pdfBounds(child, bounds, cx, cy, halfSpan)) return true; } finally { child.recycle(); } }
        }
        return false;
    }
    private boolean activate(AccessibilityNodeInfo node, String text) {
        if (node.isEnabled() && node.isClickable() && "android.widget.Button".equals(String.valueOf(node.getClassName()))
                && (text.contentEquals(node.getText() == null ? "" : node.getText()) || text.contentEquals(node.getContentDescription() == null ? "" : node.getContentDescription()))) {
            node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SHOW_ON_SCREEN.getId());
            return node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) { try { if (activate(child, text)) return true; } finally { child.recycle(); } }
        }
        return false;
    }
    @Override public void onDestroy() { if (registered) unregisterReceiver(click); registered = false; super.onDestroy(); }
    @Override public void onAccessibilityEvent(AccessibilityEvent event) { }
    @Override public void onInterrupt() { }
}
