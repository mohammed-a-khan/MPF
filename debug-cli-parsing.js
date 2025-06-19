const { CommandLineParser } = require('./src/core/cli/CommandLineParser');

console.log('Testing command line parsing...');

// Test parsing with environment argument
const testArgs = ['node', 'script.js', '--environment', 'ado-test'];

console.log('Input args:', testArgs);

try {
  const options = CommandLineParser.parse(testArgs);
  console.log('Parsed environment:', options.environment);
  console.log('Full options:', JSON.stringify(options, null, 2));
} catch (error) {
  console.error('Parsing failed:', error.message);
} 