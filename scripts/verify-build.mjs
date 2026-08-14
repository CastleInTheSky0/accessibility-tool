import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { stdout } from "node:process";
import { gzipSync } from "node:zlib";

const distDirectory = resolve(import.meta.dirname, "../dist");
const packageSource = readFileSync(
  resolve(import.meta.dirname, "../package.json"),
  "utf8",
);
const packageVersion = /"version"\s*:\s*"([^"]+)"/.exec(packageSource)?.[1];
assert(packageVersion, "package.json does not contain a version");
const languageAssetQuery = `?v=${encodeURIComponent(packageVersion)}`;
const mainFiles = [
  "accessibility-tool.min.js",
  "accessibility-tool.es.js",
];
const languageFiles = [
  "accessibility-tool-opencc.js",
  "accessibility-tool-pinyin.js",
];
const expectedToolScripts = [...mainFiles, ...languageFiles].sort();

const actualToolScripts = readdirSync(distDirectory)
  .filter((name) => /^accessibility-tool(?:[.-].+)?\.js$/.test(name))
  .sort();
assert(
  JSON.stringify(actualToolScripts) === JSON.stringify(expectedToolScripts),
  `unexpected AccessibilityTool JavaScript outputs: ${actualToolScripts.join(", ")}`,
);

for (const fileName of [...mainFiles, ...languageFiles]) {
  const filePath = resolve(distDirectory, fileName);
  assert(statSync(filePath).size > 0, `${fileName} is empty`);
}

for (const fileName of mainFiles) {
  const source = readFileSync(resolve(distDirectory, fileName), "utf8");
  for (const languageFile of languageFiles) {
    assert(
      source.includes(`./${languageFile}${languageAssetQuery}`),
      `${fileName} does not reference ./${languageFile}${languageAssetQuery}`,
    );
  }
  for (const marker of ["ConverterBuilder", "toneType", "nonZh", "DictChain"]) {
    assert(
      !source.includes(marker),
      `${fileName} still contains vendor marker ${marker}`,
    );
  }
}

for (const fileName of languageFiles) {
  const source = readFileSync(resolve(distDirectory, fileName), "utf8");
  assert(
    !/\bimport\s*\(|\bfrom\s*["']\.\//.test(source),
    `${fileName} is not self-contained`,
  );
}

const iifePath = resolve(distDirectory, "accessibility-tool.min.js");
const iife = readFileSync(iifePath);
const iifeGzipBytes = gzipSync(iife).byteLength;
assert(iife.byteLength < 350 * 1024, "main IIFE exceeds the 350 KiB raw budget");
assert(
  iifeGzipBytes < 100 * 1024,
  "main IIFE exceeds the 100 KiB gzip budget",
);

const sizes = [...mainFiles, ...languageFiles]
  .map((fileName) => {
    const contents = readFileSync(resolve(distDirectory, fileName));
    return `${fileName}: ${contents.byteLength} B, gzip ${gzipSync(contents).byteLength} B`;
  })
  .join("\n");
stdout.write(`AccessibilityTool build artifacts verified:\n${sizes}\n`);

/**
 * @param {unknown} condition
 * @param {string} message
 * @returns {asserts condition}
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
