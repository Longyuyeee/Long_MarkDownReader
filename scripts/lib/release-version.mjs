// Installer checks must follow semantic versions across a minor transition.
export function releaseAtLeast(actual, baseline) {
 const parse=value=>{
  if(!/^\d+\.\d+\.\d+$/.test(value))throw Error('Expected a release version')
  return value.split('.').map(Number)
 }
 const left=parse(actual),right=parse(baseline)
 for(let i=0;i<3;i++)if(left[i]!==right[i])return left[i]>right[i]
 return true
}
