import { ValidationResult, XMLValidationOptions, XPathResult, XMLNode as APIXMLNode } from '../types/api.types';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { FileUtils } from '../../core/utils/FileUtils';

export class XMLValidator {
    private static instance: XMLValidator;
    private schemaCache: Map<string, string> = new Map();
    private namespaces: Map<string, string> = new Map();

    private constructor() {
        this.initializeCommonNamespaces();
    }

    private convertToAPINode(node: XMLNode): APIXMLNode {
        return {
            nodeName: node.nodeName,
            nodeValue: node.nodeValue || '',
            nodeType: node.nodeType,
            textContent: node.textContent || '',
            attributes: node.attributes ? this.convertAttributes(node.attributes) : {},
            children: node.childNodes ? node.childNodes.map(child => this.convertToAPINode(child)) : []
        };
    }

    private convertAttributes(attributes: XMLAttribute[]): Record<string, string> {
        const result: Record<string, string> = {};
        attributes.forEach(attr => {
            result[attr.name] = attr.value;
        });
        return result;
    }

    private convertFromAPINode(apiNode: APIXMLNode): XMLNode {
        const node: XMLNode = {
            nodeName: apiNode.nodeName,
            nodeValue: apiNode.nodeValue || '',
            nodeType: apiNode.nodeType,
            textContent: apiNode.textContent || '',
            childNodes: apiNode.children ? apiNode.children.map(child => this.convertFromAPINode(child)) : [],
            attributes: this.convertAttributesFromRecord(apiNode.attributes || {}),
            parentNode: null,
            nextSibling: null,
            previousSibling: null,
            localName: apiNode.nodeName
        };
        return node;
    }

    private convertAttributesFromRecord(attributes: Record<string, string>): XMLAttribute[] {
        return Object.entries(attributes).map(([name, value]) => ({
            nodeType: 2,
            nodeName: name,
            name,
            value,
            childNodes: []
        } as XMLAttribute));
    }

    public static getInstance(): XMLValidator {
        if (!XMLValidator.instance) {
            XMLValidator.instance = new XMLValidator();
        }
        return XMLValidator.instance;
    }

    public async validateXPath(
        xml: string,
        xpath: string,
        expected: string | number | boolean,
        options: XMLValidationOptions = {}
    ): Promise<ValidationResult> {
        const startTime = Date.now();

        try {
            ActionLogger.getInstance().debug('XPath validation started', {
                xpath,
                expectedType: typeof expected,
                namespaces: options.namespaces
            });

            const doc = this.parseXML(xml);

            if (options.namespaces) {
                Object.entries(options.namespaces).forEach(([prefix, uri]) => {
                    this.namespaces.set(prefix, uri);
                });
            }

            const result = this.executeXPath(doc, xpath, options);

            let valid = false;
            let actual: any;
            let message = '';

            if (result.nodes.length === 0) {
                actual = undefined;
                message = `No nodes found for XPath: ${xpath}`;
            } else if (result.nodes.length === 1 && result.nodes[0]) {
                actual = this.getNodeValue(this.convertFromAPINode(result.nodes[0]), options);
                valid = this.compareValues(actual, expected, options);
                message = valid
                    ? 'XPath validation passed'
                    : `Expected ${expected}, but got ${actual}`;
            } else {
                actual = result.nodes.map(node => this.getNodeValue(this.convertFromAPINode(node), options));
                if (options.expectMultiple) {
                    valid = this.compareMultipleValues(actual, expected, options);
                    message = valid
                        ? 'XPath multiple nodes validation passed'
                        : `Multiple nodes mismatch`;
                } else {
                    message = `Found ${result.nodes.length} nodes, expected single node`;
                }
            }

            const validationResult: ValidationResult = {
                valid,
                message,
                expected,
                actual,
                duration: Date.now() - startTime,
                metadata: {
                    xpath,
                    nodeCount: result.nodes.length,
                    nodeTypes: result.nodeTypes
                }
            };

            ActionLogger.getInstance().debug('XPath validation completed', validationResult);
            return validationResult;

        } catch (error) {
            const validationResult: ValidationResult = {
                valid: false,
                message: `XPath validation error: ${(error as Error).message}`,
                errors: [{ message: (error as Error).message, path: xpath }],
                duration: Date.now() - startTime
            };

            ActionLogger.getInstance().logError(error as Error, 'XPath validation failed');
            return validationResult;
        }
    }

    public async validateSchema(
        xml: string,
        schemaPath: string,
        options: XMLValidationOptions = {}
    ): Promise<ValidationResult> {
        const startTime = Date.now();

        try {
            ActionLogger.getInstance().debug('XML schema validation started', { schemaPath });

            const schema = await this.loadSchema(schemaPath);

            const doc = this.parseXML(xml);

            const errors = this.validateAgainstSchema(doc, schema, options);

            const validationResult: ValidationResult = {
                valid: errors.length === 0,
                message: errors.length === 0
                    ? 'XML schema validation passed'
                    : `XML schema validation failed: ${errors.length} errors`,
                errors: errors.map(err => ({
                    message: err.message,
                    path: err.line ? `line ${err.line}` : 'unknown',
                    expected: 'valid XML',
                    actual: 'invalid XML',
                    type: 'schema' as const,
                    line: err.line || 0,
                    column: err.column || 0
                })),
                duration: Date.now() - startTime
            };

            ActionLogger.getInstance().debug('XML schema validation completed', validationResult);
            return validationResult;

        } catch (error) {
            const validationResult: ValidationResult = {
                valid: false,
                message: `XML schema validation error: ${(error as Error).message}`,
                errors: [{ message: (error as Error).message }],
                duration: Date.now() - startTime
            };

            ActionLogger.getInstance().logError(error as Error, 'XML schema validation failed');
            return validationResult;
        }
    }

