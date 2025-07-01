// src/reporting/exporters/XMLExporter.ts

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { Readable } from 'stream';
import { promisify } from 'util';
import { ExportResult, ExportOptions, ExecutionResult, ExportFormat, TestStatus } from '../types/reporting.types';
import { ExecutionStatus } from '../../bdd/types/bdd.types';
import { FileUtils } from '../../core/utils/FileUtils';

const gzip = promisify(zlib.gzip);

interface XMLExportOptions extends ExportOptions {
  xmlFormat?: 'junit' | 'testng' | 'nunit' | 'xunit' | 'trx' | 'custom';
  pretty?: boolean;
  includeSystemOut?: boolean;
  includeSystemErr?: boolean;
  includeProperties?: boolean;
  includeAttachments?: boolean;
  customTemplate?: string;
  encoding?: BufferEncoding;
  standalone?: boolean;
  compress?: boolean;
  streaming?: boolean;
  escapeInvalidChars?: boolean;
}

interface XMLElement {
  name: string;
  attributes?: Record<string, string | number | boolean>;
  text?: string;
  children?: XMLElement[];
  cdata?: string;
  comment?: string;
}

interface Logger {
  info(message: string, data?: any): void;
  error(message: string, error?: Error): void;
}

const createLogger = (name: string): Logger => ({
  info: (message: string, data?: any) => console.log(`[${name}] INFO:`, message, data),
  error: (message: string, error?: Error) => console.error(`[${name}] ERROR:`, message, error)
});

interface ScenarioScreenshot {
  name?: string;
  path: string;
}

