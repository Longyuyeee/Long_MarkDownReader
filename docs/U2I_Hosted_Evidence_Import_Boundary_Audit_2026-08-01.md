# U2I Hosted Evidence Import Boundary Audit

Date: 2026-08-01

Stage: U2I / hosted unsigned evidence import

## Outcome

GitHub Actions run `30660582582` completed successfully. Its runner identified itself as Microsoft Windows Server 2025 Datacenter, build 26100, x64. This closes the generic disposable-Windows lifecycle execution but is not Windows 11 client evidence.

The evidence importer now supports two independently bound commits:

- the current repository commit containing the lifecycle orchestration; and
- the frozen product source commit recorded by an approved artifact manifest.

This is required because the product binary remains frozen while the evidence runner is repaired and audited in later commits. The import still fails closed on exact product source commit, installer SHA-256, archive member set, per-member digests, privacy fields, application version, and non-promotion flags.

Generic `imported` evidence may now identify Windows Server. Windows 10 and Windows 11 lane targets remain strict: a Server result cannot enter either client release lane, and cross-lane client evidence is still rejected.

## Release boundary

The artifact is unsigned, `releaseCandidate=false`, and `promotionEligible=false`. Separate signed Windows 10 x64 and Windows 11 x64 client executions remain mandatory before release promotion.
