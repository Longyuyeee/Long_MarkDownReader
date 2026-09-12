import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertV121UpdaterStatus } from './lib/v121-updater-status.mjs'

for (const status of ['hosted-execution-pending', 'hosted-managed-update-passed']) {
  for (const communitySuffix of ['pending', 'passed']) {
    for (const receiptSuffix of ['pending', 'passed']) {
      test(`${status}: community=${communitySuffix}, receipt=${receiptSuffix}`, () => {
        const check = () => assertV121UpdaterStatus({ status }, {
          patchValidation: { managedUpdaterUpgradePath: `1.0.20-to-1.0.21-${communitySuffix}` },
        }, { managedUpdaterObservation: `1.0.20-to-1.0.21-${receiptSuffix}` })
        const expected = status === 'hosted-execution-pending' ? 'pending' : 'passed'
        if (communitySuffix === expected && receiptSuffix === expected) assert.doesNotThrow(check)
        else assert.throws(check, /status conflict/)
      })
    }
  }
}
test('unknown status fails closed', () => {
  assert.throws(() => assertV121UpdaterStatus({ status: 'unknown' }, {}, {}), /Unknown/)
})
