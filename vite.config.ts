import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileString } from "sass";
import { defineConfig, type Plugin } from "vite";
import dts from "vite-plugin-dts";

const DEFERRED_LOCAL_SCRIPT_PATTERN =
  /<script\b(?=[^>]*\sdefer(?:\s|=|>))(?=[^>]*\ssrc\s*=\s*["']\/(?!\/)[^"']+\.js(?:[?#][^"']*)?["'])[^>]*>/gi;
const DEFER_ATTRIBUTE_PATTERN =
  /\sdefer(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/i;
const TYPE_ATTRIBUTE_PATTERN =
  /\stype\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i;

function publicDemoDevelopment(): Plugin {
  return {
    name: "public-demo-development",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return html.replace(DEFERRED_LOCAL_SCRIPT_PATTERN, (scriptTag) => {
          const withoutDefer = scriptTag.replace(DEFER_ATTRIBUTE_PATTERN, "");
          if (TYPE_ATTRIBUTE_PATTERN.test(withoutDefer)) {
            return withoutDefer.replace(
              TYPE_ATTRIBUTE_PATTERN,
              ' type="module"',
            );
          }
          return withoutDefer.replace(
            /^<script\b/i,
            '<script type="module"',
          );
        });
      },
    },
  };
}

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

export default defineConfig(({ command, isPreview }) => {
  const isPublicDevelopment = command === "serve" && !isPreview;

  return {
    ...(isPublicDevelopment
      ? {
          root: resolve(import.meta.dirname, "public"),
          publicDir: false,
        }
      : {}),
    resolve: {
      alias: isPublicDevelopment
        ? [
            {
              find: /^\/accessibility-tool\.min\.js$/,
              replacement: resolve(import.meta.dirname, "src/index.ts"),
            },
          ]
        : [],
    },
    plugins: [
      ...(isPublicDevelopment ? [publicDemoDevelopment()] : []),
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
  };
});
