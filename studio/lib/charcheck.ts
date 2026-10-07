/**
 * Safety check for character code written by Claude from a user's description.
 * Only plain React + SVG drawing is allowed. The render step also runs with no
 * secrets in its environment, so this is one of two layers, not the only one.
 */
import {parse} from '@babel/parser';

const MAX_BYTES = 24_000;

const ALLOWED_IMPORTS: Record<string, Set<string>> = {
  react: new Set(['default', 'useId', 'useMemo', 'Fragment']),
  remotion: new Set(['useCurrentFrame', 'useVideoConfig', 'interpolate', 'spring', 'Easing', 'random']),
};

const SVG_TAGS = new Set([
  'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs', 'linearGradient', 'radialGradient',
  'stop', 'clipPath', 'mask', 'filter', 'feGaussianBlur', 'feOffset', 'feMerge', 'feMergeNode', 'feColorMatrix', 'feBlend',
  'feFlood', 'feComposite', 'feDropShadow', 'text', 'tspan',
]);

/** Never allowed, not even as a property name (obj.fetch, x.constructor). */
const BANNED_ANYWHERE = new Set([
  'fetch', 'eval', 'Function', 'constructor', 'prototype', '__proto__', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker',
  'SharedWorker', 'importScripts', 'localStorage', 'sessionStorage', 'indexedDB', 'innerHTML', 'outerHTML', 'dangerouslySetInnerHTML',
  'sendBeacon', 'cookie', 'postMessage', 'Reflect', 'Proxy', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'staticFile',
  'delayRender', 'continueRender', 'prefetch', 'Image', 'Audio', 'fromCharCode', 'WebAssembly',
  'defineProperty', 'defineProperties', 'setPrototypeOf', 'getOwnPropertyDescriptor', '__defineGetter__', '__lookupGetter__',
]);

/** Globals that give access to the page or the machine. Fine as object keys ({top: 10}), not as references. */
const BANNED_GLOBALS = new Set([
  'window', 'document', 'globalThis', 'global', 'self', 'top', 'parent', 'frames', 'navigator', 'location', 'process', 'require',
  'history', 'Symbol', 'atob', 'btoa', 'module', 'exports', 'Buffer',
]);

const BANNED_ATTRS = /^(on[A-Z].*|ref|dangerouslySetInnerHTML|href|xlinkHref|xlink:href|src)$/;

type Node = {type: string; [k: string]: any};

function walk(node: any, visit: (n: Node, parent: Node | null) => void, parent: Node | null = null) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra' || key === 'comments' || key.endsWith('Comments')) continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => walk(c, visit, node));
    else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v, visit, node);
  }
}

