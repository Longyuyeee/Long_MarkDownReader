import matrixSource from '../../shared/release-capability-matrix.json'
import communityReleaseSource from '../../shared/v1-community-release-policy.json'
import developmentVersionSource from '../../shared/development-version-policy.json'
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

interface DevelopmentVersionPolicy {
  schemaVersion: number
  channel: 'main-development'
  developmentTargetVersion: string
  runtimeBaseVersion: string
  publicVersion: string
  publicTag: string
  releaseCandidate: boolean
  currentStage: string
  binaryVersionTransition: 'M4-release-freeze' | 'v1.0.16-quality-gate-pending' | 'v1.0.16-quality-gate-and-runtime-smoke-passed' | 'v1.0.16-hosted-installer-lifecycle-passed' | 'v1.0.16-release-ready' | 'v1.0.16-public-release-published' | 'v1.0.17-quality-gate-pending' | 'v1.0.17-candidate-packaged' | 'v1.0.17-hosted-installer-lifecycle-passed' | 'v1.0.17-release-ready' | 'v1.0.17-public-release-published'
  displayLabel: string
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
const developmentVersion = developmentVersionSource as DevelopmentVersionPolicy
const profiles = new Map(matrix.profiles.map(profile => [profile.id, profile]))
const formats = new Map(FILE_FORMATS.map(format => [format.id, format]))
const versionParts = (version: string) => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`Invalid release version ${version}`)
  return match.slice(1).map(Number)
}
const compareVersions = (left: string, right: string) => {
  const leftParts = versionParts(left)
  const rightParts = versionParts(right)
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index]
  }
  return 0
}

if (matrix.schemaVersion !== 1 || !['R1', 'R2'].includes(matrix.stage) || matrix.formatRegistrySchemaVersion !== 2) {
  throw new Error('Unsupported release capability matrix')
}
if (matrix.formats.length !== FILE_FORMATS.length) throw new Error('Incomplete release capability matrix')
if (communityRelease.schemaVersion !== 1 || communityRelease.appVersion !== matrix.appVersion) {
  throw new Error('Community release policy does not match the capability matrix')
}
if (
  developmentVersion.schemaVersion !== 1
  || developmentVersion.channel !== 'main-development'
  || developmentVersion.runtimeBaseVersion !== matrix.appVersion
  || compareVersions(developmentVersion.publicVersion, developmentVersion.runtimeBaseVersion) > 0
  || compareVersions(developmentVersion.developmentTargetVersion, developmentVersion.runtimeBaseVersion) < 0
  || compareVersions(developmentVersion.developmentTargetVersion, developmentVersion.publicVersion) <= 0
  || developmentVersion.releaseCandidate
) {
  throw new Error('Development version policy does not match the runtime and public release facts')
}
const currentCommunityReleasePublished = communityRelease.gates.githubReleasePublished
  && communityRelease.currentStatus === `v${communityRelease.appVersion}-community-release-published`

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
export const DEVELOPMENT_TARGET_VERSION = developmentVersion.developmentTargetVersion
export const PUBLIC_RELEASE_VERSION = developmentVersion.publicVersion
export const DEVELOPMENT_CHANNEL_ACTIVE = developmentVersion.channel === 'main-development'
export const DEVELOPMENT_VERSION_LABEL = developmentVersion.displayLabel
export const RELEASE_PUBLIC_STATUS_LABEL = DEVELOPMENT_CHANNEL_ACTIVE
  ? DEVELOPMENT_VERSION_LABEL
  : currentCommunityReleasePublished
  && communityRelease.appVersion === matrix.appVersion
  ? `v${matrix.appVersion} 社区版已发布`
  : currentCommunityReleasePublished
    ? `v${matrix.appVersion} 发布准备中 · 当前公开 v${communityRelease.appVersion}`
  : communityRelease.releaseCandidate
    ? `v${matrix.appVersion} 社区版`
    : communityRelease.currentStatus === `v${matrix.appVersion}-community-release-quality-gate-pending`
      ? `v${matrix.appVersion} 社区版`
      : RELEASE_CANDIDATE
        ? '企业发布候选'
        : `${RELEASE_STAGE} 能力审计`
export const RELEASE_EXTERNAL_GATES = Object.freeze(matrix.externalGates)
