'use strict';
// First repository enrollment of the shared ONTOO baseline; not global authority.
const controls = require('./ontoo-cicd.cjs').createControls({
  repository: 'nguijoel/ontoo-resx',
  repositoryId: 795522855,
  integrationBranch: 'dev',
  promotionBranch: 'staging',
  ciWorkflow: '.github/workflows/resx-ci.yml',
  ciCheck: 'RESX CI',
  ciAppId: 15368,
  routineRoots: ['api/src', 'webapp/src'],
});
if (require.main === module) {
  try {
    if (process.argv.length !== 4) throw Error();
    console.log(JSON.stringify(controls.classify(controls.changedFiles(process.argv[2], process.argv[3]))));
  } catch {
    console.error('SOURCE_ADMISSION_REJECTED');
    process.exitCode = 1;
  }
}
module.exports = controls;
