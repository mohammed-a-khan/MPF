// test-akhan-steps.ts - Test AKHAN step definition loading
import 'reflect-metadata';
import { stepRegistry } from './src/bdd/decorators/StepRegistry';

async function testAKHANStepDefinitions() {
    console.log('🔍 Testing AKHAN step definition loading...');
    
    try {
        // Check initial state
        const statsBefore = stepRegistry.getStats();
        console.log(`📊 Registry stats BEFORE: ${JSON.stringify(statsBefore, null, 2)}`);
        
        // Import AKHAN step definitions
        console.log('📥 Importing AKHAN step definitions...');
        await import('./test/akhan/steps/akhan-login-navigation.steps');
        
        // Check stats after import
        const statsAfter = stepRegistry.getStats();
        console.log(`📊 Registry stats AFTER: ${JSON.stringify(statsAfter, null, 2)}`);
        
        // Check if AKHAN class is registered
        const classInstances = Array.from(stepRegistry['classInstances'].keys());
        console.log(`🏗️  Class instances: ${classInstances.join(', ')}`);
        
        // Check specific steps
        const allSteps = stepRegistry.getAllStepDefinitions();
        console.log(`📋 Total step definitions: ${allSteps.length}`);
        
        // Look for AKHAN-specific steps
        const akhanSteps = allSteps.filter(step => 
            step.patternString.includes('AKHAN') || 
            step.patternString.includes('login') ||
            step.metadata.className?.includes('AKHAN')
        );
        
        console.log(`🎯 AKHAN-related steps found: ${akhanSteps.length}`);
        akhanSteps.forEach((step, index) => {
            console.log(`  ${index + 1}. Pattern: "${step.patternString}"`);
            console.log(`     Class: ${step.metadata.className}`);
            console.log(`     Method: ${step.metadata.methodName}`);
        });
        
        if (akhanSteps.length > 0) {
            console.log('✅ AKHAN step definitions loaded successfully!');
        } else {
            console.log('❌ No AKHAN step definitions found!');
        }
        
    } catch (error) {
        console.error('❌ Error testing AKHAN step definitions:', error);
    }
}

testAKHANStepDefinitions().then(() => {
    console.log('🏁 Test completed');
}).catch(error => {
    console.error('💥 Test failed:', error);
}); 