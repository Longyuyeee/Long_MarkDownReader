import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const read = file => fs.readFileSync(file, 'utf8')
const registry = JSON.parse(read('shared/file-formats.json'))
const release = JSON.parse(read('shared/release-capability-matrix.json'))
const fail = message => { console.error(message); process.exit(1) }
const requireTokens = (source, label, tokens) => {
  for (const token of tokens) if (!source.includes(token)) fail(`${label} token missing: ${token}`)
}
const forbidTokens = (source, label, tokens) => {
  for (const token of tokens) if (source.includes(token)) fail(`${label} forbidden token found: ${token}`)
}

const image = registry.formats.find(format => format.id === 'raster-image')
const video = registry.formats.find(format => format.id === 'video')
if (!image || image.routeName !== 'MediaViewer' || image.capabilities.read !== 'supported' || image.userCapability.saveMode !== 'none') fail('Image preview contract is incomplete')
if (!video || video.routeName !== 'MediaViewer' || video.capabilities.read !== 'supported' || video.userCapability.saveMode !== 'none') fail('Video preview contract is incomplete')
for (const extension of ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.avif']) if (!image.extensions.includes(extension)) fail(`Image extension missing: ${extension}`)
for (const extension of ['.mp4', '.webm', '.ogv', '.m4v', '.mov', '.mkv', '.avi', '.mpeg', '.mpg']) if (!video.extensions.includes(extension)) fail(`Video extension missing: ${extension}`)
if (video.maxBytes !== 2 * 1024 * 1024 * 1024) fail('Video streaming budget must remain 2 GiB')
for (const id of ['raster-image', 'video']) if (!release.formats.some(format => format.id === id && format.profile === 'media-preview')) fail(`Release media mapping missing: ${id}`)

const mediaWorkspace = read('src/views/MediaViewerView.vue')
requireTokens(mediaWorkspace, 'Media workspace', [
  "invoke<MediaInspection>('inspect_media_file'",
  'convertFileSrc(inspected.path)',
  'requestFullscreen()',
  'requestPictureInPicture',
  'seekBy(10)',
  'toggleLoop',
  'ResizeObserver',
  'fitImage',
  'rotateBy',
  'playbackRate',
  '源文件保持只读',
])
forbidTokens(mediaWorkspace, 'Media workspace', ['readFile(inspected.path)', 'URL.createObjectURL', 'URL.revokeObjectURL'])
requireTokens(read('src-tauri/src/commands/media.rs'), 'Media backend', [
  'WorkspaceGuard::new(library_root)?.resolve_existing_file',
  'metadata.len() > format.max_bytes',
  'app.fs_scope()',
  'app.asset_protocol_scope()',
  'playback_support',
  'streaming: true',
  '["raster-image", "video"]',
  'pub async fn inspect_media_file',
])
requireTokens(read('src-tauri/tauri.conf.json'), 'Media protocol configuration', [
  "media-src 'self' asset: http://asset.localhost blob:;",
  '"assetProtocol"',
  '"scope": []',
])
requireTokens(read('src-tauri/Cargo.toml'), 'Media protocol feature', ['"protocol-asset"'])
requireTokens(read('src/views/LibraryMode.vue'), 'Library embedding', ["MediaViewer: defineAsyncComponent(() => import('./MediaViewerView.vue'))"])
requireTokens(read('src/config/fileTreeAppearance.ts'), 'Media visuals', ["'raster-image': visual(Image", 'video: visual(Video'])

const evidenceRoot = 'docs/evidence/ux43-media-workspace'
const evidence = JSON.parse(read(path.join(evidenceRoot, 'runtime-evidence.json')))
const manifest = JSON.parse(read(path.join(evidenceRoot, 'manifest.json')))
if (!evidence.passed || evidence.imageFixtureUnchanged !== true || evidence.runtimeErrorCount !== 0 || evidence.imageInitial?.image?.naturalWidth !== 960 || evidence.video?.video?.readyState < 1 || evidence.narrow?.documentOverflow > 2) fail('Accepted media runtime evidence is incomplete')
if (manifest.status !== 'accepted' || manifest.sourceUserContentIncluded !== false || manifest.screenshots?.length !== 3) fail('Media evidence manifest is incomplete')
for (const screenshot of manifest.screenshots) {
  const bytes = fs.readFileSync(path.join(evidenceRoot, screenshot.file))
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
  if (bytes.length !== screenshot.bytes || bytes.length < 20_000 || sha256 !== screenshot.sha256) fail(`Media screenshot integrity failed: ${screenshot.file}`)
}

console.log('Media workspace contract passed: 8 image and 9 video extensions use guarded, range-streamed previews with bounded decoding.')