    public extractValue(xml: string, xpath: string, options: XMLValidationOptions = {}): any {
        try {
            const doc = this.parseXML(xml);
            const result = this.executeXPath(doc, xpath, options);

            if (result.nodes.length === 0) {
                return undefined;
            } else if (result.nodes.length === 1 && result.nodes[0]) {
                return this.getNodeValue(this.convertFromAPINode(result.nodes[0]), options);
            } else {
                return result.nodes.filter(node => node).map(node => this.getNodeValue(this.convertFromAPINode(node), options));
            }
        } catch (error) {
            ActionLogger.getInstance().logError(error as Error, 'XPath extraction failed');
            return undefined;
        }
    }

    public countNodes(xml: string, xpath: string, options: XMLValidationOptions = {}): number {
        try {
            const doc = this.parseXML(xml);
            const result = this.executeXPath(doc, xpath, options);
            return result.nodes.length;
        } catch (error) {
            ActionLogger.getInstance().logError(error as Error, 'XPath count failed');
            return 0;
        }
    }

    public pathExists(xml: string, xpath: string, options: XMLValidationOptions = {}): boolean {
        return this.countNodes(xml, xpath, options) > 0;
    }

    private parseXML(xml: string): XMLDocument {
        if (xml.charCodeAt(0) === 0xFEFF) {
            xml = xml.substring(1);
        }

        const ParserClass = this.createDOMParser();
        const parser = new ParserClass();
        const doc = parser.parseFromString(xml);

        const parseErrors = this.getParseErrors(doc as any);
        if (parseErrors.length > 0) {
            throw new Error(`XML parsing failed: ${parseErrors.join(', ')}`);
        }

        return doc as unknown as XMLDocument;
    }

    private executeXPath(doc: XMLDocument, xpath: string, _options: XMLValidationOptions): XPathResult {
        const expression = new this.XPathExpression(xpath, this.namespaces);
        const nodes: XMLNode[] = [];
        const nodeTypes: string[] = [];

        try {
            const result = expression.evaluate(doc.documentElement);

            if (Array.isArray(result)) {
                const xmlNodes = result as XMLNode[];
                nodes.push(...xmlNodes);
                xmlNodes.forEach(node => nodeTypes.push(this.getNodeType(node)));
            } else if (result && typeof result === 'object' && 'nodeType' in result) {
                const xmlNode = result as XMLNode;
                nodes.push(xmlNode);
                nodeTypes.push(this.getNodeType(xmlNode));
            } else if (typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean') {
                const textNode: XMLNode = {
                    nodeType: 3,
                    nodeName: '#text',
                    nodeValue: String(result),
                    textContent: String(result),
                    childNodes: []
                };
                nodes.push(textNode);
                nodeTypes.push('text');
            }

            return { nodes: nodes.map(node => this.convertToAPINode(node)), nodeTypes };
        } catch (error) {
            throw new Error(`XPath evaluation failed: ${(error as Error).message}`);
        }
    }

