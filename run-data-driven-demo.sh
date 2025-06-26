#!/bin/bash

echo "=== Running Data-Driven Demo Tests ==="
echo ""

# Clean old reports
echo "Cleaning old reports..."
rm -rf reports/report-*

# Run CSV demo
echo ""
echo "1. Running CSV Data-Driven Test..."
echo "=================================="
npm run test:akhan -- --feature=test/akhan/features/akhan-login-navigation-csv-demo.feature --tags=@TC501

# Check if CSV test passed
if [ $? -eq 0 ]; then
    echo "✅ CSV test completed"
else
    echo "❌ CSV test failed"
fi

# Run Excel demo
echo ""
echo "2. Running Excel Data-Driven Test..."
echo "===================================="
npm run test:akhan -- --feature=test/akhan/features/akhan-login-navigation-excel-demo.feature --tags=@TC501

# Check if Excel test passed
if [ $? -eq 0 ]; then
    echo "✅ Excel test completed"
else
    echo "❌ Excel test failed"
fi

# Run JSON demo
echo ""
echo "3. Running JSON Data-Driven Test..."
echo "==================================="
npm run test:akhan -- --feature=test/akhan/features/akhan-login-navigation-json-demo.feature --tags=@TC501

# Check if JSON test passed
if [ $? -eq 0 ]; then
    echo "✅ JSON test completed"
else
    echo "❌ JSON test failed"
fi

echo ""
echo "=== All Data-Driven Demo Tests Completed ==="
echo "Check the reports directory for detailed HTML reports"