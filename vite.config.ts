import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { readFileSync } from "node:fs";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const devPort = Number(process.env.LONGEDIT_DEV_PORT || 9000);
const explicitSaveBaselineSource = process.env.LONGEDIT_EXPLICIT_SAVE_BASELINE_SOURCE;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    ...(explicitSaveBaselineSource ? [{
      name: 'longedit-explicit-save-baseline',
      enforce: 'pre' as const,
      transform(_code: string, id: string) {
        if (id.includes('?')) return null;
        const normalized = id.split('?')[0].replaceAll('\\', '/');
        return normalized.endsWith('/src/views/LibraryMode.vue')
          ? readFileSync(explicitSaveBaselineSource, 'utf8')
          : null;
      },
    }] : []),
    vue(),
    viteStaticCopy({
      targets: [
        { src: "node_modules/vditor/dist", dest: "vditor" },
        { src: "node_modules/tesseract.js/dist/worker.min.js", dest: "ocr" },
        { src: "node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", dest: "ocr/core" },
        { src: "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", dest: "ocr/core" },
        { src: "node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", dest: "ocr/core" },
        { src: "node_modules/@tesseract.js-data/chi_sim/4.0.0/chi_sim.traineddata.gz", dest: "ocr/lang" },
        { src: "node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz", dest: "ocr/lang" },
      ],
    }),
  ],
  base: './',

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: devPort,
    strictPort: true,
    host: host || '127.0.0.1',
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        manualChunks: {
          "vue-vendor": ["vue", "vue-router", "pinia"],
          "ui-vendor": ["naive-ui"],
          "icon-vendor": ["lucide-vue-next"],
          "editor-vendor": ["vditor"],
        },
      },
    },
  },
}));