    private XPathExpression = class {
        constructor(private xpath: string, private namespaces: Map<string, string>) { }

        evaluate(contextNode: XMLNode): XMLNode[] | XMLNode | string | number | boolean {
            const tokens = this.tokenize(this.xpath);
            const ast = this.parse(tokens);
            return this.executeAST(ast, contextNode);
        }

        private tokenize(xpath: string): XPathToken[] {
            const tokens: XPathToken[] = [];
            let current = 0;

            while (current < xpath.length) {
                if (/\s/.test(xpath[current] || '')) {
                    current++;
                    continue;
                }

                if (xpath[current] === '/') {
                    if (xpath[current + 1] === '/') {
                        tokens.push({ type: 'DOUBLE_SLASH', value: '//' });
                        current += 2;
                    } else {
                        tokens.push({ type: 'SLASH', value: '/' });
                        current++;
                    }
                } else if (xpath[current] === '@') {
                    tokens.push({ type: 'AT', value: '@' });
                    current++;
                } else if (xpath[current] === '[') {
                    tokens.push({ type: 'LBRACKET', value: '[' });
                    current++;
                } else if (xpath[current] === ']') {
                    tokens.push({ type: 'RBRACKET', value: ']' });
                    current++;
                } else if (xpath[current] === '(') {
                    tokens.push({ type: 'LPAREN', value: '(' });
                    current++;
                } else if (xpath[current] === ')') {
                    tokens.push({ type: 'RPAREN', value: ')' });
                    current++;
                } else if (xpath[current] === '=') {
                    tokens.push({ type: 'EQUALS', value: '=' });
                    current++;
                } else if (xpath[current] === '!') {
                    if (xpath[current + 1] === '=') {
                        tokens.push({ type: 'NOT_EQUALS', value: '!=' });
                        current += 2;
                    } else {
                        throw new Error(`Unexpected character: ${xpath[current]}`);
                    }
                } else if (xpath[current] === '<') {
                    if (xpath[current + 1] === '=') {
                        tokens.push({ type: 'LTE', value: '<=' });
                        current += 2;
                    } else {
                        tokens.push({ type: 'LT', value: '<' });
                        current++;
                    }
                } else if (xpath[current] === '>') {
                    if (xpath[current + 1] === '=') {
                        tokens.push({ type: 'GTE', value: '>=' });
                        current += 2;
                    } else {
                        tokens.push({ type: 'GT', value: '>' });
                        current++;
                    }
                } else if (xpath[current] === '.') {
                    if (xpath[current + 1] === '.') {
                        tokens.push({ type: 'DOUBLE_DOT', value: '..' });
                        current += 2;
                    } else {
                        tokens.push({ type: 'DOT', value: '.' });
                        current++;
                    }
                } else if (xpath[current] === '*') {
                    tokens.push({ type: 'STAR', value: '*' });
                    current++;
                } else if (xpath[current] === '|') {
                    tokens.push({ type: 'PIPE', value: '|' });
                    current++;
                } else if (xpath[current] === ',') {
                    tokens.push({ type: 'COMMA', value: ',' });
                    current++;
                } else if (xpath[current] === ':' && xpath[current + 1] === ':') {
                    tokens.push({ type: 'DOUBLE_COLON', value: '::' });
                    current += 2;
                } else if (xpath[current] === '"' || xpath[current] === "'") {
                    const quote = xpath[current];
                    let value = '';
                    current++;
                    while (current < xpath.length && xpath[current] !== quote) {
                        value += xpath[current];
                        current++;
                    }
                    current++;
                    tokens.push({ type: 'STRING', value });
                } else if (/\d/.test(xpath[current] || '')) {
                    let value = '';
                    while (current < xpath.length && /[\d.]/.test(xpath[current] || '')) {
                        value += xpath[current];
                        current++;
                    }
                    tokens.push({ type: 'NUMBER', value });
                } else if (/[a-zA-Z_]/.test(xpath[current] || '')) {
                    let value = '';
                    while (current < xpath.length && /[a-zA-Z0-9_\-:]/.test(xpath[current] || '')) {
                        value += xpath[current];
                        current++;
                    }

                    const nextNonSpace = this.skipWhitespaceAt(xpath, current);
                    if (nextNonSpace < xpath.length && xpath[nextNonSpace] === '(') {
                        tokens.push({ type: 'FUNCTION', value });
                    } else {
                        tokens.push({ type: 'NAME', value });
                    }
                } else {
                    throw new Error(`Unexpected character at position ${current}: ${xpath[current]}`);
                }
            }

            return tokens;
        }

        private skipWhitespaceAt(xpath: string, pos: number): number {
            while (pos < xpath.length && /\s/.test(xpath[pos] || '')) {
                pos++;
            }
            return pos;
        }

        private parse(tokens: XPathToken[]): XPathAST {
            let current = 0;

            const parseExpression = (): XPathAST => {
                let left = parseOrExpr();
                return left;
            };

            const parseOrExpr = (): XPathAST => {
                let left = parseAndExpr();

                while (current < tokens.length && tokens[current]?.type === 'PIPE') {
                    current++;
                    const right = parseAndExpr();
                    left = { type: 'union', left, right };
                }

                return left;
            };

            const parseAndExpr = (): XPathAST => {
                let left = parseEqualityExpr();

                while (current < tokens.length && tokens[current]?.value === 'and') {
                    current++;
                    const right = parseEqualityExpr();
                    left = { type: 'and', left, right };
                }

                return left;
            };

            const parseEqualityExpr = (): XPathAST => {
                let left = parseRelationalExpr();

                while (current < tokens.length) {
                    const token = tokens[current];
                    if (token?.type === 'EQUALS' || token?.type === 'NOT_EQUALS') {
                        const operator = token.value;
                        current++;
                        const right = parseRelationalExpr();
                        left = { type: 'comparison', operator, left, right };
                    } else {
                        break;
                    }
                }

                return left;
            };

            const parseRelationalExpr = (): XPathAST => {
                let left = parsePathExpr();

                while (current < tokens.length) {
                    const token = tokens[current];
                    if (token?.type === 'LT' || token?.type === 'GT' ||
                        token?.type === 'LTE' || token?.type === 'GTE') {
                        const operator = token.value;
                        current++;
                        const right = parsePathExpr();
                        left = { type: 'comparison', operator, left, right };
                    } else {
                        break;
                    }
                }

                return left;
            };

            const parsePathExpr = (): XPathAST => {
                if (current < tokens.length) {
                    const token = tokens[current];
                    if (token?.type === 'STRING') {
                        current++;
                        return { type: 'literal', value: token.value };
                    } else if (token?.type === 'NUMBER') {
                        current++;
                        return { type: 'literal', value: parseFloat(token.value) };
                    }
                }

                const steps: XPathStep[] = [];
                let isAbsolute = false;

                if (current < tokens.length && tokens[current]?.type === 'SLASH') {
                    isAbsolute = true;
                    current++;
                } else if (current < tokens.length && tokens[current]?.type === 'DOUBLE_SLASH') {
                    isAbsolute = true;
                    steps.push({ axis: 'descendant-or-self', nodeTest: { type: 'node' }, predicates: [] });
                    current++;
                }

                do {
                    const step = parseStep();
                    if (!step) break;
                    steps.push(step);

                    if (current < tokens.length) {
                        if (tokens[current]?.type === 'SLASH') {
                            current++;
                        } else if (tokens[current]?.type === 'DOUBLE_SLASH') {
                            current++;
                            steps.push({ axis: 'descendant-or-self', nodeTest: { type: 'node' }, predicates: [] });
                        } else {
                            break;
                        }
                    }
                } while (current < tokens.length);

                if (steps.length === 0) {
                    throw new Error('Expected path expression');
                }

                return { type: 'path', isAbsolute, steps };
            };

            const parseStep = (): XPathStep | null => {
                let axis = 'child';
                let nodeTest: NodeTest | undefined;
                const predicates: XPathAST[] = [];

                if (current < tokens.length && tokens[current]?.type === 'AT') {
                    axis = 'attribute';
                    current++;
                } else if (current < tokens.length && tokens[current]?.type === 'DOT') {
                    axis = 'self';
                    current++;
                    nodeTest = { type: 'node' };
                } else if (current < tokens.length && tokens[current]?.type === 'DOUBLE_DOT') {
                    axis = 'parent';
                    current++;
                    nodeTest = { type: 'node' };
                }

                if (!nodeTest) {
                    if (current < tokens.length && tokens[current]?.type === 'STAR') {
                        nodeTest = { type: 'wildcard' };
                        current++;
                    } else if (current < tokens.length && tokens[current]?.type === 'NAME') {
                        const name = tokens[current]?.value || '';
                        current++;

                        if (current < tokens.length && tokens[current]?.type === 'DOUBLE_COLON') {
                            axis = name;
                            current++;

                            if (current < tokens.length && tokens[current]?.type === 'STAR') {
                                nodeTest = { type: 'wildcard' };
                                current++;
                            } else if (current < tokens.length && tokens[current]?.type === 'NAME') {
                                nodeTest = { type: 'name', name: tokens[current]?.value || '' };
                                current++;
                            } else if (current < tokens.length && tokens[current]?.type === 'FUNCTION') {
                                const funcName = tokens[current]?.value || '';
                                current++;
                                current++;

                                const args: XPathAST[] = [];
                                while (current < tokens.length && tokens[current]?.type !== 'RPAREN') {
                                    args.push(parseExpression());
                                    if (current < tokens.length && tokens[current]?.type === 'COMMA') {
                                        current++;
                                    }
                                }
                                current++;

                                nodeTest = { type: 'function', name: funcName, args };
                            }
                        } else {
                            nodeTest = { type: 'name', name };
                        }
                    } else if (current < tokens.length && tokens[current]?.type === 'FUNCTION') {
                        const funcName = tokens[current]?.value || '';
                        current++;
                        current++;

                        const args: XPathAST[] = [];
                        while (current < tokens.length && tokens[current]?.type !== 'RPAREN') {
                            args.push(parseExpression());
                            if (current < tokens.length && tokens[current]?.type === 'COMMA') {
                                current++;
                            }
                        }
                        current++;

                        nodeTest = { type: 'function', name: funcName, args };
                    } else {
                        return null;
                    }
                }

                while (current < tokens.length && tokens[current]?.type === 'LBRACKET') {
                    current++;
                    predicates.push(parseExpression());
                    if (current >= tokens.length || tokens[current]?.type !== 'RBRACKET') {
                        throw new Error('Expected ] in predicate');
                    }
                    current++;
                }

                return { axis, nodeTest: nodeTest || { type: 'node' }, predicates };
            };

            return parseExpression();
        }

        private executeAST(ast: XPathAST, context: XMLNode): any {
            switch (ast.type) {
                case 'path':
                    return this.executePath(ast as PathAST, context);
                case 'union':
                    const left = this.executeAST(ast['left'], context);
                    const right = this.executeAST(ast['right'], context);
                    return this.unionNodeSets(left, right);
                case 'and':
                    return this.toBoolean(this.executeAST(ast['left'], context)) &&
                        this.toBoolean(this.executeAST(ast['right'], context));
                case 'comparison':
                    return this.executeComparison(ast, context);
                case 'literal':
                    return ast['value'];
                default:
                    throw new Error(`Unknown AST type: ${ast.type}`);
            }
        }

        private executePath(path: PathAST, context: XMLNode): XMLNode[] {
            let nodes: XMLNode[] = path.isAbsolute ? [this.getRoot(context)] : [context];

            for (const step of path.steps) {
                const newNodes: XMLNode[] = [];

                for (const node of nodes) {
                    const stepResults = this.executeStep(step, node);
                    newNodes.push(...stepResults);
                }

                nodes = newNodes;
            }

            return nodes;
        }

        private executeStep(step: XPathStep, context: XMLNode): XMLNode[] {
            let nodes = this.getAxisNodes(step.axis, context);
            nodes = this.filterByNodeTest(nodes, step.nodeTest);

            for (const predicate of step.predicates) {
                nodes = this.filterByPredicate(nodes, predicate);
            }

            return nodes;
        }

        private getAxisNodes(axis: string, context: XMLNode): XMLNode[] {
            const nodes: XMLNode[] = [];

            switch (axis) {
                case 'child':
                    if (context.nodeType === 1) {
                        nodes.push(...Array.from(context.childNodes));
                    }
                    break;
                case 'descendant':
                    this.getDescendants(context, nodes);
                    break;
                case 'descendant-or-self':
                    nodes.push(context);
                    this.getDescendants(context, nodes);
                    break;
                case 'parent':
                    if (context.parentNode) {
                        nodes.push(context.parentNode);
                    }
                    break;
                case 'ancestor':
                    let parent = context.parentNode;
                    while (parent) {
                        nodes.push(parent);
                        parent = parent.parentNode;
                    }
                    break;
                case 'ancestor-or-self':
                    nodes.push(context);
                    let ancestor = context.parentNode;
                    while (ancestor) {
                        nodes.push(ancestor);
                        ancestor = ancestor.parentNode;
                    }
                    break;
                case 'following-sibling':
                    let sibling = context.nextSibling;
                    while (sibling) {
                        nodes.push(sibling);
                        sibling = sibling.nextSibling;
                    }
                    break;
                case 'preceding-sibling':
                    let prevSibling = context.previousSibling;
                    while (prevSibling) {
                        nodes.unshift(prevSibling);
                        prevSibling = prevSibling.previousSibling;
                    }
                    break;
                case 'attribute':
                    if (context.nodeType === 1 && context.attributes) {
                        nodes.push(...Array.from(context.attributes));
                    }
                    break;
                case 'self':
                    nodes.push(context);
                    break;
            }

            return nodes;
        }

        private getDescendants(node: XMLNode, result: XMLNode[]): void {
            if (node.childNodes) {
                for (let i = 0; i < node.childNodes.length; i++) {
                    const child = node.childNodes[i];
                    if (child) {
                        result.push(child);
                        this.getDescendants(child, result);
                    }
                }
            }
        }

        private filterByNodeTest(nodes: XMLNode[], nodeTest: NodeTest): XMLNode[] {
            switch (nodeTest.type) {
                case 'wildcard':
                    return nodes.filter(n => n.nodeType === 1 || n.nodeType === 2);
                case 'name':
                    return nodes.filter(n => {
                        const testName = nodeTest.name || '';

                        if (n.nodeType === 1) {
                            if (testName.includes(':')) {
                                const colonIndex = testName.indexOf(':');
                                const prefix = testName.substring(0, colonIndex);
                                const localName = testName.substring(colonIndex + 1);
                                const namespaceURI = this.namespaces.get(prefix);

                                return n.nodeName === testName ||
                                    (n.localName === localName && namespaceURI !== undefined);
                            }
                            return n.nodeName === testName || n.localName === testName;
                        } else if (n.nodeType === 2) {
                            return (n as any).name === testName;
                        }
                        return false;
                    });
                case 'node':
                    return nodes;
                case 'function':
                    return this.filterByNodeTestFunction(nodes, nodeTest);
                default:
                    return nodes;
            }
        }

        private filterByNodeTestFunction(nodes: XMLNode[], nodeTest: NodeTest): XMLNode[] {
            const funcName = nodeTest.name || '';

            switch (funcName) {
                case 'text':
                    return nodes.filter(n => n.nodeType === 3);
                case 'comment':
                    return nodes.filter(n => n.nodeType === 8);
                case 'node':
                    return nodes;
                case 'processing-instruction':
                    return nodes.filter(n => n.nodeType === 7);
                default:
                    return [];
            }
        }

        private filterByPredicate(nodes: XMLNode[], predicate: XPathAST): XMLNode[] {
            const result: XMLNode[] = [];

            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                if (node) {
                    const value = this.executeAST(predicate, node);

                    if (typeof value === 'number') {
                        if (value === i + 1) {
                            result.push(node);
                        }
                    } else if (this.toBoolean(value)) {
                        result.push(node);
                    }
                }
            }

            return result;
        }

