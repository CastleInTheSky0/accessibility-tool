import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileString } from "sass";
import { defineConfig, type Plugin } from "vite";
import dts from "vite-plugin-dts";

function emitExternalStyles(): Plugin {
  return {
    name: "emit-accessibility-tool-styles",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "accessibility-tool.css",
        source: compileString(
          readFileSync(
            resolve(import.meta.dirname, "src/styles/accessibility-tool.scss"),
            "utf8",
          ),
          { style: "compressed" },
        ).css,
      });
    },
  };
}

export default defineConfig({
  plugins: [
    dts({
      include: ["src"],
    }),
    emitExternalStyles(),
  ],
  build: {
    target: "es2022",
    sourcemap: false,
    minify: "oxc",
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      name: "AccessibilityTool",
      formats: ["es", "iife"],
      fileName: (format) =>
        format === "es"
          ? "accessibility-tool.es.js"
          : "accessibility-tool.min.js",
    },
  },
});
