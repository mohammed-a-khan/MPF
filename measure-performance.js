#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Performance measurement script
async function measurePerformance() {
    console.log('🚀 Framework Performance Measurement Tool\n');
    
    // Clean cache before tests
    const cacheDir = path.join(process.cwd(), '.cs-framework-cache');
    const indexFile = path.join(process.cwd(), '.step-index.json');
    
    if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true, force: true });
        console.log('✅ Cleaned cache directory');
    }
    
    if (fs.existsSync(indexFile)) {
        fs.unlinkSync(indexFile);
        console.log('✅ Cleaned step index file');
    }
    
    // Test with traditional loader
    console.log('\n📊 Testing with Traditional Step Loader...');
    const traditionalStart = Date.now();
    
    await runTest('false');
    
    const traditionalTime = Date.now() - traditionalStart;
    console.log(`⏱️  Traditional loader time: ${traditionalTime}ms\n`);
    
    // Test with optimized loader (first run - no cache)
    console.log('📊 Testing with Optimized Step Loader (first run - no cache)...');
    const optimizedFirstStart = Date.now();
    
    await runTest('true');
    
    const optimizedFirstTime = Date.now() - optimizedFirstStart;
    console.log(`⏱️  Optimized loader time (first run): ${optimizedFirstTime}ms\n`);
    
    // Test with optimized loader (second run - with cache)
    console.log('📊 Testing with Optimized Step Loader (second run - with cache)...');
    const optimizedSecondStart = Date.now();
    
    await runTest('true');
    
    const optimizedSecondTime = Date.now() - optimizedSecondStart;
    console.log(`⏱️  Optimized loader time (cached): ${optimizedSecondTime}ms\n`);
    
    // Print summary
    console.log('📈 Performance Summary:');
    console.log('='.repeat(50));
    console.log(`Traditional Loader:           ${traditionalTime}ms`);
    console.log(`Optimized Loader (no cache):  ${optimizedFirstTime}ms`);
    console.log(`Optimized Loader (cached):    ${optimizedSecondTime}ms`);
    console.log('='.repeat(50));
    
    const improvementNoCache = ((traditionalTime - optimizedFirstTime) / traditionalTime * 100).toFixed(1);
    const improvementCached = ((traditionalTime - optimizedSecondTime) / traditionalTime * 100).toFixed(1);
    
    console.log(`\n🎯 Performance Improvement:`);
    console.log(`   First run:  ${improvementNoCache}% faster`);
    console.log(`   Cached run: ${improvementCached}% faster`);
}

function runTest(useOptimized) {
    return new Promise((resolve, reject) => {
        // Set environment variable
        process.env.USE_OPTIMIZED_STEP_LOADER = useOptimized;
        
        const testProcess = spawn('npm', ['run', 'test:quick'], {
            env: {
                ...process.env,
                USE_OPTIMIZED_STEP_LOADER: useOptimized
            },
            stdio: 'pipe'
        });
        
        let initTime = null;
        
        testProcess.stdout.on('data', (data) => {
            const output = data.toString();
            
            // Look for initialization complete message
            if (output.includes('Step definitions loaded')) {
                // Extract initialization time from logs
                const match = output.match(/in (\d+)ms/);
                if (match) {
                    initTime = parseInt(match[1]);
                }
            }
            
            // Only print relevant messages
            if (output.includes('Loading') || output.includes('Optimized') || output.includes('step definitions')) {
                process.stdout.write(output);
            }
        });
        
        testProcess.stderr.on('data', (data) => {
            // Ignore stderr for this measurement
        });
        
        testProcess.on('close', (code) => {
            resolve();
        });
        
        testProcess.on('error', (err) => {
            reject(err);
        });
    });
}

// Run the measurement
measurePerformance().catch(console.error);