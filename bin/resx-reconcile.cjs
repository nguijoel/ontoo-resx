'use strict';
// Trusted default-branch orchestration only. Never execute a PR checkout here.
const {REPOSITORY,REPOSITORY_ID}=require('./resx-cicd.cjs');
const CI_APP=15368;
const SHA=/^[a-f0-9]{40}$/;
function assert(v){if(!v)throw Error('RESX_RECONCILIATION_REJECTED');}
function requiredChecks(protection,policyApp,branch){
  assert(protection.enforce_admins?.enabled===true && protection.required_pull_request_reviews && protection.allow_force_pushes?.enabled===false && protection.allow_deletions?.enabled===false && protection.required_conversation_resolution?.enabled===true);
  assert(protection.required_status_checks?.strict===true);
  const checks=protection.required_status_checks.checks||[];
  assert(checks.some(x=>x.context==='RESX CI'&&x.app_id===CI_APP));
  assert(checks.some(x=>x.context==='ONTOO policy eligibility '+branch&&x.app_id===policyApp));
}
function successful(checks,sha,policyApp,branch){
  return [['RESX CI',CI_APP],['ONTOO policy eligibility '+branch,policyApp]].every(([name,id])=>{
    const latest=checks.filter(c=>c.name===name&&c.app?.id===id&&c.head_sha===sha).sort((a,b)=>b.id-a.id)[0];
    return latest?.status==='completed'&&latest.conclusion==='success';
  });
}
async function reconcile({api,policyApp,validatedRun}){
  assert(Number.isSafeInteger(policyApp)&&policyApp>0&&policyApp!==CI_APP);
  const repo=await api('');assert(repo.id===REPOSITORY_ID&&repo.full_name===REPOSITORY&&repo.default_branch==='dev'&&repo.allow_auto_merge===true);
  for(const branch of ['dev','staging'])requiredChecks(await api('/branches/'+branch+'/protection'),policyApp,branch);
  const dev=await api('/git/ref/heads/dev'),stage=await api('/git/ref/heads/staging');
  assert(SHA.test(dev.object.sha)&&SHA.test(stage.object.sha));
  // Paginate full PR inventory; do not silently ignore a second PR for one head.
  const prs=await api('/pulls?state=open&per_page=100',null,true);
  for(const pr of prs){
    if(pr.draft||!['dev','staging'].includes(pr.base.ref)||pr.head.repo?.id!==REPOSITORY_ID)continue;
    if(pr.base.ref==='staging'&&(pr.head.ref!=='dev'||pr.head.sha!==dev.object.sha))continue;
    const checks=await api('/commits/'+pr.head.sha+'/check-runs?per_page=100',null,'check_runs');
    if(!successful(checks,pr.head.sha,policyApp,pr.base.ref))continue;
    const fresh=await api('/pulls/'+pr.number);
    if(fresh.head.sha!==pr.head.sha||fresh.draft||fresh.state!=='open')continue;
    // Native merge checks/reviews remain authoritative and are never bypassed.
    await api('/graphql-enable-auto-merge',{nodeId:fresh.node_id});
  }
  // Promotion is a protected PR, not a direct branch write. Only the current
  // successful dev run can create it; arbitrary dispatches cannot invent validation.
  if(!validatedRun||!['dev','staging'].includes(validatedRun.head_branch)||validatedRun.conclusion!=='success')return;
  const expected=validatedRun.head_branch==='dev'?dev.object.sha:stage.object.sha;
  if(validatedRun.head_sha!==expected)return;
  assert(validatedRun.repository?.id===REPOSITORY_ID);
  const workflow=await api('/actions/workflows/'+validatedRun.workflow_id);
  assert(workflow.path==='.github/workflows/resx-ci.yml');
  const devCommit=await api('/git/commits/'+dev.object.sha),stageCommit=await api('/git/commits/'+stage.object.sha);
  assert(SHA.test(devCommit.tree?.sha||'')&&SHA.test(stageCommit.tree?.sha||''));
  if(devCommit.tree.sha===stageCommit.tree.sha){
    if(dev.object.sha===stage.object.sha||validatedRun.head_branch!=='staging')return;
    const ancestry=await api('/compare/'+dev.object.sha+'...'+stage.object.sha);
    assert(ancestry.status==='ahead'&&ancestry.merge_base_commit?.sha===dev.object.sha);
    const sync=prs.filter(p=>p.base.ref==='dev'&&p.head.ref==='staging'&&p.head.repo?.id===REPOSITORY_ID);assert(sync.length<=1);
    if(!sync.length){
      await api('/pulls',{title:'Synchronize verified RESX promotion ancestry',head:'staging',base:'dev',draft:false,body:'Ancestry only: exact current dev/staging full Git trees match. Independent eligibility must verify current refs and prior promotion; no application/config/schema content change.'});
      await api('/actions/workflows/resx-ci.yml/dispatches',{ref:'staging'});
    }return;
  }
  if(validatedRun.head_branch!=='dev')return;
  const comparison=await api('/compare/'+stage.object.sha+'...'+dev.object.sha);
  assert(comparison.status==='ahead'&&comparison.merge_base_commit?.sha===stage.object.sha);
  const existing=prs.filter(p=>p.base.ref==='staging'&&p.head.ref==='dev'&&p.head.repo?.id===REPOSITORY_ID);
  assert(existing.length<=1);
  if(!existing.length){await api('/pulls',{title:'Promote validated RESX dev to staging',head:'dev',base:'staging',draft:false,body:'CI/CD-POC-001 protected promotion. Source '+dev.object.sha+'; validated run '+validatedRun.id+'. Independent policy eligibility and native branch checks remain required. No direct push or PROD operation.'});
  // GITHUB_TOKEN-created PRs do not recursively start pull_request workflows.
  // Explicit dispatch is one of GitHub's permitted token-triggered events.
  await api('/actions/workflows/resx-ci.yml/dispatches',{ref:'dev'});}
  // Existing promotion: no repeat dispatch, preventing workflow_run recursion.
}
async function main(){
  const fs=require('node:fs');
  assert(process.env.GITHUB_REPOSITORY===REPOSITORY&&process.env.GITHUB_REF==='refs/heads/dev');
  const policyApp=Number(process.env.RESX_POLICY_APP_ID),token=process.env.GH_TOKEN;assert(token);
  const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  if(event.workflow_run && event.workflow_run.conclusion!=='success')return;
  const api=async(path,body,pagination)=>{
    if(path==='/graphql-enable-auto-merge'){
      const r=await fetch('https://api.github.com/graphql',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query:'mutation($id:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:MERGE}){pullRequest{id}}}',variables:{id:body.nodeId}}),redirect:'error',signal:AbortSignal.timeout(20000)});
      assert(r.ok);const d=await r.json();assert(!d.errors);return d.data;
    }
    let output=[];
    for(let page=1;page<=30;page++){
      const suffix=pagination?(path.includes('?')?'&':'?')+'page='+page:'';
      const r=await fetch('https://api.github.com/repos/'+REPOSITORY+path+suffix,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(20000)});
      assert(r.ok);if(r.status===204)return null;const d=await r.json();
      if(!pagination)return d;
      const rows=pagination===true?d:d[pagination];assert(Array.isArray(rows));output.push(...rows);
      if(rows.length<100)return output;
    }throw Error('PAGINATION_INCOMPLETE');
  };
  await reconcile({api,policyApp,validatedRun:event.workflow_run});console.log('Protected RESX reconciliation completed; no direct branch/deployment write.');
}
if(require.main===module)main().catch(()=>{console.error('RESX_RECONCILIATION_REJECTED');process.exitCode=1;});
module.exports={requiredChecks,successful,reconcile};
