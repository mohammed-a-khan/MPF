const { ConfigurationManager } = require('./src/core/configuration/ConfigurationManager');

async function debugADOConfig() {
  try {
    console.log('Loading ado-test environment...');
    await ConfigurationManager.loadConfiguration('ado-test');
    
    console.log('ADO_INTEGRATION_ENABLED (string):', ConfigurationManager.get('ADO_INTEGRATION_ENABLED'));
    console.log('ADO_INTEGRATION_ENABLED (boolean):', ConfigurationManager.getBoolean('ADO_INTEGRATION_ENABLED', false));
    
    console.log('\nAll ADO-related keys:');
    const allKeys = ConfigurationManager.getAllKeys();
    const adoKeys = allKeys.filter(key => key.startsWith('ADO_'));
    adoKeys.forEach(key => {
      console.log(`  ${key}: ${ConfigurationManager.get(key)}`);
    });
  } catch (error) {
    console.error('Error:', error);
  }
}

debugADOConfig(); 