        private toBoolean(value: any): boolean {
            if (typeof value === 'boolean') return value;
            if (typeof value === 'string') return value.length > 0;
            if (typeof value === 'number') return value !== 0 && !isNaN(value);
            if (Array.isArray(value)) return value.length > 0;
            if (value && typeof value === 'object' && 'nodeType' in value) return true;
            return false;
        }

        private unionNodeSets(left: any, right: any): XMLNode[] {
            const nodes: XMLNode[] = [];
            const seen = new Set<XMLNode>();

            const addNodes = (value: any) => {
                if (Array.isArray(value)) {
                    for (const node of value) {
                        if (!seen.has(node)) {
                            seen.add(node);
                            nodes.push(node);
                        }
                    }
                } else if (value && typeof value === 'object' && 'nodeType' in value && !seen.has(value)) {
                    seen.add(value);
                    nodes.push(value);
                }
            };

            addNodes(left);
            addNodes(right);

            return nodes;
        }

        private getRoot(node: XMLNode): XMLNode {
            while (node.parentNode) {
                node = node.parentNode;
            }
            return node;
        }

        private executeComparison(ast: any, context: XMLNode): boolean {
            const left = this.executeAST(ast.left, context);
            const right = this.executeAST(ast.right, context);

            switch (ast.operator) {
                case '=': return this.compareValues(left, right, '=');
                case '!=': return !this.compareValues(left, right, '=');
                case '<': return this.compareValues(left, right, '<');
                case '>': return this.compareValues(left, right, '>');
                case '<=': return this.compareValues(left, right, '<=');
                case '>=': return this.compareValues(left, right, '>=');
                default: return false;
            }
        }