export class XMLExporter {
  private logger: Logger = createLogger('XMLExporter');
  private indentLevel = 0;
  private readonly indentSize = 2;
  private readonly xmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;'
  };

  async export(
    result: ExecutionResult,
    outputPath: string,
    options: XMLExportOptions = { format: ExportFormat.XML }
  ): Promise<ExportResult> {
    const startTime = Date.now();

    try {
      this.logger.info('Starting XML export', { outputPath, options });

      await FileUtils.ensureDir(path.dirname(outputPath));

      const xmlContent = await this.generateXML(result, options);

      let fileSize: number;
      let finalPath = outputPath;

      if (options.compress) {
        const compressed = await gzip(Buffer.from(xmlContent, options.encoding || 'utf8'));
        finalPath = outputPath + '.gz';
        await fs.promises.writeFile(finalPath, compressed);
        fileSize = compressed.length;
      } else {
        const buffer = Buffer.from(xmlContent, options.encoding || 'utf8');
        await fs.promises.writeFile(outputPath, buffer);
        fileSize = buffer.length;
      }

      const exportTime = Date.now() - startTime;

      this.logger.info('XML export completed', {
        exportTime,
        fileSize,
        format: options.format || 'junit',
        compressed: options.compress || false
      });

      return {
        success: true,
        filePath: finalPath,
        format: ExportFormat.XML,
        duration: exportTime,
        size: fileSize,
        metadata: {
          xmlFormat: options.xmlFormat || 'junit',
          encoding: options.encoding || 'utf8',
          compressed: options.compress || false,
          pretty: options.pretty !== false
        }
      };

    } catch (error) {
      this.logger.error('XML export failed', error as Error);
      return {
        success: false,
        filePath: outputPath,
        format: ExportFormat.XML,
        duration: Date.now() - startTime,
        error: (error as Error).message
      };
    }
  }

  private async generateXML(
    result: ExecutionResult,
    options: XMLExportOptions
  ): Promise<string> {
    const xmlDeclaration = `<?xml version="1.0" encoding="${options.encoding || 'UTF-8'}"${options.standalone ? ' standalone="yes"' : ''
      }?>`;

    let rootElement: XMLElement;

    switch (options.xmlFormat) {
      case 'testng':
        rootElement = this.generateTestNG(result);
        break;
      case 'nunit':
        rootElement = this.generateNUnit(result, options);
        break;
      case 'xunit':
        rootElement = this.generateXUnit(result);
        break;
      case 'trx':
        rootElement = this.generateTRX(result);
        break;
      case 'custom':
        if (!options.customTemplate) {
          throw new Error('Custom template is required for custom format');
        }
        rootElement = await this.generateCustom(result, options);
        break;
      default:
        rootElement = this.generateJUnit(result, options);
    }

    const xmlBody = this.elementToXML(rootElement, options.pretty !== false);
    return xmlDeclaration + '\n' + xmlBody;
  }

  private generateJUnit(
    result: ExecutionResult,
    options: XMLExportOptions
  ): XMLElement {
    const testsuites: XMLElement = {
      name: 'testsuites',
      attributes: {
        name: 'CS Test Automation',
        tests: result.totalScenarios,
        failures: result.failedScenarios,
        errors: 0,
        skipped: result.skippedScenarios,
        time: (result.duration / 1000).toFixed(3),
        timestamp: new Date(result.startTime).toISOString()
      },
      children: []
    };

    if (options.includeProperties && result.metadata) {
      const properties: XMLElement = {
        name: 'properties',
        children: Object.entries(result.metadata).map(([propertyKey, value]) => ({
          name: 'property',
          attributes: {
            name: propertyKey,
            value: String(value)
          }
        }))
      };

      if (properties.children && properties.children.length > 0) {
        testsuites.children!.push(properties);
      }
    }

    result.features.forEach(feature => {
      const testsuite: XMLElement = {
        name: 'testsuite',
        attributes: {
          name: feature.name || feature.feature,
          tests: feature.scenarios.length,
          failures: feature.scenarios.filter(s => s.status === 'failed').length,
          errors: 0,
          skipped: feature.scenarios.filter(s => s.status === 'skipped').length,
          time: (feature.scenarios.reduce((sum, s) => sum + s.duration, 0) / 1000).toFixed(3),
          timestamp: new Date(feature.scenarios[0]?.startTime || result.startTime).toISOString(),
          hostname: require('os').hostname(),
          id: feature.featureId || (feature.name || feature.feature).toLowerCase().replace(/\s+/g, '-'),
          'package': feature.metadata?.['package'] || feature.uri?.split('/').slice(0, -1).join('.') || ''
        },
        children: []
      };

      if (options.includeProperties && feature.tags && feature.tags.length > 0) {
        const properties: XMLElement = {
          name: 'properties',
          children: feature.tags.map(tag => ({
            name: 'property',
            attributes: {
              name: 'tag',
              value: tag
            }
          }))
        };
        testsuite.children!.push(properties);
      }

      feature.scenarios.forEach(scenario => {
        const testcase: XMLElement = {
          name: 'testcase',
          attributes: {
            name: scenario.name,
            classname: (feature.name || feature.feature).replace(/\s+/g, '.'),
            time: (scenario.duration / 1000).toFixed(3),
            ...(scenario.line && { line: scenario.line })
          },
          children: []
        };

        if (scenario.status === TestStatus.FAILED && scenario.error) {
          const failure: XMLElement = {
            name: 'failure',
            attributes: {
              message: this.escapeXML(scenario.error),
              type: 'AssertionError'
            },
            ...((scenario.errorStack || scenario.errorDetails)
              ? { cdata: scenario.errorStack || scenario.errorDetails || '' }
              : { text: this.escapeXML(scenario.error) })
          };

          testcase.children!.push(failure);
        }

        if (scenario.status === TestStatus.FAILED && scenario.error) {
          const error: XMLElement = {
            name: 'error',
            attributes: {
              message: this.escapeXML(scenario.error),
              type: 'Error'
            },
            ...(scenario.errorStack
              ? { cdata: scenario.errorStack }
              : { text: this.escapeXML(scenario.error) })
          };

          testcase.children!.push(error);
        }

        if (scenario.status === TestStatus.SKIPPED) {
          const skipped: XMLElement = {
            name: 'skipped',
            attributes: scenario.description
              ? { message: this.escapeXML(scenario.description) }
              : {}
          };

          testcase.children!.push(skipped);
        }

        if (options.includeSystemErr && scenario.errorStack) {
          const systemErr: XMLElement = {
            name: 'system-err',
            cdata: scenario.errorStack
          };
          testcase.children!.push(systemErr);
        }

        if (options.includeAttachments && scenario.screenshots && scenario.screenshots.length > 0) {
          scenario.screenshots.forEach((screenshot: ScenarioScreenshot, index: number) => {
            testcase.children!.push({
              name: 'property',
              attributes: {
                name: `screenshot-${index}`,
                value: `image/png:${screenshot.path}`
              }
            });
          });
        }

        testsuite.children!.push(testcase);
      });

      testsuites.children!.push(testsuite);
    });

    return testsuites;
  }

  private generateTestNG(
    result: ExecutionResult
  ): XMLElement {
    const testngResults: XMLElement = {
      name: 'testng-results',
      attributes: {
        version: '1.0',
        ignored: result.skippedScenarios,
        total: result.totalScenarios,
        passed: result.passedScenarios,
        failed: result.failedScenarios,
        skipped: result.skippedScenarios
      },
      children: []
    };

    const reporterOutput: XMLElement = {
      name: 'reporter-output',
      children: []
    };

    testngResults.children!.push(reporterOutput);

    const suite: XMLElement = {
      name: 'suite',
      attributes: {
        name: 'CS Test Automation Suite',
        'started-at': new Date(result.startTime).toISOString(),
        'finished-at': new Date(result.endTime).toISOString(),
        'duration-ms': result.duration
      },
      children: []
    };

    result.features.forEach(feature => {
      const test: XMLElement = {
        name: 'test',
        attributes: {
          name: feature.name || feature.feature,
          'started-at': new Date(feature.scenarios[0]?.startTime || result.startTime).toISOString(),
          'finished-at': new Date(
            feature.scenarios[feature.scenarios.length - 1]?.endTime || result.endTime
          ).toISOString(),
          'duration-ms': feature.scenarios.reduce((sum, s) => sum + s.duration, 0)
        },
        children: []
      };

      const testClass: XMLElement = {
        name: 'class',
        attributes: {
          name: `com.cs.test.${(feature.name || feature.feature).replace(/\s+/g, '.')}`
        },
        children: []
      };

      feature.scenarios.forEach(scenario => {
        const testMethod: XMLElement = {
          name: 'test-method',
          attributes: {
            signature: `${scenario.name.replace(/\s+/g, '_')}()`,
            name: scenario.name.replace(/\s+/g, '_'),
            'started-at': scenario.startTime ? new Date(scenario.startTime).toISOString() : new Date().toISOString(),
            'finished-at': scenario.endTime ? new Date(scenario.endTime).toISOString() : new Date().toISOString(),
            'duration-ms': scenario.duration,
            status: scenario.status === TestStatus.PASSED ? 'PASSED' : scenario.status === TestStatus.FAILED ? 'FAILED' : scenario.status === TestStatus.SKIPPED ? 'SKIPPED' : 'UNKNOWN',
            'data-provider': scenario.parameters ? 'DataProvider' : '',
            description: scenario.description || scenario.name,
            'is-config': 'false'
          },
          children: []
        };

        if (scenario.parameters && Object.keys(scenario.parameters).length > 0) {
          const params: XMLElement = {
            name: 'params',
            children: Object.entries(scenario.parameters).map(([, value], index) => ({
              name: 'param',
              attributes: { index: String(index) },
              children: [{
                name: 'value',
                cdata: String(value)
              }]
            }))
          };
          testMethod.children!.push(params);
        }

        if (scenario.tags && scenario.tags.length > 0) {
          const groups: XMLElement = {
            name: 'groups',
            children: scenario.tags.map(tag => ({
              name: 'group',
              attributes: { name: tag }
            }))
          };
          testMethod.children!.push(groups);
        }

        if (scenario.status === TestStatus.FAILED && scenario.error) {
          const exception: XMLElement = {
            name: 'exception',
            attributes: {
              class: 'java.lang.AssertionError'
            },
            children: [
              {
                name: 'message',
                cdata: scenario.error
              }
            ]
          };

          if (scenario.errorStack) {
            exception.children!.push({
              name: 'full-stacktrace',
              cdata: scenario.errorStack
            });
          }

          testMethod.children!.push(exception);
        }

        testClass.children!.push(testMethod);
      });

      test.children!.push(testClass);
      suite.children!.push(test);
    });

    testngResults.children!.push(suite);
    return testngResults;
  }

  private generateNUnit(
    result: ExecutionResult,
    options: XMLExportOptions
  ): XMLElement {
    const testRun: XMLElement = {
      name: 'test-run',
      attributes: {
        id: result.executionId,
        name: 'CS Test Automation Run',
        fullname: 'CS Test Automation Framework',
        testcasecount: result.totalScenarios,
        result: result.failedScenarios > 0 ? 'Failed' : 'Passed',
        'start-time': new Date(result.startTime).toISOString(),
        'end-time': new Date(result.endTime).toISOString(),
        duration: (result.duration / 1000).toFixed(3),
        total: result.totalScenarios,
        passed: result.passedScenarios,
        failed: result.failedScenarios,
        inconclusive: 0,
        skipped: result.skippedScenarios,
        warnings: 0,
        asserts: result.totalSteps || 0
      },
      children: []
    };

    testRun.children!.push({
      name: 'filter',
      children: []
    });

    const testSuite: XMLElement = {
      name: 'test-suite',
      attributes: {
        type: 'Assembly',
        id: '0-1',
        name: 'CS.Test.Automation.dll',
        fullname: path.resolve(process.cwd(), 'CS.Test.Automation.dll'),
        runstate: 'Runnable',
        testcasecount: result.totalScenarios,
        result: result.failedScenarios > 0 ? 'Failed' : 'Passed',
        'start-time': new Date(result.startTime).toISOString(),
        'end-time': new Date(result.endTime).toISOString(),
        duration: (result.duration / 1000).toFixed(3),
        total: result.totalScenarios,
        passed: result.passedScenarios,
        failed: result.failedScenarios,
        warnings: 0,
        inconclusive: 0,
        skipped: result.skippedScenarios,
        asserts: result.totalSteps || 0
      },
      children: []
    };

    const environment: XMLElement = {
      name: 'environment',
      attributes: {
        framework: 'CS Test Automation 1.0.0',
        clr: process.version,
        os: `${process.platform} ${require('os').release()}`,
        platform: process.arch,
        cwd: process.cwd(),
        'machine-name': require('os').hostname(),
        user: require('os').userInfo().username,
        'user-domain': require('os').hostname(),
        culture: process.env['LANG'] || 'en-US',
        uiculture: process.env['LANG'] || 'en-US',
        'os-version': require('os').release()
      }
    };
    testSuite.children!.push(environment);

    if (result.metadata && Object.keys(result.metadata).length > 0) {
      const settings: XMLElement = {
        name: 'settings',
        children: Object.entries(result.metadata).map(([settingKey, value]) => ({
          name: 'setting',
          attributes: {
            name: settingKey,
            value: String(value)
          }
        }))
      };
      testSuite.children!.push(settings);
    }

    if (options.includeProperties) {
      const properties: XMLElement = {
        name: 'properties',
        children: [
          {
            name: 'property',
            attributes: {
              name: '_PID',
              value: String(process.pid)
            }
          },
          {
            name: 'property',
            attributes: {
              name: '_APPDOMAIN',
              value: 'CS Test Automation'
            }
          }
        ]
      };
      testSuite.children!.push(properties);
    }

    if (result.failedScenarios > 0) {
      const failureMessages = new Set<string>();
      const stackTraces = new Set<string>();

      result.features.forEach(feature => {
        feature.scenarios.forEach(scenario => {
          if (scenario.status === TestStatus.FAILED && scenario.error) {
            failureMessages.add(scenario.error);
            if (scenario.errorStack) {
              stackTraces.add(scenario.errorStack);
            }
          }
        });
      });

      const failure: XMLElement = {
        name: 'failure',
        children: [
          {
            name: 'message',
            cdata: Array.from(failureMessages).join('\n\n')
          }
        ]
      };

      if (stackTraces.size > 0) {
        failure.children!.push({
          name: 'stack-trace',
          cdata: Array.from(stackTraces).join('\n\n')
        });
      }

      testSuite.children!.push(failure);
    }

    result.features.forEach((feature, featureIndex) => {
      const testFixture: XMLElement = {
        name: 'test-suite',
        attributes: {
          type: 'TestFixture',
          id: `0-${1000 + featureIndex}`,
          name: feature.name || feature.feature,
          fullname: `CS.Test.Automation.${(feature.name || feature.feature).replace(/\s+/g, '.')}`,
          classname: `CS.Test.Automation.${(feature.name || feature.feature).replace(/\s+/g, '.')}`,
          runstate: 'Runnable',
          testcasecount: feature.scenarios.length,
          result: feature.scenarios.some(s => s.status === 'failed') ? 'Failed' :
            feature.scenarios.every(s => s.status === 'passed') ? 'Passed' : 'Skipped',
          'start-time': new Date(feature.scenarios[0]?.startTime || result.startTime).toISOString(),
          'end-time': new Date(
            feature.scenarios[feature.scenarios.length - 1]?.endTime || result.endTime
          ).toISOString(),
          duration: (feature.scenarios.reduce((sum, s) => sum + s.duration, 0) / 1000).toFixed(3),
          total: feature.scenarios.length,
          passed: feature.scenarios.filter(s => s.status === 'passed').length,
          failed: feature.scenarios.filter(s => s.status === 'failed').length,
          warnings: 0,
          inconclusive: 0,
          skipped: feature.scenarios.filter(s => s.status === 'skipped').length,
          asserts: feature.scenarios.reduce((sum, s) => sum + (s.steps?.length || 0), 0)
        },
        children: []
      };

      feature.scenarios.forEach((scenario, scenarioIndex) => {
        const testCase: XMLElement = {
          name: 'test-case',
          attributes: {
            id: `0-${1000 + featureIndex}${scenarioIndex}`,
            name: scenario.name,
            fullname: `CS.Test.Automation.${(feature.name || feature.feature).replace(/\s+/g, '.')}.${scenario.name.replace(/\s+/g, '_')}`,
            methodname: scenario.name.replace(/\s+/g, '_'),
            classname: `CS.Test.Automation.${(feature.name || feature.feature).replace(/\s+/g, '.')}`,
            runstate: 'Runnable',
            seed: String(Math.floor(Math.random() * 2147483647)),
            result: scenario.status === TestStatus.PASSED ? 'Passed' :
              scenario.status === TestStatus.FAILED ? 'Failed' : 'Skipped',
            label: scenario.tags?.join(',') || '',
            'start-time': scenario.startTime ? new Date(scenario.startTime).toISOString() : new Date().toISOString(),
            'end-time': scenario.endTime ? new Date(scenario.endTime).toISOString() : new Date().toISOString(),
            duration: (scenario.duration / 1000).toFixed(3),
            asserts: scenario.steps?.length || 0
          },
          children: []
        };

        if (scenario.parameters && Object.keys(scenario.parameters).length > 0) {
          const properties: XMLElement = {
            name: 'properties',
            children: Object.entries(scenario.parameters).map(([paramKey, value]) => ({
              name: 'property',
              attributes: {
                name: paramKey,
                value: String(value)
              }
            }))
          };
          testCase.children!.push(properties);
        }

        if (scenario.status === TestStatus.FAILED && scenario.error) {
          const failure: XMLElement = {
            name: 'failure',
            children: [
              {
                name: 'message',
                cdata: scenario.error
              }
            ]
          };

          if (scenario.errorStack) {
            failure.children!.push({
              name: 'stack-trace',
              cdata: scenario.errorStack
            });
          }

          testCase.children!.push(failure);
        }

        if (scenario.status === TestStatus.SKIPPED) {
          const reason: XMLElement = {
            name: 'reason',
            children: [{
              name: 'message',
              cdata: scenario.description || 'Test was skipped'
            }]
          };
          testCase.children!.push(reason);
        }

        const assertions: XMLElement = {
          name: 'assertions',
          children: (scenario.steps || []).map((step) => ({
            name: 'assertion',
            attributes: {
              result: step.status === 'passed' ? 'Passed' :
                step.status === 'failed' ? 'Failed' : 'Skipped',
              message: `${step.keyword} ${step.text}`
            },
            ...(step.error && {
              children: [{
                name: 'stack-trace',
                cdata: step.errorStack || step.error
              }]
            })
          }))
        };

        if (assertions.children && assertions.children.length > 0) {
          testCase.children!.push(assertions);
        }

        if (options.includeAttachments && scenario.screenshots && scenario.screenshots.length > 0) {
          const attachments: XMLElement = {
            name: 'attachments',
            children: scenario.screenshots.map((att: ScenarioScreenshot) => ({
              name: 'attachment',
              children: [
                {
                  name: 'filePath',
                  cdata: att.path
                },
                {
                  name: 'description',
                  cdata: att.name || 'Screenshot'
                }
              ]
            }))
          };
          testCase.children!.push(attachments);
        }

        testFixture.children!.push(testCase);
      });

      testSuite.children!.push(testFixture);
    });

    testRun.children!.push(testSuite);
    return testRun;
  }

  private generateXUnit(
    result: ExecutionResult
  ): XMLElement {
    const assemblies: XMLElement = {
      name: 'assemblies',
      attributes: {
        timestamp: new Date(result.startTime).toISOString()
      },
      children: []
    };

    const assembly: XMLElement = {
      name: 'assembly',
      attributes: {
        name: 'CS.Test.Automation.dll',
        environment: result.environment,
        'test-framework': 'CS Test Framework',
        'run-date': new Date(result.startTime).toISOString().split('T')[0] || '',
        'run-time': new Date(result.startTime).toISOString().split('T')[1]?.split('.')[0] || '',
        'config-file': path.resolve(process.cwd(), 'test.config'),
        time: (result.duration / 1000).toFixed(3),
        total: result.totalScenarios,
        passed: result.passedScenarios,
        failed: result.failedScenarios,
        skipped: result.skippedScenarios,
        errors: 0
      },
      children: []
    };

    assembly.children!.push({
      name: 'errors',
      children: []
    });

    result.features.forEach(feature => {
      const collection: XMLElement = {
        name: 'collection',
        attributes: {
          name: `Test collection for ${feature.name || feature.feature}`,
          time: (feature.scenarios.reduce((sum, s) => sum + s.duration, 0) / 1000).toFixed(3),
          total: feature.scenarios.length,
          passed: feature.scenarios.filter(s => s.status === 'passed').length,
          failed: feature.scenarios.filter(s => s.status === 'failed').length,
          skipped: feature.scenarios.filter(s => s.status === 'skipped').length
        },
        children: []
      };

      feature.scenarios.forEach(scenario => {
        const test: XMLElement = {
          name: 'test',
          attributes: {
            name: scenario.name,
            type: `CS.Test.Automation.${(feature.name || feature.feature).replace(/\s+/g, '.')}`,
            method: scenario.name.replace(/\s+/g, '_'),
            time: (scenario.duration / 1000).toFixed(3),
            result: scenario.status === TestStatus.PASSED ? 'Pass' :
              scenario.status === TestStatus.FAILED ? 'Fail' : 'Skip'
          },
          children: []
        };

        if (scenario.tags && scenario.tags.length > 0) {
          const traits: XMLElement = {
            name: 'traits',
            children: scenario.tags.map(tag => ({
              name: 'trait',
              attributes: {
                name: 'Category',
                value: tag
              }
            }))
          };
          test.children!.push(traits);
        }

        if (scenario.status === TestStatus.FAILED && scenario.error) {
          const failure: XMLElement = {
            name: 'failure',
            attributes: {
              'exception-type': 'System.Exception'
            },
            children: [
              {
                name: 'message',
                cdata: scenario.error
              }
            ]
          };

          if (scenario.errorStack) {
            failure.children!.push({
              name: 'stack-trace',
              cdata: scenario.errorStack
            });
          }

          test.children!.push(failure);
        }

        if (scenario.status === TestStatus.SKIPPED) {
          const reason: XMLElement = {
            name: 'reason',
            cdata: scenario.description || 'Test was skipped'
          };
          test.children!.push(reason);
        }

        collection.children!.push(test);
      });

      assembly.children!.push(collection);
    });

    assemblies.children!.push(assembly);
    return assemblies;
  }

  private generateTRX(
    result: ExecutionResult
  ): XMLElement {
    const testRunId = result.executionId || this.generateGuid();
    const testListId = this.generateGuid();

    const testRun: XMLElement = {
      name: 'TestRun',
      attributes: {
        id: testRunId,
        name: `CS Test Automation @ ${new Date(result.startTime).toISOString()}`,
        runUser: require('os').userInfo().username,
        xmlns: 'http://microsoft.com/schemas/VisualStudio/TeamTest/2010'
      },
      children: []
    };

    const testSettings: XMLElement = {
      name: 'TestSettings',
      attributes: {
        name: 'Default Test Settings',
        id: this.generateGuid()
      },
      children: [
        {
          name: 'Description',
          text: 'CS Test Automation Framework execution'
        },
        {
          name: 'Deployment',
          attributes: {
            runDeploymentRoot: path.resolve(process.cwd(), 'TestResults', testRunId)
          }
        }
      ]
    };
    testRun.children!.push(testSettings);

    const times: XMLElement = {
      name: 'Times',
      attributes: {
        creation: new Date(result.startTime).toISOString(),
        queuing: new Date(result.startTime).toISOString(),
        start: new Date(result.startTime).toISOString(),
        finish: new Date(result.endTime).toISOString()
      }
    };
    testRun.children!.push(times);

    const resultSummary: XMLElement = {
      name: 'ResultSummary',
      attributes: {
        outcome: result.failedScenarios > 0 ? 'Failed' : 'Completed'
      },
      children: [
        {
          name: 'Counters',
          attributes: {
            total: result.totalScenarios,
            executed: result.totalScenarios - result.skippedScenarios,
            passed: result.passedScenarios,
            failed: result.failedScenarios,
            error: 0,
            timeout: 0,
            aborted: 0,
            inconclusive: 0,
            passedButRunAborted: 0,
            notRunnable: 0,
            notExecuted: result.skippedScenarios,
            disconnected: 0,
            warning: 0,
            completed: result.passedScenarios + result.failedScenarios,
            inProgress: 0,
            pending: 0
          }
        }
      ]
    };

    if (result.failedScenarios > 0) {
      const runInfos: XMLElement = {
        name: 'RunInfos',
        children: []
      };

      const errorMessages = new Set<string>();
      result.features.forEach(feature => {
        feature.scenarios.forEach(scenario => {
          if (scenario.status === TestStatus.FAILED && scenario.error) {
            errorMessages.add(scenario.error);
          }
        });
      });

      errorMessages.forEach(message => {
        runInfos.children!.push({
          name: 'RunInfo',
          attributes: {
            computerName: require('os').hostname(),
            outcome: 'Error',
            timestamp: new Date().toISOString()
          },
          children: [
            {
              name: 'Text',
              text: message
            }
          ]
        });
      });

      if (runInfos.children!.length > 0) {
        resultSummary.children!.push(runInfos);
      }
    }

    testRun.children!.push(resultSummary);

    const testDefinitions: XMLElement = {
      name: 'TestDefinitions',
      children: []
    };

    const unitTestDefinitions: { id: string; scenario: any; feature: any }[] = [];

    result.features.forEach(feature => {
      feature.scenarios.forEach(scenario => {
        const testId = this.generateGuid();
        unitTestDefinitions.push({ id: testId, scenario, feature });

        testDefinitions.children!.push({
          name: 'UnitTest',
          attributes: {
            name: scenario.name,
            storage: path.resolve(process.cwd(), 'CS.Test.Automation.dll'),
            id: testId
          },
          children: [
            {
              name: 'Execution',
              attributes: {
                id: this.generateGuid()
              }
            },
            {
              name: 'TestMethod',
              attributes: {
                codeBase: 'CS.Test.Automation.dll',
                adapterTypeName: 'CS.Test.Automation.Adapter',
                className: `CS.Test.Automation.${(feature.name || feature.feature).replace(/\s+/g, '.')}`,
                name: scenario.name.replace(/\s+/g, '_')
              }
            }
          ]
        });
      });
    });

    testRun.children!.push(testDefinitions);

    const testLists: XMLElement = {
      name: 'TestLists',
      children: [
        {
          name: 'TestList',
          attributes: {
            name: 'Results Not in a List',
            id: this.generateGuid()
          }
        },
        {
          name: 'TestList',
          attributes: {
            name: 'All Loaded Results',
            id: testListId
          }
        }
      ]
    };
    testRun.children!.push(testLists);

    const testEntries: XMLElement = {
      name: 'TestEntries',
      children: unitTestDefinitions.map(def => ({
        name: 'TestEntry',
        attributes: {
          testId: def.id,
          executionId: this.generateGuid(),
          testListId: testListId
        }
      }))
    };
    testRun.children!.push(testEntries);

    const results: XMLElement = {
      name: 'Results',
      children: []
    };

    unitTestDefinitions.forEach(def => {
      const scenario = def.scenario;
      const executionId = this.generateGuid();

      const unitTestResult: XMLElement = {
        name: 'UnitTestResult',
        attributes: {
          executionId: executionId,
          testId: def.id,
          testName: scenario.name,
          computerName: require('os').hostname(),
          duration: this.formatDuration(scenario.duration),
          startTime: new Date(scenario.startTime).toISOString(),
          endTime: new Date(scenario.endTime).toISOString(),
          testType: '13cdc9d9-ddb5-4fa4-a97d-d965ccfc6d4b',
          outcome: scenario.status === TestStatus.PASSED ? 'Passed' :
            scenario.status === TestStatus.FAILED ? 'Failed' : 'NotExecuted',
          testListId: testListId,
          relativeResultsDirectory: executionId
        },
        children: []
      };

      const output: XMLElement = {
        name: 'Output',
        children: []
      };

      if (scenario.status === TestStatus.FAILED && scenario.error) {
        output.children!.push({
          name: 'ErrorInfo',
          children: [
            {
              name: 'Message',
              text: scenario.error
            },
            ...(scenario.errorStack ? [{
              name: 'StackTrace',
              text: scenario.errorStack
            }] : [])
          ]
        });
      }

      if (output.children!.length > 0) {
        unitTestResult.children!.push(output);
      }

      if (scenario.screenshots && scenario.screenshots.length > 0) {
        const resultFiles: XMLElement = {
          name: 'ResultFiles',
          children: scenario.screenshots.map((att: ScenarioScreenshot) => ({
            name: 'ResultFile',
            attributes: {
              path: att.path
            }
          }))
        };
        unitTestResult.children!.push(resultFiles);
      }

      results.children!.push(unitTestResult);
    });

    testRun.children!.push(results);

    return testRun;
  }

  private async generateCustom(
    result: ExecutionResult,
    options: XMLExportOptions
  ): Promise<XMLElement> {
    if (!options.customTemplate) {
      throw new Error('Custom template is required for custom format');
    }

    try {
      const template = await fs.promises.readFile(options.customTemplate, 'utf8');
      return this.processTemplate(template, result);
    } catch (error) {
      this.logger.error('Failed to process custom template', error as Error);
      throw new Error(`Failed to process custom template: ${(error as Error).message}`);
    }
  }

  private processTemplate(template: string, data: any): XMLElement {

    const processValue = (tmpl: string, context: any): string => {
      tmpl = tmpl.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
        const value = this.resolvePath(context, path.trim());
        return value !== undefined ? String(value) : '';
      });

      tmpl = tmpl.replace(
        /\{\{#each\s+(\S+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
        (_, collectionPath, loopContent) => {
          const collection = this.resolvePath(context, collectionPath);
          if (Array.isArray(collection)) {
            return collection.map((item, index) => {
              const loopContext = {
                ...context,
                this: item,
                '@index': index,
                '@first': index === 0,
                '@last': index === collection.length - 1
              };
              return processValue(loopContent, loopContext);
            }).join('');
          }
          return '';
        }
      );

      tmpl = tmpl.replace(
        /\{\{#if\s+([^}]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
        (_, condition, truthy, falsy = '') => {
          const value = this.resolvePath(context, condition.trim());
          return value ? processValue(truthy, context) : processValue(falsy, context);
        }
      );

      tmpl = tmpl.replace(
        /\{\{#unless\s+([^}]+)\}\}([\s\S]*?)\{\{\/unless\}\}/g,
        (_, condition, content) => {
          const value = this.resolvePath(context, condition.trim());
          return !value ? processValue(content, context) : '';
        }
      );

      return tmpl;
    };

    const xmlString = processValue(template, data);
    return this.parseTemplateResult(xmlString);
  }

  private resolvePath(obj: any, path: string): any {
    if (path === 'this') return obj;
    if (path.startsWith('@')) return obj[path];

    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }

      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, prop, index] = arrayMatch;
        if (prop && index) {
          current = current[prop]?.[parseInt(index)];
        }
      } else {
        current = current[part];
      }
    }

    return current;
  }

  private parseTemplateResult(xmlString: string): XMLElement {
    try {
      const stack: Array<{ element: XMLElement; tagName: string }> = [];
      let current: XMLElement | null = null;
      let root: XMLElement | null = null;

      const lines = xmlString.trim().split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.match(/^<\w+[^>]*\/>$/)) {
          const tagMatch = trimmed.match(/^<(\w+)([^>]*)\/>$/);
          if (tagMatch) {
            const tagName = tagMatch[1];
            const attrsString = tagMatch[2];

            if (tagName) {
              const element: XMLElement = {
                name: tagName,
                attributes: this.parseAttributes(attrsString || '')
              };

              if (current) {
                if (!current.children) current.children = [];
                current.children.push(element);
              } else {
                root = element;
              }
            }
          }
          continue;
        }

        if (trimmed.match(/^<\w+[^>]*>[^<]*$/)) {
          const openMatch = trimmed.match(/^<(\w+)([^>]*)>(.*)$/);
          if (openMatch) {
            const tagName = openMatch[1];
            const attrsString = openMatch[2];
            const content = openMatch[3];

            if (tagName) {
              const element: XMLElement = {
                name: tagName,
                attributes: this.parseAttributes(attrsString || '')
              };

              if (content && content.includes(`</${tagName}>`)) {
                const textContent = content.replace(new RegExp(`</${tagName}>.*$`), '');
                if (textContent) {
                  if (textContent.includes('<![CDATA[')) {
                    element.cdata = textContent.replace(/<!\[CDATA\[(.*)\]\]>/, '$1');
                  } else {
                    element.text = textContent;
                  }
                }

                if (current) {
                  if (!current.children) current.children = [];
                  current.children.push(element);
                } else {
                  root = element;
                }
              } else {
                if (current) {
                  if (!current.children) current.children = [];
                  current.children.push(element);
                } else {
                  root = element;
                }

                stack.push({ element, tagName });
                current = element;
              }
            }
          }
          continue;
        }

        if (trimmed.match(/^<\/\w+>$/)) {
          if (stack.length > 0) {
            stack.pop();
            current = stack.length > 0 ? stack[stack.length - 1]!.element : null;
          }
          continue;
        }

        if (current && trimmed) {
          if (trimmed.includes('<![CDATA[')) {
            current.cdata = trimmed.replace(/<!\[CDATA\[(.*)\]\]>/, '$1');
          } else {
            current.text = (current.text ?? '') + trimmed;
          }
        }
      }

      if (!root) {
        throw new Error('No root element found');
      }

      return root;
    } catch (error) {
      return {
        name: 'error',
        text: 'Failed to parse template result'
      };
    }
  }

  private elementToXML(element: XMLElement, pretty: boolean = true): string {
    const indent = pretty ? ' '.repeat(this.indentLevel * this.indentSize) : '';
    const newline = pretty ? '\n' : '';

    let xml = `${indent}<${element.name}`;

    if (element.attributes) {
      for (const [attributeKey, value] of Object.entries(element.attributes)) {
        if (value !== undefined && value !== null) {
          xml += ` ${attributeKey}="${this.escapeXML(String(value))}"`;
        }
      }
    }

    if (!element.text && !element.cdata && !element.comment &&
      (!element.children || element.children.length === 0)) {
      xml += '/>';
      return xml;
    }

    xml += '>';

    if (element.comment) {
      xml += `<!-- ${element.comment} -->`;
    } else if (element.cdata) {
      xml += `<![CDATA[${element.cdata}]]>`;
    } else if (element.text) {
      xml += this.escapeXML(element.text);
    } else if (element.children && element.children.length > 0) {
      xml += newline;
      this.indentLevel++;
      xml += element.children
        .map(child => this.elementToXML(child, pretty))
        .join(newline);
      this.indentLevel--;
      xml += newline + indent;
    }

    xml += `</${element.name}>`;
    return xml;
  }

  private escapeXML(str: string): string {
    if (!str) return '';

    str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');

    return str.replace(/[&<>"']/g, (char) => {
      const key = char as keyof typeof this.xmlEntities;
      return this.xmlEntities[key] || char;
    });
  }

  private parseAttributes(attrString: string): Record<string, string | number | boolean> {
    const attributes: Record<string, string | number | boolean> = {};
    if (!attrString) return attributes;

    const attrRegex = /(\w+)=["']([^"']+)["']/g;
    let match;

    while ((match = attrRegex.exec(attrString)) !== null) {
      const attrName = match[1];
      const attrValue = match[2];

      if (attrName && attrValue !== undefined) {
        if (!isNaN(Number(attrValue))) {
          attributes[attrName] = Number(attrValue);
        }
        else if (attrValue === 'true' || attrValue === 'false') {
          attributes[attrName] = attrValue === 'true';
        }
        else {
          attributes[attrName] = attrValue;
        }
      }
    }

    return attributes;
  }

  private generateGuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = ms % 1000;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }

  async exportStream(
    result: ExecutionResult,
    options: XMLExportOptions = { format: ExportFormat.XML }
  ): Promise<Readable> {
    const stream = new Readable({
      read() { }
    });

    try {
      const xmlContent = await this.generateXML(result, options);

      if (options.compress) {
        const compressed = await gzip(Buffer.from(xmlContent, options.encoding || 'utf8'));
        stream.push(compressed);
      } else {
        stream.push(xmlContent, options.encoding || 'utf8');
      }

      stream.push(null);
    } catch (error) {
      stream.destroy(error as Error);
    }

    return stream;
  }

  async exportPartial(
    result: ExecutionResult,
    outputPath: string,
    featureFilter: (feature: any) => boolean,
    options: XMLExportOptions = { format: ExportFormat.XML }
  ): Promise<ExportResult> {
    const filteredFeatures = result.features.filter(featureFilter);
    const recalculatedData = this.recalculateSummary(filteredFeatures);

    const filteredResult = {
      ...result,
      features: filteredFeatures,
      totalFeatures: recalculatedData.totalFeatures,
      totalScenarios: recalculatedData.totalScenarios,
      totalSteps: recalculatedData.totalSteps,
      passedScenarios: recalculatedData.passedScenarios,
      failedScenarios: recalculatedData.failedScenarios,
      skippedScenarios: recalculatedData.skippedScenarios,
      passedSteps: recalculatedData.passedSteps,
      failedSteps: recalculatedData.failedSteps,
      skippedSteps: recalculatedData.skippedSteps
    };

    return this.export(filteredResult, outputPath, options);
  }

  private recalculateSummary(features: any[]): any {
    const scenarios = features.flatMap(f => f.scenarios);
    const steps = scenarios.flatMap((scenarioItem: any) => scenarioItem.steps || []);

    return {
      totalFeatures: features.length,
      totalScenarios: scenarios.length,
      totalSteps: steps.length,
      passedFeatures: features.filter(f => f.scenarios.every((scenarioItem: any) => scenarioItem.status === 'passed')).length,
      passedScenarios: scenarios.filter((scenarioItem: any) => scenarioItem.status === 'passed').length,
      failedFeatures: features.filter(f => f.scenarios.some((scenarioItem: any) => scenarioItem.status === 'failed')).length,
      failedScenarios: scenarios.filter((scenarioItem: any) => scenarioItem.status === 'failed').length,
      skippedFeatures: features.filter(f => f.scenarios.every((scenarioItem: any) => scenarioItem.status === 'skipped')).length,
      skippedScenarios: scenarios.filter((scenarioItem: any) => scenarioItem.status === 'skipped').length,
      passedSteps: steps.filter((stepItem: any) => stepItem.status === 'passed').length,
      failedSteps: steps.filter((stepItem: any) => stepItem.status === 'failed').length,
      skippedSteps: steps.filter((stepItem: any) => stepItem.status === 'skipped').length
    };
  }

  async merge(
    results: ExecutionResult[],
    outputPath: string,
    options: XMLExportOptions = { format: ExportFormat.XML }
  ): Promise<ExportResult> {
    if (results.length === 0) {
      throw new Error('No results to merge');
    }

    const firstResult = results[0]!;

    const mergedResult: ExecutionResult = {
      executionId: `merged-${Date.now()}`,
      environment: firstResult.environment,
      startTime: new Date(Math.min(...results.map(r => new Date(r.startTime).getTime()))),
      endTime: new Date(Math.max(...results.map(r => new Date(r.endTime).getTime()))),
      duration: 0,
      features: [],
      scenarios: [],
      totalFeatures: 0,
      totalScenarios: 0,
      totalSteps: 0,
      passedFeatures: 0,
      passedScenarios: 0,
      passedSteps: 0,
      failedFeatures: 0,
      failedScenarios: 0,
      failedSteps: 0,
      skippedFeatures: 0,
      skippedScenarios: 0,
      skippedSteps: 0,
      status: ExecutionStatus.PASSED,
      metadata: {
        merged: true,
        sourceCount: results.length,
        sources: results.map(r => r.executionId)
      }
    };

    const featureMap = new Map<string, any>();

    for (const result of results) {
      if (result?.features && Array.isArray(result.features)) {
        for (const feature of result.features) {
          if (feature) {
            const featureKey = feature.name || feature.feature;
            if (featureKey) {
              if (featureMap.has(featureKey)) {
                const existing = featureMap.get(featureKey);
                if (existing?.scenarios && feature.scenarios) {
                  existing.scenarios.push(...feature.scenarios);
                }
              } else {
                featureMap.set(featureKey, {
                  ...feature,
                  scenarios: feature.scenarios ? [...feature.scenarios] : []
                });
              }
            }
          }
        }
      }
    }

    mergedResult.features = Array.from(featureMap.values());
    const summaryData = this.recalculateSummary(mergedResult.features);

    mergedResult.totalFeatures = summaryData.totalFeatures || 0;
    mergedResult.totalScenarios = summaryData.totalScenarios || 0;
    mergedResult.totalSteps = summaryData.totalSteps || 0;
    mergedResult.passedFeatures = summaryData.passedFeatures || 0;
    mergedResult.passedScenarios = summaryData.passedScenarios || 0;
    mergedResult.passedSteps = summaryData.passedSteps || 0;
    mergedResult.failedFeatures = summaryData.failedFeatures || 0;
    mergedResult.failedScenarios = summaryData.failedScenarios || 0;
    mergedResult.failedSteps = summaryData.failedSteps || 0;
    mergedResult.skippedFeatures = summaryData.skippedFeatures || 0;
    mergedResult.skippedScenarios = summaryData.skippedScenarios || 0;
    mergedResult.skippedSteps = summaryData.skippedSteps || 0;

    mergedResult.duration = mergedResult.endTime.getTime() - mergedResult.startTime.getTime();
    mergedResult.status = mergedResult.failedScenarios > 0 ? ExecutionStatus.FAILED : ExecutionStatus.PASSED;

    return this.export(mergedResult, outputPath, options);
  }
}
