# Public note-package compatibility corpus

Two distinct licensed note payloads, kept offline for tests:

- `shinyfrog-v2.textpack` is byte-for-byte the TextBundle library test archive at `shinyfrog/TextBundle`, commit `28027bff3e606ec3290e8c55fff340a826fedd41`, `TextBundleTests/Sample TextBundles/textpack sample.textpack`. Its Git blob is `e3fa7ff977629320389b910feaab9d7365017dcd`. The TextBundle.org TextPack and Notesnook importer test fixture have the same payload; they are not counted as independent examples. See `LICENSE-TextBundle.txt`.
- `fsnotes-ios.textpack` packages the unchanged `info.json`, `text.markdown`, and `assets/128.png` from `glushchenko/fsnotes`, commit `ca305e464c469e6372cccba11b37d4a58bb51e2c`, `Resources/Initial/FSNotes 4.0 for iOS.textbundle`. Member Git blob identities are recorded in `manifest.json`. Python's standard `zipfile` produced a DEFLATE archive with a fixed 2020-01-01 timestamp. This is an app-shipped public sample repacked for transport, not an export captured from an installed FSNotes app. See `LICENSE-FSNotes.txt`.

`not-a-bundle.zip` is a generated ordinary ZIP. `multiple-notes.zip` and `missing-assets.zip` are generated negative variants of the licensed Shiny Frog sample. The independent manifest records every archive and member digest. No product ZIP writer generated these fixtures.

The official `example-bundle-v2.zip` was also downloaded and checked locally. Its archive digest and URL are recorded; its extra Finder metadata differs from the TextPack. That ZIP is not vendored here.

The corpus is packaged only into the separate Android storage test APK. It is never bundled in LongEdit. Tests do not run source applications, contact their accounts, or claim installed-app interoperability. Creator/source URLs in metadata must remain inert.
