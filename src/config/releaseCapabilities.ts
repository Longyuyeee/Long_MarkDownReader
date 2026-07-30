import matrixSource from '../../shared/release-capability-matrix.json'
import { FILE_FORMATS, type FileFormatDefinition } from './fileFormats'

export type ReleaseReadiness = 'verified' | 'verified-with-limitations' | 'external-dependency'
export type ReleaseDependency = 'none' | 'compatible-office-suite' | 'compatible-desktop-application'

interface ReleaseProfile {
  id: string
  dependency: ReleaseDependency
  sourcePolicy: string
  privacyBoundary: string
  knownLimitations: string[]
}

interface ReleaseFormatMapping {
  id: string
  profile: string
  readiness: ReleaseReadiness
}

interface ReleaseCapabilityMatrix {
  schemaVersion: number
  stage: string
  appVersion: string
  releaseCandidate: boolean
  formatRegistrySchemaVersion: number
  profiles: ReleaseProfile[]
  formats: ReleaseFormatMapping[]
  externalGates: Array<{
    id: string
    status: 'partial' | 'blocked' | 'complete'
    evidence: string
    releaseImpact: string
  }>
}

export interface ReleaseCapabilityRow {
  format: FileFormatDefinition
  readiness: ReleaseReadiness
  dependency: ReleaseDependency
  sourcePolicy: string
  privacyBoundary: string
  knownLimitations: readonly string[]
}

const matrix = matrixSource as ReleaseCapabilityMatrix
const profiles = new Map(matrix.profiles.map(profile => [profile.id, profile]))
const formats = new Map(FILE_FORMATS.map(format => [format.id, format]))

if (matrix.schemaVersion !== 1 || !['R1', 'R2'].includes(matrix.stage) || matrix.formatRegistrySchemaVersion !== 2) {
  throw new Error('Unsupported release capability matrix')
}
if (matrix.formats.length !== FILE_FORMATS.length) throw new Error('Incomplete release capability matrix')

export const RELEASE_CAPABILITY_ROWS: readonly ReleaseCapabilityRow[] = Object.freeze(
  matrix.formats.map(mapping => {
    const format = formats.get(mapping.id)
    const profile = profiles.get(mapping.profile)
    if (!format || !profile) throw new Error(`Invalid release capability mapping ${mapping.id}`)
    return {
      format,
      readiness: mapping.readiness,
      dependency: profile.dependency,
      sourcePolicy: profile.sourcePolicy,
      privacyBoundary: profile.privacyBoundary,
      knownLimitations: Object.freeze([...profile.knownLimitations]),
    }
  }),
)

export const RELEASE_STAGE = matrix.stage
export const RELEASE_MATRIX_VERSION = matrix.appVersion
export const RELEASE_CANDIDATE = matrix.releaseCandidate
export const RELEASE_EXTERNAL_GATES = Object.freeze(matrix.externalGates)
