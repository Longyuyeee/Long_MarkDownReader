// Published installer verification and post-publication in-app update observation
// are separate gates. Never infer the latter from a successful release alone.
export function assertV121DevelopmentBoundary(development, community) {
  if (community.appVersion === '1.1.33'
    && community.patchValidation?.previousPublicVersion === '1.1.32'
    && development.runtimeBaseVersion === '1.1.33'
    && development.releaseCandidate === false
    && community.targetRelease?.tag === 'v1.1.33'
    && /^(?!0{40})[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.33' && development.publicTag === 'v1.1.33'
        && development.developmentTargetVersion === '1.1.34'
        && community.release?.tag === 'v1.1.33'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.32' && development.publicTag === 'v1.1.32'
        && development.publicTagCommit === '5a696d5479579d7bb87eef49e461f351954acaf4'
        && development.developmentTargetVersion === '1.1.33')) return
  if (community.appVersion === '1.1.32'
    && community.patchValidation?.previousPublicVersion === '1.1.31'
    && development.runtimeBaseVersion === '1.1.32'
    && development.releaseCandidate === false
    && community.targetRelease?.tag === 'v1.1.32'
    && /^(?!0{40})[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.32' && development.publicTag === 'v1.1.32'
        && development.developmentTargetVersion === '1.1.33'
        && community.release?.tag === 'v1.1.32'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.31' && development.publicTag === 'v1.1.31'
        && development.publicTagCommit === 'd3072311171f12f717d456193fa3d035518f683a'
        && development.developmentTargetVersion === '1.1.32')) return
  if (community.appVersion === '1.1.31'
    && community.patchValidation?.previousPublicVersion === '1.1.30'
    && development.runtimeBaseVersion === '1.1.31'
    && development.releaseCandidate === false
    && community.targetRelease?.tag === 'v1.1.31'
    && /^(?!0{40})[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.31' && development.publicTag === 'v1.1.31'
        && development.developmentTargetVersion === '1.1.32'
        && community.release?.tag === 'v1.1.31'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.30' && development.publicTag === 'v1.1.30'
        && development.publicTagCommit === 'c72848e2f67347541584b6a58e6fb840e8ac7dc4'
        && development.developmentTargetVersion === '1.1.31')) return
  if (community.appVersion === '1.1.30'
    && community.patchValidation?.previousPublicVersion === '1.1.29'
    && development.runtimeBaseVersion === '1.1.30'
    && development.releaseCandidate === false
    && community.targetRelease?.tag === 'v1.1.30'
    && /^(?!0{40})[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.30' && development.publicTag === 'v1.1.30'
        && development.developmentTargetVersion === '1.1.31'
        && community.release?.tag === 'v1.1.30'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.29' && development.publicTag === 'v1.1.29'
        && development.publicTagCommit === 'c177bbe9952684b61fcf0f253f77d88a6cfbcb9a'
        && development.developmentTargetVersion === '1.1.30')) return
  if (community.appVersion === '1.1.29'
    && community.patchValidation?.previousPublicVersion === '1.1.28'
    && development.runtimeBaseVersion === '1.1.29'
    && development.releaseCandidate === false
    && community.targetRelease?.tag === 'v1.1.29'
    && /^(?!0{40})[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.29' && development.publicTag === 'v1.1.29'
        && development.developmentTargetVersion === '1.1.30'
        && community.release?.tag === 'v1.1.29'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.28' && development.publicTag === 'v1.1.28'
        && development.publicTagCommit === 'eba705bce78744fa20d30a7acad422d7297f0ef1'
        && development.developmentTargetVersion === '1.1.29')) return
  if (community.appVersion === '1.1.28'
    && community.patchValidation?.previousPublicVersion === '1.1.27'
    && development.runtimeBaseVersion === '1.1.28'
    && development.releaseCandidate === false
    && community.targetRelease?.tag === 'v1.1.28'
    && /^(?!0{40})[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.28' && development.publicTag === 'v1.1.28'
        && development.developmentTargetVersion === '1.1.29'
        && community.release?.tag === 'v1.1.28'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.27' && development.publicTag === 'v1.1.27'
        && development.publicTagCommit === '9def6c7a7e8b96be61fd48d41f925085eb8036f1'
        && development.developmentTargetVersion === '1.1.28')) return
  if (community.appVersion === '1.1.27'
    && community.patchValidation?.previousPublicVersion === '1.1.26'
    && development.runtimeBaseVersion === '1.1.27'
    && development.releaseCandidate === false
    && community.targetRelease?.tag === 'v1.1.27'
    && /^(?!0{40})[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.27' && development.publicTag === 'v1.1.27'
        && development.developmentTargetVersion === '1.1.28'
        && community.release?.tag === 'v1.1.27'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.26' && development.publicTag === 'v1.1.26'
        && development.publicTagCommit === '0e61db532ba2e060612fb1e176f5c2554bb06c6f'
        && development.developmentTargetVersion === '1.1.27')) return
  if (community.appVersion === '1.1.26'
    && community.patchValidation?.previousPublicVersion === '1.1.25'
    && development.runtimeBaseVersion === '1.1.26'
    && development.releaseCandidate === false
    && community.targetRelease?.tag === 'v1.1.26'
    && /^(?!0{40})[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.26' && development.publicTag === 'v1.1.26'
        && development.developmentTargetVersion === '1.1.27'
        && community.release?.tag === 'v1.1.26'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.25' && development.publicTag === 'v1.1.25'
        && development.publicTagCommit === 'a3bbfd4cc591d4989b14fc14f9daac0c6c90e1d7'
        && development.developmentTargetVersion === '1.1.26')) return
  if (community.appVersion === '1.1.25'
    && community.patchValidation?.previousPublicVersion === '1.1.24'
    && development.runtimeBaseVersion === '1.1.25'
    && development.releaseCandidate === false
    && community.targetRelease?.tag === 'v1.1.25'
    && /^(?!0{40})[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.25' && development.publicTag === 'v1.1.25'
        && development.developmentTargetVersion === '1.1.26'
        && community.release?.tag === 'v1.1.25'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.24' && development.publicTag === 'v1.1.24'
        && development.publicTagCommit === 'd5b9f978e83ddc1d0a29037e9dfea965f3cb0d7d'
        && development.developmentTargetVersion === '1.1.25')) return
  if (community.appVersion === '1.1.24'
    && community.patchValidation?.previousPublicVersion === '1.1.23'
    && development.runtimeBaseVersion === '1.1.24'
    && development.releaseCandidate === false
    && community.targetRelease?.tag === 'v1.1.24'
    && /^(?!0{40})[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.24' && development.publicTag === 'v1.1.24'
        && development.developmentTargetVersion === '1.1.25'
        && community.release?.tag === 'v1.1.24'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.23' && development.publicTag === 'v1.1.23'
        && development.publicTagCommit === '0f21f009982d5445e7e64067cabff306bf0e0805'
        && development.developmentTargetVersion === '1.1.24')) return
  if (community.appVersion === '1.1.23'
    && community.patchValidation?.previousPublicVersion === '1.1.22'
    && development.runtimeBaseVersion === '1.1.23'
    && development.releaseCandidate === false
    && community.targetRelease?.tag === 'v1.1.23'
    && /^(?!0{40})[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.23' && development.publicTag === 'v1.1.23'
        && development.developmentTargetVersion === '1.1.24'
        && community.release?.tag === 'v1.1.23'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.22' && development.publicTag === 'v1.1.22'
        && development.publicTagCommit === '7036d23e3d46d0c3758592744e5e93dd70528429'
        && development.developmentTargetVersion === '1.1.23')) return
  if (community.appVersion === '1.1.22'
    && community.patchValidation?.previousPublicVersion === '1.1.21'
    && development.runtimeBaseVersion === '1.1.22'
    && development.releaseCandidate === false
    && community.targetRelease?.tag === 'v1.1.22'
    && /^(?!0{40})[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.22' && development.publicTag === 'v1.1.22'
        && development.developmentTargetVersion === '1.1.23'
        && community.release?.tag === 'v1.1.22'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.21' && development.publicTag === 'v1.1.21'
        && development.publicTagCommit === 'ab85459975e304a4f5d6cc777bcc80185fd5a4b2'
        && development.developmentTargetVersion === '1.1.22')) return
  if (community.appVersion === '1.1.21'
    && community.patchValidation?.previousPublicVersion === '1.1.20'
    && development.runtimeBaseVersion === '1.1.21'
    && development.releaseCandidate === false
    && community.targetRelease?.tag === 'v1.1.21'
    && /^(?!0{40})[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.21' && development.publicTag === 'v1.1.21'
        && development.developmentTargetVersion === '1.1.22'
        && community.release?.tag === 'v1.1.21'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.20' && development.publicTag === 'v1.1.20'
        && development.publicTagCommit === '2a7eac5eb56791e6c7e6c56b36fee2393805827c'
        && development.developmentTargetVersion === '1.1.21')) return
  if (community.appVersion === '1.1.20'
    && community.patchValidation?.previousPublicVersion === '1.1.19'
    && development.runtimeBaseVersion === '1.1.20'
    && development.releaseCandidate === false
    && community.targetRelease?.tag === 'v1.1.20'
    && /^(?!0{40})[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.20' && development.publicTag === 'v1.1.20'
        && development.developmentTargetVersion === '1.1.21'
        && community.release?.tag === 'v1.1.20'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.19' && development.publicTag === 'v1.1.19'
        && development.publicTagCommit === '591447cd9e3303cde9d1ebfde1df2fddb45d8c8c'
        && development.developmentTargetVersion === '1.1.20')) return
  if (community.appVersion === '1.1.19'
    && community.patchValidation?.previousPublicVersion === '1.1.18'
    && development.runtimeBaseVersion === '1.1.19'
    && development.releaseCandidate === false
    && community.targetRelease?.tag === 'v1.1.19'
    && /^(?!0{40})[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.19' && development.publicTag === 'v1.1.19'
        && development.developmentTargetVersion === '1.1.20'
        && community.release?.tag === 'v1.1.19'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.18' && development.publicTag === 'v1.1.18'
        && development.publicTagCommit === '9b621511807e4233147a5a6d4265a2be97f53b0f'
        && development.developmentTargetVersion === '1.1.19')) return
  if (community.appVersion === '1.1.18'
    && community.patchValidation?.previousPublicVersion === '1.1.17'
    && development.runtimeBaseVersion === '1.1.18'
    && development.releaseCandidate === false
    && community.targetRelease?.tag === 'v1.1.18'
    && /^(?!0{40})[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.18' && development.publicTag === 'v1.1.18'
        && development.developmentTargetVersion === '1.1.19'
        && community.release?.tag === 'v1.1.18'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.17' && development.publicTag === 'v1.1.17'
        && development.publicTagCommit === 'bcbb9265f66faae396fd5f43cb3354562c89fcab'
        && development.developmentTargetVersion === '1.1.18')) return
  if (community.appVersion === '1.1.17'
    && community.patchValidation?.previousPublicVersion === '1.1.16'
    && development.runtimeBaseVersion === '1.1.17'
    && community.targetRelease?.tag === 'v1.1.17'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.17' && development.publicTag === 'v1.1.17'
        && development.developmentTargetVersion === '1.1.18'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.16' && development.publicTag === 'v1.1.16'
        && development.publicTagCommit === '05d562b182d81ab7c8c26a3bc902d16464d3596a'
        && development.developmentTargetVersion === '1.1.17')) return
  if (community.appVersion === '1.1.16'
    && community.patchValidation?.previousPublicVersion === '1.1.15'
    && development.runtimeBaseVersion === '1.1.16'
    && community.targetRelease?.tag === 'v1.1.16'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.16' && development.publicTag === 'v1.1.16'
        && development.developmentTargetVersion === '1.1.17'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.15' && development.publicTag === 'v1.1.15'
        && development.publicTagCommit === 'a40c0ea2a71a7cd1230c8704cb1e45b2c79c9cba'
        && development.developmentTargetVersion === '1.1.16')) return
  if (community.appVersion === '1.1.15'
    && community.patchValidation?.previousPublicVersion === '1.1.14'
    && development.runtimeBaseVersion === '1.1.15'
    && community.targetRelease?.tag === 'v1.1.15'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.15' && development.publicTag === 'v1.1.15'
        && development.developmentTargetVersion === '1.1.16'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.14' && development.publicTag === 'v1.1.14'
        && development.publicTagCommit === 'e4650640145d94e0c115b0e3993ae0358b355412'
        && development.developmentTargetVersion === '1.1.15')) return
  if (community.appVersion === '1.1.14'
    && community.patchValidation?.previousPublicVersion === '1.1.13'
    && development.runtimeBaseVersion === '1.1.14'
    && community.targetRelease?.tag === 'v1.1.14'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.14' && development.publicTag === 'v1.1.14'
        && development.developmentTargetVersion === '1.1.15'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.13' && development.publicTag === 'v1.1.13'
        && development.publicTagCommit === '8c5a50afcb594519fbe14f0009112491ce14308c'
        && development.developmentTargetVersion === '1.1.14')) return
  if (community.appVersion === '1.1.13'
    && community.patchValidation?.previousPublicVersion === '1.1.12'
    && development.runtimeBaseVersion === '1.1.13'
    && community.targetRelease?.tag === 'v1.1.13'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.13' && development.publicTag === 'v1.1.13'
        && development.developmentTargetVersion === '1.1.14'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.12' && development.publicTag === 'v1.1.12'
        && development.publicTagCommit === '4fb14270513d556ed965a0c27308bdc727eacd4b'
        && development.developmentTargetVersion === '1.1.13')) return
  if (community.appVersion === '1.1.12'
    && community.patchValidation?.previousPublicVersion === '1.1.11'
    && development.runtimeBaseVersion === '1.1.12'
    && community.targetRelease?.tag === 'v1.1.12'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.12' && development.publicTag === 'v1.1.12'
        && development.developmentTargetVersion === '1.1.13'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.11' && development.publicTag === 'v1.1.11'
        && development.publicTagCommit === '9b5adba245d3c24d6c891e3b0c4e7a7e326ca6ed'
        && development.developmentTargetVersion === '1.1.12')) return
  if (community.appVersion === '1.1.11'
    && community.patchValidation?.previousPublicVersion === '1.1.10'
    && development.runtimeBaseVersion === '1.1.11'
    && community.targetRelease?.tag === 'v1.1.11'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.11' && development.publicTag === 'v1.1.11'
        && development.developmentTargetVersion === '1.1.12'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.10' && development.publicTag === 'v1.1.10'
        && development.publicTagCommit === '599374bf4f11454889e11a6f0f9a7ac6e2cabb0e'
        && development.developmentTargetVersion === '1.1.11')) return
  if (community.appVersion === '1.1.10'
    && community.patchValidation?.previousPublicVersion === '1.1.9'
    && development.runtimeBaseVersion === '1.1.10'
    && community.targetRelease?.tag === 'v1.1.10'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.10' && development.publicTag === 'v1.1.10'
        && development.developmentTargetVersion === '1.1.11'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.9' && development.publicTag === 'v1.1.9'
        && development.publicTagCommit === 'b92c18a1705cf787a05c2b3a97e78feeb29d46fb'
        && development.developmentTargetVersion === '1.1.10')) return
  if (community.appVersion === '1.1.9'
    && community.patchValidation?.previousPublicVersion === '1.1.8'
    && development.runtimeBaseVersion === '1.1.9'
    && community.targetRelease?.tag === 'v1.1.9'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.9' && development.publicTag === 'v1.1.9'
        && development.developmentTargetVersion === '1.1.10'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.8' && development.publicTag === 'v1.1.8'
        && development.publicTagCommit === '60476b3e0663fca4f933271dfe56446ec33ffec9'
        && development.developmentTargetVersion === '1.1.9')) return
  if (community.appVersion === '1.1.8'
    && community.patchValidation?.previousPublicVersion === '1.1.7'
    && development.runtimeBaseVersion === '1.1.8'
    && community.targetRelease?.tag === 'v1.1.8'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.8' && development.publicTag === 'v1.1.8'
        && development.developmentTargetVersion === '1.1.9'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.7' && development.publicTag === 'v1.1.7'
        && development.publicTagCommit === '84cc1ad6d4697bb98c17e3396b9d8d65da41847a'
        && development.developmentTargetVersion === '1.1.8')) return
  if (community.appVersion === '1.1.7'
    && community.patchValidation?.previousPublicVersion === '1.1.6'
    && development.runtimeBaseVersion === '1.1.7'
    && community.targetRelease?.tag === 'v1.1.7'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.7' && development.publicTag === 'v1.1.7'
        && development.developmentTargetVersion === '1.1.8'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.6' && development.publicTag === 'v1.1.6'
        && development.publicTagCommit === '2711260d0ad56ab6bdf14e4b94facbfc52cfed83'
        && development.developmentTargetVersion === '1.1.7')) return
  if (community.appVersion === '1.1.6'
    && community.patchValidation?.previousPublicVersion === '1.1.5'
    && development.runtimeBaseVersion === '1.1.6'
    && community.targetRelease?.tag === 'v1.1.6'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.6' && development.publicTag === 'v1.1.6'
        && development.developmentTargetVersion === '1.1.7'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.5' && development.publicTag === 'v1.1.5'
        && development.publicTagCommit === '5ee1ddd7297e59813307058e89801e5521966abc'
        && development.developmentTargetVersion === '1.1.6')) return
  if (community.appVersion === '1.1.5'
    && community.patchValidation?.previousPublicVersion === '1.1.4'
    && development.runtimeBaseVersion === '1.1.5'
    && community.targetRelease?.tag === 'v1.1.5'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.5' && development.publicTag === 'v1.1.5'
        && development.developmentTargetVersion === '1.1.6'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.4' && development.publicTag === 'v1.1.4'
        && development.publicTagCommit === '970a9fe18a74b6ad1d78304ae15b18178bf47057'
        && development.developmentTargetVersion === '1.1.5')) return
  if (community.appVersion === '1.1.4'
    && community.patchValidation?.previousPublicVersion === '1.1.3'
    && development.runtimeBaseVersion === '1.1.4'
    && community.targetRelease?.tag === 'v1.1.4'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.4' && development.publicTag === 'v1.1.4'
        && development.developmentTargetVersion === '1.1.5'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.3' && development.publicTag === 'v1.1.3'
        && development.publicTagCommit === '2854d7792caee2027e1138491a4754fa7a4871cc'
        && development.developmentTargetVersion === '1.1.4')) return
  if (community.appVersion === '1.1.3'
    && community.patchValidation?.previousPublicVersion === '1.1.2'
    && development.runtimeBaseVersion === '1.1.3'
    && community.targetRelease?.tag === 'v1.1.3'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.3' && development.publicTag === 'v1.1.3'
        && development.developmentTargetVersion === '1.1.4'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.2' && development.publicTag === 'v1.1.2'
        && development.publicTagCommit === '985ee7ff1a0b0e27627477d80206623f46ea339a'
        && development.developmentTargetVersion === '1.1.3')) return
  if (community.appVersion === '1.1.2'
    && community.patchValidation?.previousPublicVersion === '1.1.1'
    && development.runtimeBaseVersion === '1.1.2'
    && community.targetRelease?.tag === 'v1.1.2'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.2' && development.publicTag === 'v1.1.2'
        && development.developmentTargetVersion === '1.1.3'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.1' && development.publicTag === 'v1.1.1'
        && development.publicTagCommit === '4d3e0550132acb341f1277ec0113e15dfb4b4f32'
        && development.developmentTargetVersion === '1.1.2')) return
  if (community.appVersion === '1.1.1'
    && community.patchValidation?.previousPublicVersion === '1.1.0'
    && development.runtimeBaseVersion === '1.1.1'
    && community.targetRelease?.tag === 'v1.1.1'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.1' && development.publicTag === 'v1.1.1'
        && development.developmentTargetVersion === '1.1.2'
        && community.release?.taggedCommit === development.publicTagCommit
      : community.gates?.githubReleasePublished === false && community.release === null
        && development.publicVersion === '1.1.0' && development.publicTag === 'v1.1.0'
        && development.publicTagCommit === 'a65c534b261e42e22f62061fa5fc086325ffe030'
        && development.developmentTargetVersion === '1.1.1')) return
  if (community.appVersion === '1.1.0'
    && community.patchValidation?.previousPublicVersion === '1.0.26'
    && development.runtimeBaseVersion === '1.1.0'
    && community.targetRelease?.tag === 'v1.1.0'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && (community.gates?.githubReleasePublished === true
      ? development.publicVersion === '1.1.0' && development.publicTag === 'v1.1.0'
        && development.developmentTargetVersion === '1.1.1'
        && community.release?.taggedCommit === development.publicTagCommit
      : development.publicVersion === '1.0.26' && development.publicTag === 'v1.0.26'
        && development.publicTagCommit === 'c5c136140ad68fefb81b50898051012cfc865a20'
        && development.developmentTargetVersion === '1.1.0')) return
  if (development.publicVersion === '1.0.26'
    && development.publicTag === 'v1.0.26'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && development.runtimeBaseVersion === '1.0.26'
    && development.developmentTargetVersion === '1.0.27'
    && community.appVersion === '1.0.26'
    && community.gates?.githubReleasePublished === true
    && community.release?.tag === 'v1.0.26'
    && community.release?.taggedCommit === development.publicTagCommit) return

  if (development.publicVersion === '1.0.25'
    && development.publicTag === 'v1.0.25'
    && development.publicTagCommit === '2f44e143b32b2ac4fb317e24ff6beb9652b95429'
    && development.runtimeBaseVersion === '1.0.26'
    && development.developmentTargetVersion === '1.0.26'
    && community.appVersion === '1.0.26'
    && community.gates?.githubReleasePublished === false
    && community.patchValidation?.previousPublicVersion === '1.0.25'
    && community.targetRelease?.tag === 'v1.0.26') return

  if (development.publicVersion === '1.0.25'
    && development.publicTag === 'v1.0.25'
    && /^[0-9a-f]{40}$/.test(development.publicTagCommit)
    && development.runtimeBaseVersion === '1.0.25'
    && development.developmentTargetVersion === '1.0.26'
    && community.appVersion === '1.0.25'
    && community.gates?.githubReleasePublished === true
    && community.release?.tag === 'v1.0.25'
    && community.release?.taggedCommit === development.publicTagCommit) return

  if (development.publicVersion === '1.0.24'
    && development.publicTag === 'v1.0.24'
    && development.publicTagCommit === '9fa7ffa0f778773cfd999169e695e32a705168ae'
    && development.runtimeBaseVersion === '1.0.25'
    && development.developmentTargetVersion === '1.0.25'
    && community.appVersion === '1.0.25'
    && community.gates?.githubReleasePublished === false
    && community.patchValidation?.previousPublicVersion === '1.0.24'
    && community.targetRelease?.tag === 'v1.0.25') return

  if (development.publicVersion === '1.0.24'
    && development.publicTag === 'v1.0.24'
    && development.publicTagCommit === '9fa7ffa0f778773cfd999169e695e32a705168ae'
    && development.runtimeBaseVersion === '1.0.24'
    && development.developmentTargetVersion === '1.0.25'
    && community.appVersion === '1.0.24'
    && community.gates?.githubReleasePublished === true
    && community.release?.tag === 'v1.0.24'
    && community.release?.taggedCommit === development.publicTagCommit) return
  if (development.publicVersion === '1.0.23'
    && development.publicTag === 'v1.0.23'
    && development.publicTagCommit === '403a5122d169dfb238cd0a424d83e356f644fb08'
    && development.runtimeBaseVersion === '1.0.24'
    && development.developmentTargetVersion === '1.0.24'
    && community.appVersion === '1.0.24'
    && community.gates?.githubReleasePublished === false
    && community.patchValidation?.previousPublicVersion === '1.0.23'
    && community.targetRelease?.tag === 'v1.0.24') return
  if (development.publicVersion === '1.0.23'
    && development.publicTag === 'v1.0.23'
    && development.publicTagCommit === '403a5122d169dfb238cd0a424d83e356f644fb08'
    && development.runtimeBaseVersion === '1.0.23'
    && development.developmentTargetVersion === '1.0.24'
    && community.appVersion === '1.0.23'
    && community.gates?.githubReleasePublished === true
    && community.release?.tag === 'v1.0.23'
    && community.release?.taggedCommit === development.publicTagCommit) return
  if (development.publicVersion === '1.0.22'
    && development.publicTag === 'v1.0.22'
    && development.publicTagCommit === 'cc58aa68d1974ac2445ed4b884c7677f5a320e93'
    && development.runtimeBaseVersion === '1.0.23'
    && development.developmentTargetVersion === '1.0.23'
    && community.appVersion === '1.0.23'
    && community.gates?.githubReleasePublished === false
    && community.patchValidation?.previousPublicVersion === '1.0.22'
    && community.targetRelease?.tag === 'v1.0.23') return
  if (development.publicVersion === '1.0.22'
    && development.publicTag === 'v1.0.22'
    && development.runtimeBaseVersion === '1.0.22'
    && development.developmentTargetVersion === '1.0.23'
    && community.appVersion === '1.0.22'
    && community.gates?.githubReleasePublished === true
    && community.release?.tag === 'v1.0.22'
    && /^[0-9a-f]{40}$/.test(community.release?.taggedCommit ?? '')
    && development.publicTagCommit === community.release.taggedCommit) return
  // Only the explicitly planned successor is accepted. Historical installer and
  // screenshot hashes remain checked by check-v121-managed-updater-lifecycle.
  if (development.publicVersion !== '1.0.21'
    || development.developmentTargetVersion !== '1.0.22'
    || !['1.0.21', '1.0.22'].includes(development.runtimeBaseVersion)
    || community.appVersion !== development.runtimeBaseVersion) {
    throw new Error('v1.0.21 development version boundary drift')
  }
}