        private compareValues(left: any, right: any, op: string): boolean {
            if (Array.isArray(left) || Array.isArray(right)) {
                return this.compareNodeSets(left, right, op);
            }

            const leftVal = this.toComparableValue(left);
            const rightVal = this.toComparableValue(right);

            switch (op) {
                case '=':
                    if (typeof leftVal === 'boolean' || typeof rightVal === 'boolean') {
                        return this.toBoolean(leftVal) === this.toBoolean(rightVal);
                    }
                    return leftVal === rightVal;
                case '<': return leftVal < rightVal;
                case '>': return leftVal > rightVal;
                case '<=': return leftVal <= rightVal;
                case '>=': return leftVal >= rightVal;
                default: return false;
            }
        }

        private compareNodeSets(left: any, right: any, op: string): boolean {
            const leftArray = Array.isArray(left) ? left : [left];
            const rightArray = Array.isArray(right) ? right : [right];

            for (const l of leftArray) {
                for (const r of rightArray) {
                    const leftVal = this.toComparableValue(l);
                    const rightVal = this.toComparableValue(r);

                    let result = false;
                    switch (op) {
                        case '=': result = leftVal === rightVal; break;
                        case '<': result = leftVal < rightVal; break;
                        case '>': result = leftVal > rightVal; break;
                        case '<=': result = leftVal <= rightVal; break;
                        case '>=': result = leftVal >= rightVal; break;
                    }

                    if (result) return true;
                }
            }

            return false;
        }

