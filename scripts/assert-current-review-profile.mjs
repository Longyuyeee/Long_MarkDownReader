import {assertCurrentReviewProfile} from './lib/release-validation-profile.mjs'
const [version,sourceCommit,harnessCommit,directory]=process.argv.slice(2)
console.log(JSON.stringify(assertCurrentReviewProfile(version,sourceCommit,harnessCommit,directory)||{profile:'legacy-full-regression'}))
