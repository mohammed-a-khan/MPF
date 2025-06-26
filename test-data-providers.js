const fs = require('fs');
const path = require('path');

console.log('=== Testing Data Provider Files ===\n');

// Test CSV
console.log('1. CSV File:');
const csvPath = path.join(__dirname, 'test/akhan/data/akhan-combined-test-data.csv');
if (fs.existsSync(csvPath)) {
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split('\n').slice(0, 5);
    console.log('✅ CSV file exists');
    console.log('First 5 lines:');
    lines.forEach(line => console.log('  ', line));
} else {
    console.log('❌ CSV file not found');
}

// Test Excel
console.log('\n2. Excel File:');
const excelPath = path.join(__dirname, 'test/akhan/data/akhan-combined-test-data.xlsx');
if (fs.existsSync(excelPath)) {
    console.log('✅ Excel file exists');
    console.log('   Size:', fs.statSync(excelPath).size, 'bytes');
} else {
    console.log('❌ Excel file not found');
}

// Test JSON
console.log('\n3. JSON File:');
const jsonPath = path.join(__dirname, 'test/akhan/data/akhan-combined-test-data.json');
if (fs.existsSync(jsonPath)) {
    const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    console.log('✅ JSON file exists and is valid');
    console.log('   Total test data entries:', jsonContent.testData.length);
    console.log('   Login tests:', jsonContent.testData.filter(d => d.testType === 'login').length);
    console.log('   Navigation tests:', jsonContent.testData.filter(d => d.testType === 'navigation').length);
    console.log('   Menu verify tests:', jsonContent.testData.filter(d => d.testType === 'menu-verify').length);
} else {
    console.log('❌ JSON file not found');
}

console.log('\n=== Test Complete ===');