export function checkCharacterCode(code: string): string[] {
  const errors: string[] = [];
  if (Buffer.byteLength(code, 'utf8') > MAX_BYTES) errors.push(`code is over ${MAX_BYTES / 1000} KB`);
  let ast: any;
  try {
    ast = parse(code, {sourceType: 'module', plugins: ['typescript', 'jsx']});
  } catch (e) {
    return [`does not parse: ${(e as Error).message}`];
  }
  const localComponents = new Set<string>();
  let exportsCharacter = false;
  const numeric = numericNames(ast.program);
  for (const name of TRUSTED_GLOBALS) if (numeric.declared.has(name)) errors.push(`"${name}" can't be redefined`);

  walk(ast.program, (n) => {
    if ((n.type === 'VariableDeclarator' || n.type === 'FunctionDeclaration') && n.id?.type === 'Identifier' && /^[A-Z]/.test(n.id.name)) {
      localComponents.add(n.id.name);
    }
  });

  walk(ast.program, (n, parent) => {
    switch (n.type) {
      case 'ImportDeclaration': {
        const allowed = ALLOWED_IMPORTS[n.source.value];
        if (!allowed) errors.push(`import from "${n.source.value}" is not allowed`);
        else if (n.importKind === 'type') break;
        else
          for (const s of n.specifiers) {
            const name = s.type === 'ImportDefaultSpecifier' || s.type === 'ImportNamespaceSpecifier' ? 'default' : s.imported?.name ?? s.imported?.value;
            if (s.importKind !== 'type' && !allowed.has(name)) errors.push(`import "${name}" from "${n.source.value}" is not allowed`);
          }
        break;
      }
      case 'ImportExpression':
      case 'Import':
        errors.push('dynamic import is not allowed');
        break;
      case 'ExportAllDeclaration':
        errors.push('export * is not allowed');
        break;
      case 'ExportNamedDeclaration': {
        if (n.source) errors.push('re-exports are not allowed');
        const d = n.declaration;
        if (d?.type === 'VariableDeclaration' && d.declarations.some((x: Node) => x.id?.name === 'Character')) exportsCharacter = true;
        if (d?.type === 'FunctionDeclaration' && d.id?.name === 'Character') exportsCharacter = true;
        if (n.specifiers?.some((s: Node) => (s.exported?.name ?? s.exported?.value) === 'Character')) exportsCharacter = true;
        break;
      }
      case 'Identifier': {
        if (BANNED_ANYWHERE.has(n.name)) errors.push(`"${n.name}" is not allowed`);
        const isKey =
          parent &&
          (((parent.type === 'ObjectProperty' || parent.type === 'ObjectMethod') && parent.key === n && !parent.computed) ||
            ((parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') && parent.property === n && !parent.computed) ||
            (parent.type === 'TSPropertySignature' && parent.key === n));
        if (!isKey && BANNED_GLOBALS.has(n.name)) errors.push(`"${n.name}" is not allowed`);
        break;
      }
      case 'StringLiteral':
      case 'TemplateElement': {
        const v: string = n.type === 'StringLiteral' ? n.value : n.value?.cooked ?? '';
        if (URLISH.test(v)) errors.push('links and URLs are not allowed in character code');
        if (BANNED_ANYWHERE.has(v)) errors.push(`"${v}" is not allowed`);
        break;
      }
      case 'TemplateLiteral': {
        // `htt${''}ps://…` passes the per-piece check above: also check the pieces joined.
        const joined = n.quasis.map((q: Node) => q.value?.cooked ?? '').join('');
        if (URLISH.test(joined)) errors.push('links and URLs are not allowed in character code');
        if (BANNED_ANYWHERE.has(joined)) errors.push(`"${joined}" is not allowed`);
        break;
      }
      case 'MemberExpression':
      case 'OptionalMemberExpression':
        // Only number indexes (arr[0], arr[i] in a .map, arr[Math.floor(x)]). A string key built at runtime
        // ('con' + 'structor', [..].join('')) would reach Function and run anything.
        if (n.computed && !numeric.is(n.property)) errors.push('computed property access like obj[key] is not allowed (only number indexes)');
        break;
      case 'JSXOpeningElement': {
        const name = n.name;
        if (name.type === 'JSXIdentifier') {
          if (/^[a-z]/.test(name.name) && !SVG_TAGS.has(name.name)) errors.push(`<${name.name}> is not allowed (only SVG drawing tags)`);
          if (/^[A-Z]/.test(name.name) && !localComponents.has(name.name) && name.name !== 'Fragment') errors.push(`<${name.name}> is not defined in this file`);
        } else if (name.type === 'JSXMemberExpression') {
          if (!(name.object.name === 'React' && name.property.name === 'Fragment')) errors.push('only React.Fragment is allowed as a member tag');
        } else errors.push('namespaced tags are not allowed');
        for (const a of n.attributes) {
          if (a.type === 'JSXSpreadAttribute') {
            // {...{ref: …}} would slip a banned attribute past the name check.
            errors.push('spread attributes {...x} are not allowed');
            continue;
          }
          const an = a.name.type === 'JSXNamespacedName' ? `${a.name.namespace.name}:${a.name.name.name}` : a.name.name;
          if (BANNED_ATTRS.test(an)) errors.push(`attribute "${an}" is not allowed`);
        }
        break;
      }
      case 'ObjectProperty':
      case 'ObjectMethod':
      case 'ClassMethod':
      case 'ClassProperty':
        // The number-index check trusts .map(…) index params, .length and Math: keep those meaning what they say.
        if (!n.computed && TRUSTED_KEYS.has(n.key?.name ?? n.key?.value)) errors.push(`defining "${n.key.name ?? n.key.value}" is not allowed`);
        break;
      case 'AssignmentExpression':
        if ((n.left.type === 'MemberExpression' || n.left.type === 'OptionalMemberExpression') && !n.left.computed && TRUSTED_KEYS.has(n.left.property.name)) {
          errors.push(`setting "${n.left.property.name}" is not allowed`);
        }
        break;
      case 'NewExpression':
        errors.push('"new" is not allowed');
        break;
      case 'WhileStatement':
      case 'DoWhileStatement':
      case 'ForInStatement':
        errors.push(`${n.type.replace('Statement', '').toLowerCase()} loops are not allowed (use array .map)`);
        break;
      case 'TaggedTemplateExpression':
        errors.push('tagged templates are not allowed');
        break;
    }
  });

  if (!exportsCharacter) errors.push('must export a component named "Character"');
  return [...new Set(errors)];
}

const URLISH = /https?:|\/\/|javascript:|data:/i;

const INDEX_CALLBACKS = new Set(['map', 'forEach', 'filter', 'some', 'every', 'flatMap', 'find', 'findIndex', 'findLast', 'findLastIndex']);
const NUMERIC_CALLS = new Set(['interpolate', 'spring', 'random']);
const TRUSTED_KEYS = new Set([...INDEX_CALLBACKS, 'length']);
const TRUSTED_GLOBALS = ['Math', 'Number', ...NUMERIC_CALLS];

/**
 * Which expressions are surely numbers. A name counts only when every place it gets a value gives a number:
 * `const i = 2`, the index of an array callback (`.map((x, i) => …)`), `for (let i = 0; …; i++)`.
 */
function numericNames(program: any) {
  const sites = new Map<string, Node[]>(); // name -> value expressions (null-type marker = unknown value)
  const UNKNOWN: Node = {type: 'Unknown'};
  const add = (name: string, value: Node) => sites.set(name, [...(sites.get(name) ?? []), value]);
  const patternNames = (p: any, value: Node) => {
    if (!p) return;
    if (p.type === 'Identifier') add(p.name, value);
    else if (p.type === 'AssignmentPattern') patternNames(p.left, UNKNOWN);
    else if (p.type === 'RestElement') patternNames(p.argument, UNKNOWN);
    else if (p.type === 'ArrayPattern') p.elements.forEach((e: any) => patternNames(e, UNKNOWN));
    else if (p.type === 'ObjectPattern') p.properties.forEach((q: any) => patternNames(q.type === 'RestElement' ? q.argument : q.value, UNKNOWN));
    else if (p.type === 'TSParameterProperty') patternNames(p.parameter, UNKNOWN);
  };
  const NUMBER: Node = {type: 'NumericLiteral', value: 0};
  walk(program, (n, parent) => {
    if (n.type === 'VariableDeclarator') patternNames(n.id, n.init ?? UNKNOWN);
    if ((n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && n.id) add(n.id.name, UNKNOWN);
    else if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression' || n.type === 'ObjectMethod' || n.type === 'ClassMethod') {
      const isIndexCallback =
        parent?.type === 'CallExpression' &&
        parent.arguments[0] === n &&
        parent.callee.type === 'MemberExpression' &&
        !parent.callee.computed &&
        INDEX_CALLBACKS.has(parent.callee.property.name);
      n.params.forEach((q: any, i: number) => patternNames(q, isIndexCallback && i === 1 && q.type === 'Identifier' ? NUMBER : UNKNOWN));
    } else if (n.type === 'CatchClause') patternNames(n.param, UNKNOWN);
    else if (n.type === 'AssignmentExpression') {
      if (n.left.type === 'Identifier') add(n.left.name, n.operator === '=' ? n.right : n.operator === '+=' ? {type: 'BinaryExpression', operator: '+', left: n.left, right: n.right} : NUMBER);
      else patternNames(n.left, UNKNOWN);
    } else if ((n.type === 'ForOfStatement' || n.type === 'ForInStatement') && n.left.type !== 'VariableDeclaration') patternNames(n.left, UNKNOWN);
    else if ((n.type === 'ForOfStatement' || n.type === 'ForInStatement') && n.left.type === 'VariableDeclaration') n.left.declarations.forEach((d: any) => patternNames(d.id, UNKNOWN));
  });

  const memo = new Map<string, boolean>();
  const nameIs = (name: string): boolean => {
    if (memo.has(name)) return memo.get(name)!;
    memo.set(name, false); // cycles count as not numeric
    const vs = sites.get(name);
    const ok = !!vs && vs.length > 0 && vs.every((v) => v !== UNKNOWN && is(v));
    memo.set(name, ok);
    return ok;
  };
  const is = (e: any): boolean => {
    if (!e) return false;
    switch (e.type) {
      case 'NumericLiteral':
        return true;
      case 'Identifier':
        return nameIs(e.name);
      case 'UnaryExpression':
        return ['-', '+', '~'].includes(e.operator);
      case 'UpdateExpression':
        return true;
      case 'BinaryExpression':
        return e.operator === '+' ? is(e.left) && is(e.right) : ['-', '*', '/', '%', '**', '|', '&', '^', '<<', '>>', '>>>'].includes(e.operator);
      case 'ConditionalExpression':
        return is(e.consequent) && is(e.alternate);
      case 'LogicalExpression':
        return is(e.left) && is(e.right);
      case 'TSAsExpression':
      case 'TSNonNullExpression':
      case 'ParenthesizedExpression':
        return is(e.expression);
      case 'MemberExpression':
        return !e.computed && e.property.name === 'length';
      case 'CallExpression': {
        const c = e.callee;
        if (c.type === 'Identifier') return NUMERIC_CALLS.has(c.name) || c.name === 'Number';
        return c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier' && c.object.name === 'Math';
      }
      default:
        return false;
    }
  };
  return {is, declared: new Set(sites.keys())};
}
