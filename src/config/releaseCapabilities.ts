import matrixSource from '../../shared/release-capability-matrix.json'
import communityReleaseSource from '../../shared/v1-community-release-policy.json'
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

interface CommunityReleasePolicy {
  schemaVersion: number
  appVersion: string
  releaseCandidate: boolean
  channel: 'community-unsigned'
  currentStatus: string
  gates: {
    githubReleasePublished: boolean
  }
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
const communityRelease = communityReleaseSource as CommunityReleasePolicy
const profiles = new Map(matrix.profiles.map(profile => [profile.id, profile]))
const formats = new Map(FILE_FORMATS.map(format => [format.id, format]))

if (matrix.schemaVersion !== 1 || !['R1', 'R2'].includes(matrix.stage) || matrix.formatRegistrySchemaVersion !== 2) {
  throw new Error('Unsupported release capability matrix')
}
if (matrix.formats.length !== FILE_FORMATS.length) throw new Error('Incomplete release capability matrix')
if (communityRelease.schemaVersion !== 1 || communityRelease.appVersion !== matrix.appVersion) {
  throw new Error('Community release policy does not match the capability matrix')
}

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
export const RELEASE_PUBLIC_STATUS_LABEL = communityRelease.gates.githubReleasePublished
  && communityRelease.currentStatus === `v${matrix.appVersion}-community-release-published`
  ? `v${matrix.appVersion} 社区版已发布`
  : communityRelease.releaseCandidate
    ? `v${matrix.appVersion} 社区版发布候选`
    : communityRelease.currentStatus === `v${matrix.appVersion}-community-release-quality-gate-pending`
      ? `v${matrix.appVersion} 发布准备`
    : RELEASE_CANDIDATE
      ? '企业发布候选'
      : `${RELEASE_STAGE} 能力审计`
export const RELEASE_EXTERNAL_GATES = Object.freeze(matrix.externalGates)