        private toComparableValue(value: any): any {
            if (Array.isArray(value) && value.length > 0) {
                return this.getNodeStringValue(value[0]);
            } else if (value && typeof value === 'object' && 'nodeType' in value) {
                return this.getNodeStringValue(value);
            }
            return value;
        }

        private getNodeStringValue(node: XMLNode): string {
            if (node.nodeType === 1) {
                return node.textContent || '';
            } else if (node.nodeType === 2) {
                return (node as any).value || '';
            } else if (node.nodeType === 3) {
                return node.nodeValue || '';
            } else if (node.nodeType === 8) {
                return node.nodeValue || '';
            }
            return '';
        }
    };

    private XMLDocumentImpl = class implements XMLDocument {
        documentElement: XMLElement;
        nodeType = 9;
        nodeName = '#document';
        childNodes: XMLNode[] = [];

        constructor() {
            this.documentElement = new (XMLValidator.getInstance().XMLElementImpl)('root');
        }

        createElement(tagName: string): XMLElement {
            return new (XMLValidator.getInstance().XMLElementImpl)(tagName);
        }

        createTextNode(data: string): XMLTextNode {
            return new (XMLValidator.getInstance().XMLTextNodeImpl)(data);
        }

        createAttribute(name: string): XMLAttribute {
            return new (XMLValidator.getInstance().XMLAttributeImpl)(name);
        }
    } as any;

    private XMLElementImpl = class implements XMLElement {
        nodeType = 1;
        childNodes: XMLNode[] = [];
        attributes: XMLAttribute[] = [];
        parentNode: XMLNode | null = null;
        nextSibling: XMLNode | null = null;
        previousSibling: XMLNode | null = null;
        textContent: string = '';

        constructor(public nodeName: string, public localName: string = nodeName) { }

        appendChild(child: XMLNode): void {
            if (this.childNodes.length > 0) {
                const lastChild = this.childNodes[this.childNodes.length - 1];
                if (lastChild) {
                    lastChild.nextSibling = child;
                    child.previousSibling = lastChild;
                }
            }
            child.parentNode = this;
            this.childNodes.push(child);
            this.updateTextContent();
        }

        setAttribute(name: string, value: string): void {
            const attr = new (XMLValidator.getInstance().XMLAttributeImpl)(name, value);
            this.attributes.push(attr);
        }

        getAttribute(name: string): string | null {
            const attr = this.attributes.find(a => a.name === name);
            return attr ? attr.value : null;
        }

        private updateTextContent(): void {
            this.textContent = this.childNodes
                .map(child => {
                    if (child.nodeType === 3) return child.nodeValue;
                    if (child.nodeType === 1) return (child as XMLElement).textContent;
                    return '';
                })
                .join('');
        }
    } as any;

    private XMLTextNodeImpl = class implements XMLTextNode {
        nodeType = 3;
        nodeName = '#text';
        parentNode: XMLNode | null = null;
        nextSibling: XMLNode | null = null;
        previousSibling: XMLNode | null = null;
        childNodes: XMLNode[] = [];

        constructor(public nodeValue: string) { }
    } as any;

    private XMLAttributeImpl = class implements XMLAttribute {
        nodeType = 2;
        nodeName: string;
        childNodes: XMLNode[] = [];

        constructor(public name: string, public value: string = '') {
            this.nodeName = name;
        }
    } as any;

    private createDOMParser() {
        return class {
            parseFromString(xml: string): XMLDocument {
                const parser = new (XMLValidator.getInstance().XMLParser)();
                const root = parser.parse(xml);
                const doc = new (XMLValidator.getInstance().XMLDocumentImpl)();
                doc.documentElement = root;
                return doc;
            }
        };
    }

    private XMLParser = class {
        private pos = 0;
        private xml = '';

        parse(xml: string): XMLElement {
            this.xml = xml;
            this.pos = 0;

            this.skipDeclaration();

            this.skipWhitespaceAndComments();

            return this.parseElement();
        }

        private parseElement(): XMLElement {
            if (this.xml[this.pos] !== '<') {
                throw new Error(`Expected < at position ${this.pos}`);
            }
            this.pos++;

            const tagName = this.parseName();
            const element = new (XMLValidator.getInstance().XMLElementImpl)(tagName);

            this.skipWhitespace();
            while (this.pos < this.xml.length && this.xml[this.pos] !== '>' && this.xml[this.pos] !== '/') {
                const attrName = this.parseName();
                this.skipWhitespace();
                if (this.xml[this.pos] !== '=') {
                    throw new Error(`Expected = after attribute name at position ${this.pos}`);
                }
                this.pos++;
                this.skipWhitespace();
                const attrValue = this.parseAttributeValue();
                element.setAttribute(attrName, attrValue);
                this.skipWhitespace();
            }

            if (this.xml[this.pos] === '/') {
                this.pos++;
                if (this.xml[this.pos] !== '>') {
                    throw new Error(`Expected > after / at position ${this.pos}`);
                }
                this.pos++;
                return element;
            }

            if (this.xml[this.pos] !== '>') {
                throw new Error(`Expected > at position ${this.pos}`);
            }
            this.pos++;

            while (this.pos < this.xml.length) {
                this.skipWhitespaceAndComments();

                if (this.xml.substring(this.pos, this.pos + 2) === '</') {
                    this.pos += 2;
                    const endTagName = this.parseName();
                    if (endTagName !== tagName) {
                        throw new Error(`Mismatched end tag: expected ${tagName}, got ${endTagName}`);
                    }
                    this.skipWhitespace();
                    if (this.xml[this.pos] !== '>') {
                        throw new Error(`Expected > at position ${this.pos}`);
                    }
                    this.pos++;
                    break;
                } else if (this.xml[this.pos] === '<') {
                    const child = this.parseElement();
                    element.appendChild(child);
                } else {
                    const text = this.parseText();
                    if (text.trim()) {
                        const textNode = new (XMLValidator.getInstance().XMLTextNodeImpl)(text);
                        element.appendChild(textNode);
                    }
                }
            }

            return element;
        }

        private parseName(): string {
            let name = '';
            while (this.pos < this.xml.length && /[a-zA-Z0-9_:\-]/.test(this.xml[this.pos] || '')) {
                name += this.xml[this.pos];
                this.pos++;
            }
            if (!name) {
                throw new Error(`Expected name at position ${this.pos}`);
            }
            return name;
        }

        private parseAttributeValue(): string {
            const quote = this.xml[this.pos];
            if (quote !== '"' && quote !== "'") {
                throw new Error(`Expected quote at position ${this.pos}`);
            }
            this.pos++;

            let value = '';
            while (this.pos < this.xml.length && this.xml[this.pos] !== quote) {
                if (this.xml[this.pos] === '&') {
                    value += this.parseEntity();
                } else {
                    value += this.xml[this.pos];
                    this.pos++;
                }
            }

            if (this.xml[this.pos] !== quote) {
                throw new Error(`Expected closing quote at position ${this.pos}`);
            }
            this.pos++;

            return value;
        }

        private parseText(): string {
            let text = '';
            while (this.pos < this.xml.length && this.xml[this.pos] !== '<') {
                if (this.xml[this.pos] === '&') {
                    text += this.parseEntity();
                } else {
                    text += this.xml[this.pos];
                    this.pos++;
                }
            }
            return text;
        }

        private parseEntity(): string {
            this.pos++;
            let entity = '';
            while (this.pos < this.xml.length && this.xml[this.pos] !== ';') {
                entity += this.xml[this.pos];
                this.pos++;
            }
            this.pos++;

            switch (entity) {
                case 'lt': return '<';
                case 'gt': return '>';
                case 'amp': return '&';
                case 'quot': return '"';
                case 'apos': return "'";
                default:
                    if (entity.startsWith('#x')) {
                        return String.fromCharCode(parseInt(entity.substring(2), 16));
                    } else if (entity.startsWith('#')) {
                        return String.fromCharCode(parseInt(entity.substring(1), 10));
                    }
                    throw new Error(`Unknown entity: &${entity};`);
            }
        }

        private skipWhitespace(): void {
            while (this.pos < this.xml.length && /\s/.test(this.xml[this.pos] || '')) {
                this.pos++;
            }
        }

        private skipWhitespaceAndComments(): void {
            while (this.pos < this.xml.length) {
                this.skipWhitespace();

                if (this.xml.substring(this.pos, this.pos + 4) === '<!--') {
                    this.pos += 4;
                    while (this.pos < this.xml.length - 2) {
                        if (this.xml.substring(this.pos, this.pos + 3) === '-->') {
                            this.pos += 3;
                            break;
                        }
                        this.pos++;
                    }
                } else {
                    break;
                }
            }
        }

        private skipDeclaration(): void {
            this.skipWhitespace();
            if (this.xml.substring(this.pos, this.pos + 5) === '<?xml') {
                this.pos += 5;
                while (this.pos < this.xml.length - 1) {
                    if (this.xml.substring(this.pos, this.pos + 2) === '?>') {
                        this.pos += 2;
                        break;
                    }
                    this.pos++;
                }
            }
        }
    };

    private getNodeValue(node: XMLNode, options: XMLValidationOptions): any {
        if (node.nodeType === 1) {
            const textContent = node.textContent || '';
            return options.convertNumbers && this.isNumeric(textContent)
                ? parseFloat(textContent)
                : textContent;
        } else if (node.nodeType === 2) {
            const value = (node as XMLAttribute).value || '';
            return options.convertNumbers && this.isNumeric(value)
                ? parseFloat(value)
                : value;
        } else if (node.nodeType === 3) {
            const value = node.nodeValue || '';
            return options.convertNumbers && this.isNumeric(value)
                ? parseFloat(value)
                : value;
        }
        return '';
    }

    private compareValues(actual: any, expected: any, options: XMLValidationOptions): boolean {
        if (options.strictComparison) {
            return actual === expected;
        }

        if (typeof actual === 'string' && typeof expected === 'number') {
            return parseFloat(actual) === expected;
        }
        if (typeof actual === 'number' && typeof expected === 'string') {
            return actual === parseFloat(expected);
        }
        if (typeof actual === 'string' && typeof expected === 'boolean') {
            return actual.toLowerCase() === expected.toString();
        }
        if (typeof actual === 'boolean' && typeof expected === 'string') {
            return actual.toString() === expected.toLowerCase();
        }

        return actual == expected;
    }

    private compareMultipleValues(actualArray: any[], expected: any, options: XMLValidationOptions): boolean {
        if (Array.isArray(expected)) {
            if (actualArray.length !== expected.length) return false;
            return actualArray.every((actual, index) =>
                this.compareValues(actual, expected[index], options)
            );
        } else {
            return actualArray.some(actual => this.compareValues(actual, expected, options));
        }
    }

    private getNodeType(node: XMLNode): string {
        switch (node.nodeType) {
            case 1: return 'element';
            case 2: return 'attribute';
            case 3: return 'text';
            case 4: return 'cdata';
            case 8: return 'comment';
            case 9: return 'document';
            default: return 'unknown';
        }
    }

    private isNumeric(str: string): boolean {
        return !isNaN(parseFloat(str)) && isFinite(parseFloat(str));
    }

    private getParseErrors(doc: XMLDocument): string[] {
        const errors: string[] = [];
        // Note: In a real implementation, you would check for parser errors

        if (!doc.documentElement) {
            errors.push('No root element found');
        }

        return errors;
    }

    private async loadSchema(schemaPath: string): Promise<string> {
        if (this.schemaCache.has(schemaPath)) {
            return this.schemaCache.get(schemaPath)!;
        }

        try {
            const schemaContent = await FileUtils.readFile(schemaPath);
            const schema = typeof schemaContent === 'string' ? schemaContent : schemaContent.toString();
            this.schemaCache.set(schemaPath, schema);
            return schema;
        } catch (error) {
            throw new Error(`Failed to load schema from ${schemaPath}: ${(error as Error).message}`);
        }
    }

    private validateAgainstSchema(doc: XMLDocument, schema: string, _options: XMLValidationOptions): Array<{ message: string, line?: number, column?: number }> {
        const errors: Array<{ message: string, line?: number, column?: number }> = [];

        try {
            const schemaDoc = this.parseXML(schema);
            const rules = this.extractSchemaRules(schemaDoc);

            this.validateElementAgainstRules(doc.documentElement, rules, errors);

        } catch (error) {
            errors.push({ message: `Schema validation error: ${(error as Error).message}` });
        }

        return errors;
    }

    private extractSchemaRules(schemaDoc: XMLDocument): Map<string, any> {
        const rules = new Map<string, any>();

        const elements = this.executeXPath(schemaDoc, '//xs:element', {});

        elements.nodes.forEach(element => {
            const xmlElement = element as any as XMLElement;
            const name = xmlElement.getAttribute('name');
            const type = xmlElement.getAttribute('type');
            const minOccurs = xmlElement.getAttribute('minOccurs') || '1';
            const maxOccurs = xmlElement.getAttribute('maxOccurs') || '1';

            if (name) {
                rules.set(name, {
                    type,
                    minOccurs: parseInt(minOccurs),
                    maxOccurs: maxOccurs === 'unbounded' ? Infinity : parseInt(maxOccurs)
                });
            }
        });

        return rules;
    }

    private validateElementAgainstRules(
        element: XMLElement,
        rules: Map<string, any>,
        errors: Array<{ message: string, line?: number, column?: number }>
    ): void {
        const elementName = element.localName || element.nodeName;
        const rule = rules.get(elementName);

        if (!rule) {
            errors.push({ message: `Element '${elementName}' not defined in schema` });
            return;
        }

        const childElements = Array.from(element.childNodes).filter(n => n.nodeType === 1) as XMLElement[];
        const childCounts = new Map<string, number>();

        childElements.forEach(child => {
            const childName = child.localName || child.nodeName;
            childCounts.set(childName, (childCounts.get(childName) || 0) + 1);
            this.validateElementAgainstRules(child, rules, errors);
        });

        childCounts.forEach((count, childName) => {
            const childRule = rules.get(childName);
            if (childRule) {
                if (count < childRule.minOccurs) {
                    errors.push({
                        message: `Element '${childName}' occurs ${count} times, minimum required: ${childRule.minOccurs}`
                    });
                }
                if (count > childRule.maxOccurs) {
                    errors.push({
                        message: `Element '${childName}' occurs ${count} times, maximum allowed: ${childRule.maxOccurs}`
                    });
                }
            }
        });
    }

    private initializeCommonNamespaces(): void {
        this.namespaces.set('xml', 'http://www.w3.org/XML/1998/namespace');
        this.namespaces.set('xmlns', 'http://www.w3.org/2000/xmlns/');
        this.namespaces.set('xs', 'http://www.w3.org/2001/XMLSchema');
        this.namespaces.set('xsi', 'http://www.w3.org/2001/XMLSchema-instance');
        this.namespaces.set('soap', 'http://schemas.xmlsoap.org/soap/envelope/');
        this.namespaces.set('wsdl', 'http://schemas.xmlsoap.org/wsdl/');
    }
}

