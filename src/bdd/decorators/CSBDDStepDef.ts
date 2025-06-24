import { stepRegistry } from './StepRegistry';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { HookType } from '../types/bdd.types';

export interface StepDefinitionOptions {
  timeout?: number;
  wrapperOptions?: any;
  retry?: number;
}

/**
 * Decorator for marking a method as a step definition
 */
export function CSBDDStepDef(pattern: string | RegExp, options?: StepDefinitionOptions) {
  return function (target: any, propertyKey: string, methodDescriptor: PropertyDescriptor) {
    console.log(`🔍 DEBUG: CSBDDStepDef decorator called for method: ${propertyKey}`);
    
    // Get original method
    const originalMethod = methodDescriptor.value;
    
    // Get file and line information
    const filePath = target.constructor.filePath || 'unknown';
    const line = target.constructor.line || 0;
    
    // Create step definition metadata
    const stepDefinition = {
      pattern,
      implementation: originalMethod,
      location: `${filePath}:${line}`,
      options
    };
    
    // Get metadata for registration
    const metadata = {
      file: filePath,
      line,
      timeout: options?.timeout,
      retry: options?.retry,
      wrapperOptions: options?.wrapperOptions
    };
    
    // Register step with registry
    stepRegistry.registerStep(pattern, originalMethod, metadata);
    console.log(`🔍 DEBUG: Step registered successfully: ${pattern.toString()}`);
    
    // Log registration
    Logger.getInstance().debug(`Registered step definition: ${pattern.toString()} -> ${stepDefinition.location}`);
    
    // Don't wrap the method - let the StepExecutor handle the execution
    // This preserves the original method for proper binding
    // The wrapping was causing 'this' context issues
    
    // Keep the original method - no wrapping needed
    
    return methodDescriptor;
  };
}

/**
 * Decorator for marking methods as Before hooks
 */
export function Before(options?: { tags?: string; order?: number; timeout?: number }) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const hook = {
      type: HookType.Before,
      method: descriptor.value,
      methodName: String(propertyKey),
      className: target.constructor.name,
      tags: options?.tags,
      order: options?.order || 0,
      timeout: options?.timeout,
      location: `${target.constructor.name}.${propertyKey}`
    };
    
    const registerOptions: {
      tags?: string;
      order?: number;
      timeout?: number;
      name?: string;
    } = {
      name: `${target.constructor.name}.${propertyKey}`
    };
    
    if (options?.tags !== undefined) {
      registerOptions.tags = options.tags;
    }
    if (options?.order !== undefined) {
      registerOptions.order = options.order;
    }
    if (options?.timeout !== undefined) {
      registerOptions.timeout = options.timeout;
    }
    
    stepRegistry.registerHook(HookType.Before, descriptor.value, registerOptions);
    Logger.getInstance().debug(`Registered Before hook: ${hook.location}`);
  };
}

/**
 * Decorator for marking methods as After hooks
 */
export function After(options?: { tags?: string; order?: number; timeout?: number }) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const hook = {
      type: HookType.After,
      method: descriptor.value,
      methodName: String(propertyKey),
      className: target.constructor.name,
      tags: options?.tags,
      order: options?.order || 0,
      timeout: options?.timeout,
      location: `${target.constructor.name}.${propertyKey}`
    };
    
    const registerOptions: {
      tags?: string;
      order?: number;
      timeout?: number;
      name?: string;
    } = {
      name: `${target.constructor.name}.${propertyKey}`
    };
    
    if (options?.tags !== undefined) {
      registerOptions.tags = options.tags;
    }
    if (options?.order !== undefined) {
      registerOptions.order = options.order;
    }
    if (options?.timeout !== undefined) {
      registerOptions.timeout = options.timeout;
    }
    
    stepRegistry.registerHook(HookType.After, descriptor.value, registerOptions);
    Logger.getInstance().debug(`Registered After hook: ${hook.location}`);
  };
}

/**
 * Decorator for marking methods as BeforeStep hooks
 */
export function BeforeStep(options?: { tags?: string; order?: number; timeout?: number }) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const hook = {
      type: HookType.BeforeStep,
      method: descriptor.value,
      methodName: String(propertyKey),
      className: target.constructor.name,
      tags: options?.tags,
      order: options?.order || 0,
      timeout: options?.timeout,
      location: `${target.constructor.name}.${propertyKey}`
    };
    
    const registerOptions: {
      tags?: string;
      order?: number;
      timeout?: number;
      name?: string;
    } = {
      name: `${target.constructor.name}.${propertyKey}`
    };
    
    if (options?.tags !== undefined) {
      registerOptions.tags = options.tags;
    }
    if (options?.order !== undefined) {
      registerOptions.order = options.order;
    }
    if (options?.timeout !== undefined) {
      registerOptions.timeout = options.timeout;
    }
    
    stepRegistry.registerHook(HookType.BeforeStep, descriptor.value, registerOptions);
    Logger.getInstance().debug(`Registered BeforeStep hook: ${hook.location}`);
  };
}

/**
 * Decorator for marking methods as AfterStep hooks
 */
export function AfterStep(options?: { tags?: string; order?: number; timeout?: number }) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const hook = {
      type: HookType.AfterStep,
      method: descriptor.value,
      methodName: String(propertyKey),
      className: target.constructor.name,
      tags: options?.tags,
      order: options?.order || 0,
      timeout: options?.timeout,
      location: `${target.constructor.name}.${propertyKey}`
    };
    
    const registerOptions: {
      tags?: string;
      order?: number;
      timeout?: number;
      name?: string;
    } = {
      name: `${target.constructor.name}.${propertyKey}`
    };
    
    if (options?.tags !== undefined) {
      registerOptions.tags = options.tags;
    }
    if (options?.order !== undefined) {
      registerOptions.order = options.order;
    }
    if (options?.timeout !== undefined) {
      registerOptions.timeout = options.timeout;
    }
    
    stepRegistry.registerHook(HookType.AfterStep, descriptor.value, registerOptions);
    Logger.getInstance().debug(`Registered AfterStep hook: ${hook.location}`);
  };
}

/**
 * Decorator for marking a class as containing step definitions
 * Automatically instantiates the class
 */
export function StepDefinitions(target: any) {
  console.log(`🔍 DEBUG: StepDefinitions decorator called for class: ${target.name}`);
  
  // Create instance of the class to trigger decorator registration
  // This ensures all decorated methods are registered
  console.log(`🔍 DEBUG: Creating instance of ${target.name}`);
  const instance = new target();
  console.log(`🔍 DEBUG: Instance created for ${target.name}`);
  
  // Store the instance in the step registry for later use
  stepRegistry.registerClassInstance(target.name, instance);
  console.log(`🔍 DEBUG: Class instance registered for ${target.name}`);
  
  // Log class registration
  Logger.getInstance().debug(`Registered step definition class: ${target.name}`);
  ActionLogger.logStepDefinitionLoading('class_registered', {
    className: target.name
  });
  
  console.log(`🔍 DEBUG: StepDefinitions decorator completed for ${target.name}`);
  return target;
}

// Helper function to check if a function is async
function isAsyncFunction(fn: Function): boolean {
  return fn.constructor.name === 'AsyncFunction' || 
         (fn.toString().includes('async') && fn.toString().includes('await'));
}

// Re-export commonly used together
export { stepRegistry } from './StepRegistry';
export { ParameterTypeRegistry } from './ParameterTypeRegistry';