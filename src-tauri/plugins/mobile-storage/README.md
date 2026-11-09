# Android document storage

Private plugin for the Long编辑 mobile worktree. The frontend sends an opaque
library ID and a relative document name through `plugin:mobile-storage|execute`.
Only roots selected through Android's directory picker are registered; arbitrary
URIs and desktop absolute paths are not accepted by this interface.

Supported operations are roots, choose, list, read, write, draft, saveDraft and
discardDraft. The first milestone accepts UTF-8 Markdown/TXT up to 4 MiB and lists
up to 1,000 directory entries. Drafts live in app-private storage and never imply
that the source document was saved. IO is serialized, drafts have revision guards,
and explicit writes compare the source SHA-256 before committing.

App-private files use Android AtomicFile. External providers do not offer a
general compare-and-swap or atomic replacement contract. Before writing externally,
the plugin retains the original and candidate privately and verifies the provider's
readback. Failed write journals are retained under `files/write-recovery`; a user
interface to browse/export these journals remains future work. Do not advertise
provider writes as atomic or this plugin as a complete backup system.

This plugin currently implements Android only. iOS needs a separate native adapter.


PDF external intake (Android): `application/pdf` VIEW/SEND and named PDF content URIs share the existing incoming transport. `PdfImports` consumes a temporary read grant into app-private `pdf-imports-v1`, with 20MiB/file, six receipts and 80MiB retained payload limits. It never writes the source URI. `pdfImports`, `pdfImport`, `commitPdfImport` and `removePdfImport` expose UUID-scoped receipts; confirmation requires the expected full digest and promotes a verified independent library copy. `acknowledgeIncoming` uses `version: "pdf"` for PDF receipts. Existing text and package intake data is separate. A replayed delivery ID does not reread the source or create a second PDF. Removing a receipt preserves any promoted library PDF. Frontend preview is explicitly a browser fixture adapter; iOS needs its own file/share transport.
