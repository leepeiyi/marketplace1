// tests/run-all-tests.js
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Test suites to run in order
const testSuites = [
  'users.test.js',
  'categories.test.js',
  'jobs.test.js',
  'bids.test.js',
  'escrow.test.js',
  'health.test.js',
  'websocket.test.js',
  'error-handling.test.js',
  'concurrent-operations.test.js',
  'data-integrity.test.js',
  'performance.test.js'
];

async function runTestSuite(testFile) {
  return new Promise((resolve, reject) => {
    console.log(`\n🧪 Running ${testFile}...`);
    
    const testProcess = spawn('npm', ['test', `tests/integration/${testFile}`], {
      stdio: 'inherit',
      shell: true
    });

    testProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${testFile} passed`);
        resolve();
      } else {
        console.log(`❌ ${testFile} failed with code ${code}`);
        reject(new Error(`Test suite ${testFile} failed`));
      }
    });
  });
}

async function runAllTests() {
  console.log('🚀 Starting integration test suite...\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const testFile of testSuites) {
    try {
      await runTestSuite(testFile);
      passed++;
    } catch (error) {
      failed++;
      console.error(`Failed to run ${testFile}:`, error.message);
    }
  }
  
  console.log('\n📊 Test Results Summary:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📋 Total: ${testSuites.length}`);
  
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(console.error);
}

export { runAllTests };