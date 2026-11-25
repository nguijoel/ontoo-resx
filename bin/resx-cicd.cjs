'use strict';
// RESX adapter for GOV-CICD source admission. This is not an independent publisher.
const {execFileSync} = require('node:child_process');
const REPOSITORY = 'nguijoel/ontoo-resx';
const REPOSITORY_ID = 795522855;
const SHA = /^[a-f0-9]{40}$/;
function requireValue(value, code) { if (!value) throw new Error(code); }
function pathKind(path) {
  requireValue(typeof path === 'string' && path.length > 0 && !path.includes('\\') && !path.startsWith('/') && !path.split('/').some(x => x === '..' || x === '.' || !x), 'INVALID_PATH');
  if (/(^|\/)(?:\.env(?:\..*)?|[^/]+\.(?:env|pem|key|p12|pfx|dump|bak|sqlite3?))$/i.test(path)) return 'forbidden';
  if (/^(?:\.github\/|bin\/|deploy\/|scripts\/database\/|docs\/governance\/)/.test(path) || /(?:^|\/)(?:auth[^/]*|.*config[^/]*|.*migration[^/]*|.*permission[^/]*)\//i.test(path) || /(?:^|\/)(?:package(?:-lock)?\.json|yarn\.lock|.*(?:config|guard|auth|security|secret|policy|oauth|tenant|session|jwt|passport|role|acl|user)[^/]*\.[^/]+)$/i.test(path)) return 'protected';
  if (/^docs\/.*\.(?:md|txt)$/.test(path) || /^(?:README|CHANGELOG|CONTRIBUTING)\.md$/.test(path)) return 'documentation';
  if (/^(?:api\/src|webapp\/src)\/.*\.(?:ts|html|css|scss|png|ico)$/.test(path)) return 'routine';
  return 'protected'; // Unknown change categories require review, never an optimistic bypass.
}
function classify(files) {
  requireValue(Array.isArray(files) && files.length > 0 && files.length <= 3000, 'INCOMPLETE_DIFF');
  const kinds = files.flatMap(file => {
    requireValue(file && ['added','modified','removed','renamed','copied','changed'].includes(file.status), 'INCOMPLETE_DIFF');
    requireValue(file.status !== 'renamed' || typeof file.previous_filename === 'string', 'INCOMPLETE_RENAME');
    return [file.filename, ...(file.previous_filename ? [file.previous_filename] : [])].map(pathKind);
  });
  requireValue(!kinds.includes('forbidden'), 'FORBIDDEN_TRACKED_INPUT');
  const names=files.flatMap(f=>[f.filename,...(f.previous_filename?[f.previous_filename]:[])]);
  const documentationOnly=names.every(p=>/^docs\/.*\.(?:md|txt)$/.test(p)||/^(?:README|CHANGELOG|CONTRIBUTING)\.md$/.test(p));
  return {protected:kinds.includes('protected'),documentationOnly,fileCount:files.length};
}
function sourceRoute(pr) {
  requireValue(pr && pr.base?.repo?.id === REPOSITORY_ID && pr.base.repo.full_name === REPOSITORY && pr.head?.repo?.id === REPOSITORY_ID && pr.head.repo.full_name === REPOSITORY && SHA.test(pr.head.sha || ''), 'WRONG_REPOSITORY');
  requireValue(pr.base.ref === 'dev' || (pr.base.ref === 'staging' && pr.head.ref === 'dev'), 'WRONG_PROMOTION_ROUTE');
  return pr.base.ref;
}
function latestHumanApproval(pr, reviews, authorizedIds) {
  requireValue(Array.isArray(reviews) && Array.isArray(authorizedIds) && authorizedIds.every(Number.isSafeInteger), 'INVALID_REVIEW_EVIDENCE');
  const latest = new Map();
  for (const review of [...reviews].sort((a,b) => a.id-b.id)) {
    if (['APPROVED','CHANGES_REQUESTED','DISMISSED'].includes(review.state)) latest.set(review.user?.id, review);
  }
  if ([...latest.values()].some(r => r.state === 'CHANGES_REQUESTED')) return false;
  return [...latest.values()].some(r => r.state === 'APPROVED' && r.commit_id === pr.head.sha && r.user?.type === 'User' && r.user.id !== pr.user?.id && authorizedIds.includes(r.user.id));
}
function eligibility({pr,files,reviews,authorizedReviewerIds,checks,head,baseSha,protectionsVerified,ciEvidence,approvedWorkflowDigest,synchronization}) {
  sourceRoute(pr);
  requireValue(pr.state === 'open' && pr.draft === false && ['OWNER','MEMBER','COLLABORATOR'].includes(pr.author_association), 'NOT_READY');
  requireValue(SHA.test(head || '') && pr.head.sha === head && pr.base.sha === baseSha && SHA.test(baseSha || '') && protectionsVerified === true, 'STALE_OR_UNPROTECTED');
  const ci=ciEvidence;
  requireValue(ci && ci.repositoryId===REPOSITORY_ID && ci.sourceSha===head && /^[1-9][0-9]*$/.test(ci.runId||'') && Number.isSafeInteger(ci.runAttempt) && ci.runAttempt>0 && ci.workflowPath==='.github/workflows/resx-ci.yml' && /^[a-f0-9]{64}$/.test(approvedWorkflowDigest||'') && ci.workflowBlobSha256===approvedWorkflowDigest && ci.conclusion==='success', 'UNTRUSTED_CI_PROVENANCE');
  let scope;
  if(Array.isArray(files)&&files.length===0) {
    const sync=synchronization;
    requireValue(pr.base.ref==='dev'&&pr.head.ref==='staging'&&sync&&sync.currentDevSha===baseSha&&sync.currentStagingSha===head&&/^[a-f0-9]{40}$/.test(sync.devTree||'')&&sync.devTree===sync.stagingTree&&sync.currentDevIsAncestor===true&&sync.priorPromotionVerified===true,'UNVERIFIED_EMPTY_SYNC');
    scope={protected:false,documentationOnly:true,fileCount:0,ancestryOnly:true};
  } else scope=classify(files);
  // Collected by protected orchestration, never accepted as a public request body.
  requireValue(Array.isArray(checks) && checks.some(x => x.name === 'RESX CI' && x.head_sha === head && x.conclusion === 'success' && x.app?.id === 15368 && x.id === ci.checkRunId), 'CI_NOT_SUCCESSFUL');
  if (scope.protected) requireValue(latestHumanApproval(pr,reviews,authorizedReviewerIds), 'HUMAN_REVIEW_REQUIRED');
  return {repositoryId:REPOSITORY_ID,head,baseSha,destination:pr.base.ref,...scope};
}
function changedFiles(base,head) {
  requireValue(SHA.test(base || '') && SHA.test(head || ''), 'INVALID_RANGE');
  const output=execFileSync('git',['diff','--name-status','-z','--find-renames',base,head],{encoding:'utf8',maxBuffer:4*1024*1024}).split('\0');
  const files=[];
  for(let i=0;i<output.length-1;) {
    const status=output[i++];
    if(status.startsWith('R') || status.startsWith('C')) {
      const previous_filename=output[i++],filename=output[i++];
      files.push({status:status.startsWith('R')?'renamed':'copied',previous_filename,filename});
    } else files.push({status:({A:'added',M:'modified',D:'removed',T:'changed'})[status],filename:output[i++]});
  }
  return files;
}
if(require.main===module) {
  try {
    requireValue(process.argv.length===4,'INVALID_ARGUMENTS');
    console.log(JSON.stringify(classify(changedFiles(process.argv[2],process.argv[3]))));
  } catch(e) {console.error(['INCOMPLETE_DIFF','FORBIDDEN_TRACKED_INPUT','INVALID_PATH','INVALID_RANGE'].includes(e.message)?e.message:'SOURCE_ADMISSION_REJECTED');process.exitCode=1;}
}
module.exports={REPOSITORY,REPOSITORY_ID,classify,pathKind,sourceRoute,latestHumanApproval,eligibility,changedFiles};
