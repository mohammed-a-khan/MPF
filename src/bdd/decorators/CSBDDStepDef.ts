import { stepRegistry } from './StepRegistry';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { HookType } from '../types/bdd.types';

export interface StepDefinitionOptions {
  timeout?: number;
  wrapperOptions?: any;
  retry?: number;
}

export function CSBDDStepDef(pattern: string | RegExp, options?: StepDefinitionOptions) {
  return function (target: any, propertyKey: string, methodDescriptor: PropertyDescriptor) {
    console.log(`🔍 DEBUG: CSBDDStepDef decorator called for method: ${propertyKey} in class: ${target.constructor.name}`);
    
    const originalMethod = methodDescriptor.value;
    
    const filePath = target.constructor.filePath || 'unknown';
    const line = target.constructor.line || 0;
    
    const stepDefinition = {
      pattern,
      implementation: originalMethod,
      location: `${filePath}:${line}`,
      options
    };
    
    const metadata = {
      file: filePath,
      line,
      timeout: options?.timeout,
      retry: options?.retry,
      wrapperOptions: options?.wrapperOptions,
      className: target.constructor.name
    };
    
    stepRegistry.registerStep(pattern, originalMethod, metadata);
    console.log(`🔍 DEBUG: Step registered successfully: ${pattern.toString()} for class: ${target.constructor.name}`);
    
    Logger.getInstance().debug(`Registered step definition: ${pattern.toString()} -> ${stepDefinition.location}`);
    
    
    
    return methodDescriptor;
  };
}

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

export function StepDefinitions(target: any) {
  console.log(`🔍 DEBUG: StepDefinitions decorator called for class: ${target.name}`);
  
  console.log(`🔍 DEBUG: Creating instance of ${target.name}`);
  const instance = new target();
  console.log(`🔍 DEBUG: Instance created for ${target.name}`);
  
  stepRegistry.registerClassInstance(target.name, instance);
  console.log(`🔍 DEBUG: Class instance registered for ${target.name}`);
  
  Logger.getInstance().debug(`Registered step definition class: ${target.name}`);
  ActionLogger.logStepDefinitionLoading('class_registered', {
    className: target.name
  });
  
  console.log(`🔍 DEBUG: StepDefinitions decorator completed for ${target.name}`);
  return target;
}

function isAsyncFunction(fn: Function): boolean {
  return fn.constructor.name === 'AsyncFunction' || 
         (fn.toString().includes('async') && fn.toString().includes('await'));
}

export { stepRegistry } from './StepRegistry';
export { ParameterTypeRegistry } from './ParameterTypeRegistry';
export { PageObject, Page } from '../decorators/Page';
