import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { stdout } from "node:process";
import { gzipSync } from "node:zlib";
import ts from "typescript";
import packageMetadata from "../package.json" with { type: "json" };

const projectDirectory = resolve(import.meta.dirname, "..");
const distDirectory = resolve(projectDirectory, "dist");
const publicDirectory = resolve(projectDirectory, "public");
const packageVersion = packageMetadata.version;
assert(
  typeof packageVersion === "string" && packageVersion.length > 0,
  "package.json does not contain a version",
);
const languageAssetQuery = `?v=${encodeURIComponent(packageVersion)}`;
/** @type {Map<string, string>} */
const publicEntryFiles = new Map();

for (const [field, target] of [
  ["main", packageMetadata.main],
  ["module", packageMetadata.module],
  ["types", packageMetadata.types],
]) {
  publicEntryFiles.set(
    field,
    verifyPackageFileReference(`package.json ${field}`, target),
  );
}

for (const [label, target] of collectExportTargets(packageMetadata.exports)) {
  verifyPackageFileReference(label, target);
}

const rootExport = packageMetadata.exports?.["."];
assert(
  rootExport && typeof rootExport === "object" && !Array.isArray(rootExport),
  'package.json exports["."] must define the public package entry',
);
assert(
  rootExport.types === packageMetadata.types,
  'package.json exports["."].types must match package.json types',
);
assert(
  rootExport.import === packageMetadata.module,
  'package.json exports["."].import must match package.json module',
);
assert(
  rootExport.default === packageMetadata.main,
  'package.json exports["."].default must match package.json main',
);
assert(
  packageMetadata.exports["./style.css"] ===
    "./dist/accessibility-tool.css",
  'package.json exports["./style.css"] must resolve to dist/accessibility-tool.css',
);

const mainFiles = ["main", "module"]
  .map((field) =>
    getDistRootFileName(`package.json ${field}`, publicEntryFiles.get(field)),
  )
  .sort();
const expectedMainFiles = [
  "accessibility-tool.es.js",
  "accessibility-tool.min.js",
];
assertSameFiles(
  mainFiles,
  expectedMainFiles,
  "package.json main/module AccessibilityTool entries",
);

const typesFile = getDistRootFileName(
  "package.json types",
  publicEntryFiles.get("types"),
);
assert(
  typesFile === "index.d.ts",
  `package.json types must resolve to dist/index.d.ts, received dist/${typesFile}`,
);
assert(
  !existsSync(resolve(distDirectory, "src/index.d.ts")),
  "legacy declaration layout dist/src/index.d.ts must not be generated",
);

const languageFiles = [
  "accessibility-tool-opencc.js",
  "accessibility-tool-pinyin.js",
];
const expectedToolScripts = [...mainFiles, ...languageFiles].sort();

const publicScripts = collectRelativeFiles(
  publicDirectory,
  (name) => name.endsWith(".js"),
);
for (const relativePath of publicScripts) {
  const sourcePath = resolve(publicDirectory, relativePath);
  const outputPath = resolve(distDirectory, relativePath);
  assert(
    existsSync(outputPath),
    `public JavaScript file was not copied to dist: ${relativePath}`,
  );
  assert(
    readFileSync(sourcePath).equals(readFileSync(outputPath)),
    `dist/${relativePath} does not match public/${relativePath}`,
  );
}

const publicScriptSet = new Set(publicScripts);
const actualToolScripts = collectRelativeFiles(
  distDirectory,
  (name) => name.endsWith(".js"),
)
  .filter((name) => !publicScriptSet.has(name))
  .sort();
assert(
  sameFiles(actualToolScripts, expectedToolScripts),
  `unexpected AccessibilityTool JavaScript outputs: expected ${expectedToolScripts.join(", ")}; received ${actualToolScripts.join(", ")}`,
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
  const moduleDependencies = collectModuleDependencyKinds(fileName, source);
  assert(
    moduleDependencies.length === 0,
    `${fileName} is not self-contained: ${moduleDependencies.join(", ")}`,
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
 * @param {unknown} value
 * @param {string} label
 * @returns {Array<[string, string]>}
 */
function collectExportTargets(value, label = "package.json exports") {
  if (typeof value === "string") {
    return [[label, value]];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      collectExportTargets(entry, `${label}[${index}]`),
    );
  }
  assert(
    value && typeof value === "object",
    `${label} must contain package-relative file references`,
  );
  return Object.entries(value).flatMap(([condition, target]) =>
    collectExportTargets(target, `${label}.${condition}`),
  );
}

/**
 * @param {string} directory
 * @param {(name: string) => boolean} matches
 * @returns {string[]}
 */
function collectRelativeFiles(directory, matches) {
  if (!existsSync(directory)) {
    return [];
  }

  /** @type {string[]} */
  const files = [];
  /** @param {string} currentDirectory */
  const visit = (currentDirectory) => {
    for (const entry of readdirSync(currentDirectory, {
      withFileTypes: true,
    })) {
      const entryPath = resolve(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile() && matches(entry.name)) {
        files.push(relative(directory, entryPath));
      }
    }
  };

  visit(directory);
  return files.sort();
}

/**
 * @param {string} fileName
 * @param {string} source
 * @returns {string[]}
 */
function collectModuleDependencyKinds(fileName, source) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.JS,
  );
  /** @type {Set<string>} */
  const kinds = new Set();

  /** @param {import("typescript").Node} node */
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      kinds.add("static import");
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      kinds.add("re-export");
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      kinds.add("dynamic import");
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return [...kinds].sort();
}

/**
 * @param {string} label
 * @param {unknown} target
 * @returns {string}
 */
function verifyPackageFileReference(label, target) {
  assert(
    typeof target === "string" && target.startsWith("./"),
    `${label} must be a package-relative file reference`,
  );
  const filePath = resolve(projectDirectory, target);
  const projectRelativePath = relative(projectDirectory, filePath);
  assert(
    projectRelativePath.length > 0 &&
      projectRelativePath !== ".." &&
      !projectRelativePath.startsWith(`..${sep}`) &&
      !isAbsolute(projectRelativePath),
    `${label} resolves outside the package directory: ${target}`,
  );
  const distRelativePath = relative(distDirectory, filePath);
  assert(
    distRelativePath.length > 0 &&
      distRelativePath !== ".." &&
      !distRelativePath.startsWith(`..${sep}`) &&
      !isAbsolute(distRelativePath),
    `${label} must resolve inside dist: ${target}`,
  );
  assert(existsSync(filePath), `${label} is missing: ${target}`);
  assert(statSync(filePath).isFile(), `${label} is not a file: ${target}`);
  assert(statSync(filePath).size > 0, `${label} is empty: ${target}`);
  return filePath;
}

/**
 * @param {string} label
 * @param {string | undefined} filePath
 * @returns {string}
 */
function getDistRootFileName(label, filePath) {
  assert(filePath, `${label} is missing`);
  const distRelativePath = relative(distDirectory, filePath);
  assert(
    !distRelativePath.includes(sep),
    `${label} must resolve to the dist root: ${distRelativePath}`,
  );
  return distRelativePath;
}

/**
 * @param {string[]} actual
 * @param {string[]} expected
 * @returns {boolean}
 */
function sameFiles(actual, expected) {
  return (
    JSON.stringify([...actual].sort()) ===
    JSON.stringify([...expected].sort())
  );
}

/**
 * @param {string[]} actual
 * @param {string[]} expected
 * @param {string} label
 */
function assertSameFiles(actual, expected, label) {
  assert(
    sameFiles(actual, expected),
    `${label} must be ${expected.join(", ")}; received ${actual.join(", ")}`,
  );
}

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
