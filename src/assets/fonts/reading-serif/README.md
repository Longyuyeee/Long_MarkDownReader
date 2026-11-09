# Offline article-title font

Derived from [Google Fonts / Noto Serif SC](https://github.com/google/fonts/tree/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/notoserifsc), under the SIL Open Font License 1.1 in `OFL.txt`. Source SHA-256, pinned commit, output hash and tool versions are in `provenance.json`.

The derivative is named **LongEdit Reading Serif** (700). It contains GB2312 characters, Latin-1 and common punctuation (7,812 codepoints, 1,480,132 bytes). Characters outside this subset use the system fallback. Only article titles use this face; source text and documents are unaffected.

Reproduce with `scripts/build-mobile-reading-font.py --source <directory containing NotoSerifSC.ttf, OFL.txt and source.json> --tools <task-local fonttools/brotli installation>`. The script checks the pinned input hashes, instantiates weight 700, subsets and renames the derivative, and writes WOFF2 without changing the source timestamp. No font is installed into the operating system.

The frontend loads the packaged WOFF2 once; the opaque document frame receives a data URL. There are no remote font requests. A loading failure uses the system serif fallback. The mobile build also copies the full license and provenance into `licenses/reading-serif/` alongside the application assets.
