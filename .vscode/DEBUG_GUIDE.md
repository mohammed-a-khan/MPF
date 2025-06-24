# 🔍 CS Test Automation Framework - Debug Guide

## 📍 **FRAMEWORK ENTRY POINTS & BREAKPOINT LOCATIONS**

### 🚀 **PRIMARY ENTRY POINT**
**File**: `src/index.ts`
**Function**: `main()` - Line ~95
**Breakpoint Location**: Place breakpoint at the very first line of `main()` function

```typescript
// 🔴 PLACE BREAKPOINT HERE
async function main(): Promise<void> {
    console.log('🚀 Starting CS Test Automation Framework...');
    // ... rest of the function
}
```

### 🎯 **CRITICAL DEBUGGING POINTS**

#### 1. **Framework Initialization**
- **File**: `src/index.ts`
- **Function**: `runTests()` - Line ~185
- **Breakpoint**: First line of `runTests()` function

#### 2. **Browser Manager Initialization**
- **File**: `src/core/browser/BrowserManager.ts`
- **Function**: `initialize()` - Line ~45
- **Breakpoint**: First line of `initialize()` method
- **Critical**: This is where browser instances are created

#### 3. **BDD Runner Start**
- **File**: `src/bdd/runner/CSBDDRunner.ts`
- **Function**: `run()` - Line ~100
- **Breakpoint**: First line of static `run()` method

#### 4. **Execution Context Creation**
- **File**: `src/bdd/context/ExecutionContext.ts`
- **Function**: `initialize()` - Line ~360
- **Breakpoint**: First line of `initialize()` method

#### 5. **Scenario Execution**
- **File**: `src/bdd/runner/ScenarioExecutor.ts`
- **Function**: `executeSingleScenario()` - Line ~85
- **Breakpoint**: First line of this method

#### 6. **Step Execution**
- **File**: `src/bdd/runner/StepExecutor.ts`
- **Function**: `execute()` - Line ~45
- **Breakpoint**: First line of `execute()` method

#### 7. **Browser Context Validation**
- **File**: `src/bdd/runner/ScenarioExecutor.ts`
- **Function**: `validateBrowserContext()` - Line ~315
- **Breakpoint**: This is where browser closure errors occur

## 🔧 **HOW TO DEBUG**

### **Method 1: VSCode Debug Panel**
1. Open VSCode
2. Go to Debug panel (Ctrl+Shift+D)
3. Select "🔍 Debug CS Framework - Main Entry"
4. Place breakpoints at the locations mentioned above
5. Press F5 to start debugging

### **Method 2: Step-by-Step Debugging**
1. Select "🔍 Debug Step by Step Execution"
2. This will enable additional debug logging
3. Watch the console for detailed execution flow

### **Method 3: Browser-Specific Debugging**
1. Select "🔍 Debug Browser Manager"
2. Focus specifically on browser lifecycle issues

## 📋 **RECOMMENDED BREAKPOINT SEQUENCE**

### **For Browser Issues:**
1. `src/index.ts:95` - main() function start
2. `src/core/browser/BrowserManager.ts:45` - Browser initialization
3. `src/bdd/context/ExecutionContext.ts:360` - Context initialization
4. `src/bdd/runner/ScenarioExecutor.ts:315` - Browser validation
5. `src/steps/ui/NavigationSteps.ts:275` - Tab closure (recently fixed)

### **For Test Execution Flow:**
1. `src/index.ts:185` - runTests() start
2. `src/bdd/runner/CSBDDRunner.ts:100` - BDD Runner start
3. `src/bdd/runner/ScenarioExecutor.ts:85` - Scenario execution
4. `src/bdd/runner/StepExecutor.ts:45` - Step execution

## 🔍 **DEBUGGING VARIABLES TO WATCH**

### **Browser State:**
- `this.browser` (in BrowserManager)
- `this.browserContext` (in ExecutionContext)
- `this.page` (in various step definitions)

### **Execution State:**
- `executionResult` (in CSBDDRunner)
- `scenario.status` (in ScenarioExecutor)
- `step.status` (in StepExecutor)

### **Context State:**
- `this.globalContext` (in ExecutionContext)
- `this.scenarioContext` (in ExecutionContext)

## 🚨 **KNOWN ISSUE LOCATIONS**

### **Browser Closure Issues:**
- ❌ **FIXED**: `src/steps/ui/NavigationSteps.ts:280` - Was closing shared page
- ❌ **FIXED**: `src/reporting/exporters/ProfessionalPDFExporter.ts:288` - Was closing shared browser

### **Multiple Browser Initialization:**
- ✅ **RESOLVED**: Multiple components were initializing browsers
- ✅ **CURRENT**: Only ExecutionContext should initialize browser

## 📊 **DEBUG ENVIRONMENT VARIABLES**

When debugging, these environment variables are automatically set:
- `NODE_ENV=development`
- `DEBUG=true`
- `BROWSER_DEBUG=true`
- `STEP_DEBUG=true` (for step-by-step debugging)

## 🎯 **QUICK DEBUG COMMANDS**

### **Start Debug Session:**
```bash
# In VSCode: Press F5 with "Debug CS Framework - Main Entry" selected
```

### **Debug Specific Component:**
```bash
# Use the respective debug configuration from the dropdown
```

### **View Debug Logs:**
```bash
# All debug logs will appear in the VSCode Debug Console
# Browser debug logs will have [BROWSER-DEBUG] prefix
```

## 📝 **DEBUGGING CHECKLIST**

- [ ] Breakpoint set at `src/index.ts:95` (main function)
- [ ] Breakpoint set at `src/core/browser/BrowserManager.ts:45` (browser init)
- [ ] Breakpoint set at `src/bdd/runner/ScenarioExecutor.ts:315` (browser validation)
- [ ] Debug configuration selected in VSCode
- [ ] Debug console open to view logs
- [ ] Watch panel configured with browser state variables

## 🔄 **EXECUTION FLOW SUMMARY**

```
src/index.ts:main() 
    ↓
src/index.ts:runTests()
    ↓
src/bdd/runner/CSBDDRunner.ts:run()
    ↓
src/bdd/context/ExecutionContext.ts:initialize()
    ↓
src/core/browser/BrowserManager.ts:initialize()
    ↓
src/bdd/runner/CSBDDRunner.ts:execute()
    ↓
src/bdd/runner/ScenarioExecutor.ts:executeSingleScenario()
    ↓
src/bdd/runner/StepExecutor.ts:execute()
    ↓
[Step Definitions in src/steps/]
```

This flow shows the exact sequence where you should place breakpoints to trace the execution and identify where browser issues occur. 