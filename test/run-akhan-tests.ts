import { CSBDDRunner } from '../src/bdd/runner/CSBDDRunner';

async function runTests() {
  try {
    // Use the static run method with proper RunOptions
    await CSBDDRunner.run({
      paths: ['test/akhan/features/akhan-login-navigation.feature'],
      parallel: false,
      retry: 0
    });
  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  }
}

runTests().catch(console.error); 