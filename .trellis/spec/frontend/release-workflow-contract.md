# GitHub Release Workflow Contract

## Scenario: Tag-driven production release

### 1. Scope / Trigger

- Trigger: any change to `.github/workflows/release.yml`, package version metadata, Vite library outputs, declaration output layout, release asset names, or build verification.
- Release scope: GitHub Releases for the browser production bundle. Publishing to the npm registry is a separate decision and is not performed by this workflow.
- Trust boundary: a tag starts verification but does not bypass it. A Release may be created only after the tagged source passes every gate in a clean GitHub-hosted runner checkout.

### 2. Signatures

```text
Trigger tag:             v<package.json version>
Accepted version:        strict SemVer
Required branch history: tagged commit is an ancestor of origin/main

Toolchain:
  Node.js 22
  pnpm 10.28.0

Release assets:
  accessibility-tool-v<version>.zip
  SHA256SUMS

ZIP root:
  accessibility-tool.min.js
  accessibility-tool.es.js
  accessibility-tool.css
  accessibility-tool-opencc.js
  accessibility-tool-pinyin.js
  LICENSE
```

The workflow command boundary is:

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install --with-deps chrome msedge
pnpm test:e2e
gh release create <tag> <zip> SHA256SUMS \
  --verify-tag --generate-notes --title "AccessibilityTool <tag>"
```

### 3. Contracts

- Only a pushed tag matching `v*.*.*` starts the workflow. The runtime SemVer check must still reject broad glob matches that are not valid versions.
- The tag name must equal `v${package.json.version}` exactly. The workflow never changes `package.json` and never creates or moves a tag.
- Checkout must fetch full history. The peeled tag commit must be an ancestor of the fetched `origin/main`; a feature-only or detached release commit is invalid.
- Workflow-level permissions remain `contents: read`. Only the release job receives `contents: write`, and publishing uses the repository-provided `GITHUB_TOKEN`; no PAT or custom secret is required.
- Every external Action is pinned to a reviewed full commit SHA. A nearby version comment identifies the corresponding upstream release.
- Lint, unit tests, the production build verifier, and Chrome/Edge E2E are hard gates. A failure stops the job before packaging or Release creation.
- `pnpm build` must generate the public package entry files declared by `main`, `module`, `types`, and `exports`. In particular, `dist/index.d.ts` exists and the legacy `dist/src/index.d.ts` layout does not.
- After excluding JavaScript copied byte-for-byte from `public`, the generated JavaScript set is exactly the two public main entries and the two fixed-name language assets. Both language assets are self-contained and contain no static import, dynamic import, or re-export dependency.
- The ZIP is staged from a clean build by explicit allowlist. It never archives the complete `dist` directory, demo HTML/CSS/JavaScript, README, Logo files, or other `public` assets.
- Both main formats, the external CSS, and both language assets are released together. The fixed filenames and same-directory layout preserve the runtime dynamic-import contract.
- `SHA256SUMS` contains the SHA-256 digest of the final ZIP and is verified before upload.
- `gh release create --verify-tag` may create a new Release only for the existing remote tag. Rerunning against an existing Release fails visibly rather than silently overwriting published assets.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Tag matches the workflow glob but is not strict SemVer | Fail before dependency installation and create no Release. |
| Tag differs from `v${package.json.version}` | Fail with both actual and expected tag names. |
| Tagged commit is not contained in `origin/main` | Fail the ancestry check and create no Release. |
| Lockfile installation, lint, unit, build, or E2E fails | Stop the job before packaging or publishing. |
| A declared package entry is missing, outside `dist`, empty, or inconsistent with `exports` | Fail `scripts/verify-build.mjs`. |
| `dist/src/index.d.ts` is produced or `dist/index.d.ts` is missing | Fail the build verifier. |
| An unexpected generated JavaScript chunk exists | Fail with the expected and actual generated script sets. |
| A language asset imports or re-exports another module | Fail the self-contained asset check. |
| A required allowlisted runtime file is missing | Fail staging before ZIP creation. |
| ZIP contains a directory, demo file, Logo, or any non-allowlisted path | Fail the manifest comparison before publishing. |
| ZIP checksum verification fails | Stop before `gh release create`. |
| Remote tag is absent or a Release already exists | Let `gh release create --verify-tag` fail; do not create or overwrite a tag. |

### 5. Good / Base / Bad Cases

- Good: `package.json` is `0.2.0`; an annotated `v0.2.0` tag points to a commit contained in `main`; all gates pass; the Release contains one allowlisted ZIP and its verified checksum.
- Base: an ordinary `main` or feature-branch push performs no release operation because no release tag was pushed.
- Bad: publishing on every `main` push, accepting a mismatched tag, packaging all of `dist`, omitting either language asset, using an unpinned Action tag, or using a long-lived PAT is forbidden.

### 6. Tests Required

- Static: validate workflow YAML and GitHub expression syntax with `actionlint`.
- Static: confirm every `uses:` reference is a reviewed full commit SHA and still corresponds to the documented upstream release.
- Build: assert all package entry references resolve to non-empty files under `dist` and the root `exports` mapping agrees with `main`, `module`, and `types`.
- Build: assert `dist/index.d.ts` exists, `dist/src/index.d.ts` does not, the generated tool JavaScript set is exact, and both language assets are dependency-free.
- Negative build: inject or simulate a missing types entry, legacy declaration layout, unexpected generated chunk, and language-module dependency; each must be rejected.
- Unit: run the complete Vitest suite.
- E2E: run the complete system Chrome and Edge projects against the production build.
- Artifact: compare both the staging directory and ZIP listing to the six-file allowlist; generate and verify `SHA256SUMS`.
- Git: verify the release tag matches package metadata and its peeled commit is an ancestor of `origin/main` before creating the Release.

### 7. Wrong vs Correct

#### Wrong

```yaml
on: push
permissions: write-all
steps:
  - uses: actions/checkout@main
  - run: zip -r release.zip dist
  - run: gh release create latest release.zip
```

This can publish unverified branch pushes, executes mutable Action code, grants excessive permissions, includes demo assets, and can separate the package version from the Release tag.

#### Correct

```yaml
on:
  push:
    tags:
      - "v*.*.*"

permissions:
  contents: read

jobs:
  release:
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@<reviewed-full-commit-sha>
        with:
          fetch-depth: 0
          persist-credentials: false
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint && pnpm test && pnpm build
      - run: pnpm test:e2e
      - run: gh release create "$GITHUB_REF_NAME" <allowlisted-zip> SHA256SUMS --verify-tag --generate-notes
```

The implementation additionally validates strict SemVer, package-version equality, `main` ancestry, exact archive contents, and the checksum before the final command.