interface XMLNode {
    nodeType: number;
    nodeName: string;
    nodeValue?: string;
    textContent?: string;
    parentNode?: XMLNode | null;
    childNodes: XMLNode[];
    nextSibling?: XMLNode | null;
    previousSibling?: XMLNode | null;
    attributes?: XMLAttribute[];
    localName?: string;
}

interface XMLElement extends XMLNode {
    setAttribute(name: string, value: string): void;
    getAttribute(name: string): string | null;
    appendChild(child: XMLNode): void;
}

interface XMLAttribute extends XMLNode {
    name: string;
    value: string;
}

interface XMLTextNode extends XMLNode {
    nodeValue: string;
}

interface XMLDocument extends XMLNode {
    documentElement: XMLElement;
    createElement(tagName: string): XMLElement;
    createTextNode(data: string): XMLTextNode;
    createAttribute(name: string): XMLAttribute;
}

interface XPathToken {
    type: string;
    value: string;
}

interface XPathAST {
    type: string;
    [key: string]: any;
}

interface PathAST extends XPathAST {
    isAbsolute: boolean;
    steps: XPathStep[];
}

interface XPathStep {
    axis: string;
    nodeTest: NodeTest;
    predicates: XPathAST[];
}

interface NodeTest {
    type: 'name' | 'wildcard' | 'node' | 'function';
    name?: string;
    args?: XPathAST[];
}
