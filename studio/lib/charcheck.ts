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
        if (/https?:|\/\/|javascript:|data:/i.test(v)) errors.push('links and URLs are not allowed in character code');
        if (BANNED_ANYWHERE.has(v)) errors.push(`"${v}" is not allowed`);
        break;
      }
      case 'MemberExpression':
      case 'OptionalMemberExpression':
        if (n.computed && n.property.type !== 'NumericLiteral' && n.property.type !== 'Identifier' && n.property.type !== 'BinaryExpression') {
          errors.push('computed property access like obj["x"] is not allowed');
        }
        if (n.computed && n.property.type === 'BinaryExpression' && containsString(n.property)) errors.push('building property names from strings is not allowed');
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
          if (a.type === 'JSXSpreadAttribute') continue;
          const an = a.name.type === 'JSXNamespacedName' ? `${a.name.namespace.name}:${a.name.name.name}` : a.name.name;
          if (BANNED_ATTRS.test(an)) errors.push(`attribute "${an}" is not allowed`);
        }
        break;
      }
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

function containsString(n: any): boolean {
  if (!n || typeof n !== 'object') return false;
  if (n.type === 'StringLiteral' || n.type === 'TemplateLiteral') return true;
  return containsString(n.left) || containsString(n.right);
}
