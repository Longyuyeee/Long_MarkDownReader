# Release artifact policy

Current public installers are distributed through the official GitHub Releases page and are not committed back into this directory.

- Current release: [v1.0.10](https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.10)
- Published assets: NSIS, MSI, and `SHA256SUMS.txt`
- Local build output: `src-tauri/target/` (ignored and reproducible)
- Local release staging: `.release-secrets/` (ignored; may contain credentials or unpublished artifacts)

`MistyEdit_*` files remain at this level because historical Windows release contracts still reference their exact paths. Earlier LongEdit installers that have no active path contract are retained under [`archive/legacy-longedit`](archive/legacy-longedit/README.md).