export function assertV121UpdaterStatus(policy, community, receipt) {
  if (community.appVersion === '1.1.33') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.targetRelease?.tag !== 'v1.1.33'
      || community.patchValidation?.previousPublicVersion !== '1.1.32'
      || !['1.1.32-to-1.1.33-pending','1.1.32-to-1.1.33-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.33 must retain its separate update observation and immutable predecessor')
    return
  }
  if (community.appVersion === '1.1.32') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.targetRelease?.tag !== 'v1.1.32'
      || community.patchValidation?.previousPublicVersion !== '1.1.31'
      || !['1.1.31-to-1.1.32-pending','1.1.31-to-1.1.32-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.32 must retain its separate update observation and immutable predecessor')
    return
  }
  if (community.appVersion === '1.1.31') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.targetRelease?.tag !== 'v1.1.31'
      || community.patchValidation?.previousPublicVersion !== '1.1.30'
      || !['1.1.30-to-1.1.31-pending','1.1.30-to-1.1.31-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.31 must retain its separate update observation and immutable predecessor')
    return
  }
  if (community.appVersion === '1.1.30') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.targetRelease?.tag !== 'v1.1.30'
      || community.patchValidation?.previousPublicVersion !== '1.1.29'
      || !['1.1.29-to-1.1.30-pending','1.1.29-to-1.1.30-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.30 must retain its separate update observation and immutable predecessor')
    return
  }
  if (community.appVersion === '1.1.29') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.targetRelease?.tag !== 'v1.1.29'
      || community.patchValidation?.previousPublicVersion !== '1.1.28'
      || !['1.1.28-to-1.1.29-pending','1.1.28-to-1.1.29-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.29 must retain its separate update observation and immutable predecessor')
    return
  }
  if (community.appVersion === '1.1.28') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.targetRelease?.tag !== 'v1.1.28'
      || community.patchValidation?.previousPublicVersion !== '1.1.27'
      || !['1.1.27-to-1.1.28-pending','1.1.27-to-1.1.28-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.28 must retain its separate update observation and immutable predecessor')
    return
  }
  if (community.appVersion === '1.1.27') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.targetRelease?.tag !== 'v1.1.27'
      || community.patchValidation?.previousPublicVersion !== '1.1.26'
      || !['1.1.26-to-1.1.27-pending','1.1.26-to-1.1.27-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.27 must retain its separate update observation and immutable predecessor')
    return
  }
  if (community.appVersion === '1.1.26') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.targetRelease?.tag !== 'v1.1.26'
      || community.patchValidation?.previousPublicVersion !== '1.1.25'
      || !['1.1.25-to-1.1.26-pending','1.1.25-to-1.1.26-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.26 must retain its separate update observation and immutable predecessor')
    return
  }
  if (community.appVersion === '1.1.25') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.targetRelease?.tag !== 'v1.1.25'
      || community.patchValidation?.previousPublicVersion !== '1.1.24'
      || !['1.1.24-to-1.1.25-pending','1.1.24-to-1.1.25-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.25 must retain its separate update observation and immutable predecessor')
    return
  }
  if (community.appVersion === '1.1.24') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.targetRelease?.tag !== 'v1.1.24'
      || community.patchValidation?.previousPublicVersion !== '1.1.23'
      || !['1.1.23-to-1.1.24-pending','1.1.23-to-1.1.24-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.24 must retain its separate update observation and immutable predecessor')
    return
  }
  if (community.appVersion === '1.1.23') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.targetRelease?.tag !== 'v1.1.23'
      || community.patchValidation?.previousPublicVersion !== '1.1.22'
      || !['1.1.22-to-1.1.23-pending','1.1.22-to-1.1.23-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.23 must retain its separate update observation and immutable predecessor')
    return
  }
  if (community.appVersion === '1.1.22') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.targetRelease?.tag !== 'v1.1.22'
      || community.patchValidation?.previousPublicVersion !== '1.1.21'
      || !['1.1.21-to-1.1.22-pending','1.1.21-to-1.1.22-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.22 must retain its separate update observation and immutable predecessor')
    return
  }
  if (community.appVersion === '1.1.21') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.targetRelease?.tag !== 'v1.1.21'
      || community.patchValidation?.previousPublicVersion !== '1.1.20'
      || !['1.1.20-to-1.1.21-pending','1.1.20-to-1.1.21-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.21 must retain its separate update observation and immutable predecessor')
    return
  }
  if (community.appVersion === '1.1.20') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.targetRelease?.tag !== 'v1.1.20'
      || community.patchValidation?.previousPublicVersion !== '1.1.19'
      || !['1.1.19-to-1.1.20-pending','1.1.19-to-1.1.20-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.20 must retain its separate update observation and immutable predecessor')
    return
  }
  if (community.appVersion === '1.1.19') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.targetRelease?.tag !== 'v1.1.19'
      || community.patchValidation?.previousPublicVersion !== '1.1.18'
      || !['1.1.18-to-1.1.19-pending','1.1.18-to-1.1.19-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.19 must retain its separate update observation and immutable predecessor')
    return
  }
  if (community.appVersion === '1.1.18') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.targetRelease?.tag !== 'v1.1.18'
      || community.patchValidation?.previousPublicVersion !== '1.1.17'
      || !['1.1.17-to-1.1.18-pending','1.1.17-to-1.1.18-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.18 must retain its separate update observation and immutable predecessor')
    return
  }
  if (community.appVersion === '1.1.17') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.1.16'
      || !['1.1.16-to-1.1.17-pending','1.1.16-to-1.1.17-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.17 must retain its separate update observation and immutable predecessor')
    return
  }
  if (community.appVersion === '1.1.16') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.1.15'
      || !['1.1.15-to-1.1.16-pending','1.1.15-to-1.1.16-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.16 must retain its separate update observation and immutable predecessor')
    return
  }
  if (community.appVersion === '1.1.15') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.1.14'
      || !['1.1.14-to-1.1.15-pending','1.1.14-to-1.1.15-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.15 must retain its separate update observation and immutable predecessor')
    return
  }
  if (community.appVersion === '1.1.14') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.1.13'
      || !['1.1.13-to-1.1.14-pending','1.1.13-to-1.1.14-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.14 must retain its separate update observation and immutable predecessor')
    return
  }
  if (community.appVersion === '1.1.13') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.1.12'
      || !['1.1.12-to-1.1.13-pending','1.1.12-to-1.1.13-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.13 must retain its separate update observation and immutable predecessor')
    return
  }
  if (community.appVersion === '1.1.12') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.1.11'
      || !['1.1.11-to-1.1.12-pending','1.1.11-to-1.1.12-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.12 must retain its separate update observation and immutable predecessor')
    return
  }
  if (community.appVersion === '1.1.11') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.1.10'
      || !['1.1.10-to-1.1.11-pending','1.1.10-to-1.1.11-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.11 must retain its separate update observation and immutable historical predecessor')
    return
  }
  if (community.appVersion === '1.1.10') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.1.9'
      || !['1.1.9-to-1.1.10-pending','1.1.9-to-1.1.10-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.10 must retain its independent update observation and immutable historical predecessor')
    return
  }
  if (community.appVersion === '1.1.9') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.1.8'
      || !['1.1.8-to-1.1.9-pending','1.1.8-to-1.1.9-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) throw Error('1.1.9 must retain its separate official update observation and closed historical predecessor')
    return
  }
  if (community.appVersion === '1.1.8') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.1.7'
      || !['1.1.7-to-1.1.8-pending', '1.1.7-to-1.1.8-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) {
      throw new Error('1.1.8 must retain its separate official update observation and closed historical predecessor')
    }
    return
  }
  if (community.appVersion === '1.1.7') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.1.6'
      || !['1.1.6-to-1.1.7-pending', '1.1.6-to-1.1.7-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) {
      throw new Error('1.1.7 must retain its separate official update observation and closed historical predecessor')
    }
    return
  }
  if (community.appVersion === '1.1.6') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.1.5'
      || !['1.1.5-to-1.1.6-pending', '1.1.5-to-1.1.6-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) {
      throw new Error('1.1.6 must retain its separate official update observation and closed historical predecessor')
    }
    return
  }
  if (community.appVersion === '1.1.5') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.1.4'
      || !['1.1.4-to-1.1.5-pending', '1.1.4-to-1.1.5-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) {
      throw new Error('1.1.5 must retain its separate official update observation and closed historical predecessor')
    }
    return
  }
  if (community.appVersion === '1.1.4') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.1.3'
      || !['1.1.3-to-1.1.4-pending', '1.1.3-to-1.1.4-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) {
      throw new Error('1.1.4 must retain its separate official update observation and closed historical predecessor')
    }
    return
  }
  if (community.appVersion === '1.1.3') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.1.2'
      || !['1.1.2-to-1.1.3-pending', '1.1.2-to-1.1.3-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) {
      throw new Error('1.1.3 must retain its separate official update observation and closed historical predecessor')
    }
    return
  }
  if (community.appVersion === '1.1.2') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.1.1'
      || !['1.1.1-to-1.1.2-pending', '1.1.1-to-1.1.2-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) {
      throw new Error('1.1.2 must retain its own official update observation and closed historical predecessor')
    }
    return
  }
  if (community.appVersion === '1.1.1') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.1.0'
      || !['1.1.0-to-1.1.1-pending', '1.1.0-to-1.1.1-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) {
      throw new Error('1.1.1 must retain its own official update observation and closed historical predecessor')
    }
    return
  }
  if (community.appVersion === '1.1.0') {
    if (policy.status !== 'hosted-managed-update-passed'
      || receipt.managedUpdaterObservation !== '1.0.20-to-1.0.21-passed'
      || community.patchValidation?.previousPublicVersion !== '1.0.26'
      || community.patchValidation?.managedUpdaterUpgradePath !== '1.0.26-to-1.1.0-pending') {
      throw new Error('1.1.0 must retain a separate official update observation and closed historical predecessor')
    }
    return
  }
  if (!['hosted-execution-pending', 'hosted-managed-update-passed'].includes(policy.status)) {
    throw new Error('Unknown v1.0.21 updater observation status')
  }
  const suffix = policy.status === 'hosted-managed-update-passed' ? 'passed' : 'pending'
  const expected = `1.0.20-to-1.0.21-${suffix}`
  if (receipt.managedUpdaterObservation !== expected) {
    throw new Error(`v1.0.21 updater status conflict: release receipt must be ${expected}`)
  }
  if (community.appVersion === '1.0.26') {
    if (suffix !== 'passed' || !(community.gates?.githubReleasePublished === false && community.release === null
        || community.gates?.githubReleasePublished === true && community.release?.tag === 'v1.0.26' && /^(?!0{40})[0-9a-f]{40}$/.test(community.release?.taggedCommit || '')) || community.patchValidation?.previousPublicVersion !== '1.0.25'
      || community.targetRelease?.tag !== 'v1.0.26'
      || !['1.0.25-to-1.0.26-pending', '1.0.25-to-1.0.26-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) {
      throw new Error('v1.0.26 must retain its own update observation')
    }
    return
  }
  if (community.appVersion === '1.0.25') {
    if (suffix !== 'passed' || !(community.gates?.githubReleasePublished === false && community.release === null
        || community.gates?.githubReleasePublished === true && community.release?.tag === 'v1.0.25' && /^(?!0{40})[0-9a-f]{40}$/.test(community.release?.taggedCommit || '')) || community.patchValidation?.previousPublicVersion !== '1.0.24'
      || community.targetRelease?.tag !== 'v1.0.25'
      || !['1.0.24-to-1.0.25-pending', '1.0.24-to-1.0.25-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) {
      throw new Error('v1.0.25 must retain its own update observation')
    }
    return
  }
  if (community.appVersion === '1.0.24') {
    if (suffix !== 'passed' || community.patchValidation?.previousPublicVersion !== '1.0.23'
      || community.targetRelease?.tag !== 'v1.0.24'
      || !(community.gates?.githubReleasePublished === false && community.release === null
        || community.gates?.githubReleasePublished === true && community.release?.tag === 'v1.0.24'
          && community.release?.taggedCommit === '9fa7ffa0f778773cfd999169e695e32a705168ae')
      || community.patchValidation?.managedUpdaterUpgradePath !== '1.0.23-to-1.0.24-pending') {
      throw new Error('v1.0.24 candidate must retain its own pending official update observation')
    }
    return
  }
  if (community.appVersion === '1.0.23') {
    if (suffix !== 'passed'
      || community.patchValidation?.previousPublicVersion !== '1.0.22'
      || community.targetRelease?.tag !== 'v1.0.23'
      || community.patchValidation?.managedUpdaterUpgradePath !== '1.0.22-to-1.0.23-pending'
      || (community.gates?.githubReleasePublished !== false && !(community.gates?.githubReleasePublished === true && community.release?.tag === 'v1.0.23' && community.release?.taggedCommit === '403a5122d169dfb238cd0a424d83e356f644fb08'))) {
      throw new Error('v1.0.21 updater status conflict: v1.0.23 candidate must retain a separate pending update path')
    }
    return
  }
  if (community.appVersion === '1.0.22') {
    if (suffix !== 'passed'
      || community.patchValidation?.previousPublicVersion !== '1.0.21'
      || community.targetRelease?.tag !== 'v1.0.22'
      || !['1.0.21-to-1.0.22-pending', '1.0.21-to-1.0.22-passed'].includes(community.patchValidation?.managedUpdaterUpgradePath)) {
      throw new Error('v1.0.21 updater status conflict: successor must retain its own update path and a closed predecessor')
    }
    return
  }
  if (community.appVersion !== '1.0.21' || community.patchValidation?.managedUpdaterUpgradePath !== expected) {
    throw new Error(`v1.0.21 updater status conflict: community policy and release receipt must both be ${expected}`)
  }
}
