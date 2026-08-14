# GitHub Release Actions research

## Sources checked

- GitHub workflow permissions: <https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions>
- Automatic `GITHUB_TOKEN`: <https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication>
- GitHub CLI release creation: <https://cli.github.com/manual/gh_release_create>
- Playwright browser installation: <https://playwright.dev/docs/browsers#install-browsers>
- Official Action release metadata queried from the GitHub API on 2026-08-14.

## Verified Action revisions

| Action | Release | Commit SHA |
| --- | --- | --- |
| `actions/checkout` | `v7.0.1` | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node` | `v7.0.0` | `820762786026740c76f36085b0efc47a31fe5020` |
| `pnpm/action-setup` | `v6.0.10` | `0977fd99725f1db4007ccb2928dbb4e90d06cc86` |

Pinning the full commit SHA prevents a mutable tag from silently changing the executed Action. Version comments beside each SHA preserve upgrade visibility.

## Repository constraints

- Repository: `CastleInTheSky0/accessibility-tool`; default branch `main`; public visibility.
- No existing `.github/workflows` and no GitHub Releases.
- Current package version: `0.2.0`; current annotated tag: `v0.1.0`.
- Local toolchain verified as Node.js `22.20.0` and pnpm `10.28.0`.
- The Vite build copies `public` into `dist`, so archiving the entire directory would include demo pages and unrelated assets.
- The runtime contract requires the selected main entry and both fixed-name language assets to be deployed together from one directory.
- Playwright config uses the branded `chrome` and `msedge` channels, so CI must run `pnpm exec playwright install --with-deps chrome msedge` before E2E.

## Recommended release pattern

1. Trigger only on pushed SemVer tags matching `v*.*.*`.
2. Fetch full history, then require the tag name to equal `v${package.json.version}`.
3. Fetch/check `origin/main` and require the tagged commit to be an ancestor of it.
4. Install the locked dependency graph with the pinned Node/pnpm toolchain.
5. Run lint, unit tests, build verification, install branded browsers, and run E2E.
6. Stage only the five runtime artifacts plus `LICENSE`, then create a ZIP and SHA-256 checksum.
7. Use `gh release create "$GITHUB_REF_NAME" ... --verify-tag --generate-notes` with `GH_TOKEN: ${{ github.token }}`.

## Security and failure behavior

- Set workflow-level `contents: read`; elevate only the release job to `contents: write`.
- No Personal Access Token or repository secret is required.
- A failed version check, ancestry check, install, test, build, browser test, package-content assertion, or checksum step stops the job before Release creation.
- `--verify-tag` prevents the release command from implicitly creating an absent remote tag.
- Tag-triggered reruns should fail clearly if the Release already exists instead of overwriting an existing published artifact.
