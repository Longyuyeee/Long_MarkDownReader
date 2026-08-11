import fs from 'node:fs'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const text = file => fs.readFileSync(file, 'utf8')
const failures = []
const fail = message => failures.push(message)

const policy = json('shared/code-file-creation-policy.json')
const registry = json('shared/file-formats.json')
const frontend = text('src/views/LibraryMode.vue')
const frontendRegistry = text('src/config/fileFormats.ts')
const rustRegistry = text('src-tauri/src/formats/file_registry.rs')
const rustCommands = text('src-tauri/src/commands/formats.rs')
const ids = ['javascript', 'typescript', 'python', 'rust', 'go', 'jvm-code', 'c-family', 'shell', 'sql', 'web-source']

if (policy.schemaVersion !== 1 || policy.stage !== 'CF-1' || policy.appBaseline !== '1.0.7') fail('policy identity drift')
if (!['automated-gates-passed-desktop-evidence-pending', 'accepted'].includes(policy.status)) fail('policy status drift')
if (policy.gates?.registryContractImplemented !== true || policy.gates?.frontendVariantMenuImplemented !== true || policy.gates?.rustCreationBoundaryImplemented !== true || policy.gates?.automatedRegressionPassed !== true) fail('implemented gate state drift')
if (Object.values(policy.requirements ?? {}).some(value => value !== true)) fail('creation safety requirements drift')

const formats = ids.map(id => registry.formats.find(format => format.id === id))
if (formats.some(format => !format)) fail('code format family missing')
let variants = 0
for (const format of formats.filter(Boolean)) {
  if (format.capabilities?.create !== 'supported' || format.adapters?.creator !== 'text-template' || !format.creation?.defaultContent) fail(`${format.id} creation contract incomplete`)
  const declared = format.creation.variants?.length ? format.creation.variants : [{ extension: format.creation.defaultExtension, defaultContent: format.creation.defaultContent, defaultName: format.creation.defaultName }]
  const extensions = new Set(declared.map(variant => variant.extension))
  if (extensions.size !== format.extensions.length || format.extensions.some(extension => !extensions.has(extension))) fail(`${format.id} variants do not cover extensions`)
  if (declared.some(variant => !variant.defaultName || typeof variant.defaultContent !== 'string')) fail(`${format.id} template is incomplete`)
  variants += declared.length
}
const creatable = registry.formats.filter(format => format.capabilities?.create === 'supported')
if (formats.length !== policy.formatFamilies || variants !== policy.extensionVariants || creatable.length !== policy.creatableFormatFamiliesTotal) fail('creation inventory drift')

for (const [source, tokens, area] of [
  [frontend, ['CREATE_CODE_SUBGROUPS', "label: '编程语言'", "label: 'Web 与查询'", "label: '配置文件'", 'createFormatMenuOption', 'create-format-family:', 'variant.extension', "split(':')", 'extension,'], 'frontend menu'],
  [frontendRegistry, ['FileFormatCreationVariant', 'Incomplete creation variants'], 'frontend registry'],
  [rustRegistry, ['FileFormatCreationVariant', '创建变体未覆盖全部扩展名'], 'Rust registry'],
  [rustCommands, ['requested_extension', '不允许创建', 'write_new_bytes(&path, body.as_bytes())?', 'code_creation_variants_cover_registered_extensions_and_never_overwrite'], 'Rust creation'],
]) for (const token of tokens) if (!source.includes(token)) fail(`${area} missing: ${token}`)

if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join('\n'))
  process.exit(1)
}
console.log(`CF-1 code creation passed: ${formats.length} format families and ${variants} registered extensions use guarded atomic templates.`)
