// Read-only preflight for the disposable runner; product requests remain unchanged.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
for(const[key,value]of Object.entries({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows',LONGEDIT_R5I_DISPOSABLE:'1'}))assert.equal(process.env[key],value)
const url='https://api.github.com/repos/Longyuyeee/Long_MarkDownReader/releases/latest',report={status:'running',sourceUserContentIncluded:false,authenticated:false,officialApi:url,productSourceCommit:process.env.CANDIDATE_COMMIT,harnessSourceCommit:process.env.GITHUB_SHA}
try{
 const response=await fetch(url,{headers:{'User-Agent':`LongEdit/${process.env.RELEASE_VERSION} community-updater`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(30000)})
 report.httpStatus=response.status;report.remaining=response.headers.has('x-ratelimit-remaining')?Number(response.headers.get('x-ratelimit-remaining')):null;report.resetAt=response.headers.get('x-ratelimit-reset')
 if(!response.ok)throw Error('Runner official API unavailable: HTTP '+response.status+' '+(await response.text()).slice(0,250))
 const release=await response.json();assert.match(release.tag_name,/^v\d+\.\d+\.\d+$/);assert.equal(release.draft,false);assert.equal(release.prerelease,false);report.observedTag=release.tag_name
 if(report.remaining!==null&&report.remaining<8)throw Error('Runner unauthenticated API budget is too low for the real installed update check')
 report.status='passed-network-preflight'
}catch(error){report.status='blocked-runner-network';report.error=String(error);process.exitCode=1}
await fs.writeFile('installer-network-preflight.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report))
