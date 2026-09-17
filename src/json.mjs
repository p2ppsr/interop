import { createHash } from 'node:crypto';

export function canonical(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) throw new Error('Only safe integers are permitted');
    return String(value);
  }
  if (typeof value === 'string') {
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) {
        const next = value.charCodeAt(++i);
        if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error('Unpaired surrogate');
      } else if (c >= 0xdc00 && c <= 0xdfff) throw new Error('Unpaired surrogate');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${Array.from(value, canonical).join(',')}]`;
  if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return `{${Object.keys(value).sort().map(k => `${canonical(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  throw new Error('Value outside TPNIL-JSON-1');
}
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const hashJson = value => digest(canonical(value));
export const equal = (a, b) => canonical(a) === canonical(b);

// Strict control-document parser. Reject duplicate keys before they can be lost.
export function parseJson(bytes) {
  const s = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.from(bytes));
  let i = 0;
  const ws = () => { while (/[\x20\t\r\n]/.test(s[i] ?? '\0')) i++; };
  function str() {
    const start = i++;
    while (i < s.length) {
      if (s[i] === '\\') { i += 2; continue; }
      if (s[i++] === '"') return JSON.parse(s.slice(start, i));
    }
    throw new Error('Unterminated JSON string');
  }
  function value(depth = 0) {
    if (depth > 128) throw new Error('Control document nesting limit');
    ws();
    if (s[i] === '"') return str();
    if (s[i] === '{') {
      i++; ws(); const out = Object.create(null);
      if (s[i] === '}') { i++; return out; }
      while (i < s.length) {
        ws(); if (s[i] !== '"') throw new Error('Expected object key');
        const key = str(); ws();
        if (Object.hasOwn(out, key)) throw new Error(`Duplicate JSON key: ${key}`);
        if (s[i++] !== ':') throw new Error('Expected colon');
        out[key] = value(depth + 1); ws();
        const end = s[i++]; if (end === '}') return out;
        if (end !== ',') throw new Error('Expected object separator');
      }
    } else if (s[i] === '[') {
      i++; ws(); const out = [];
      if (s[i] === ']') { i++; return out; }
      while (i < s.length) {
        out.push(value(depth + 1)); ws();
        const end = s[i++]; if (end === ']') return out;
        if (end !== ',') throw new Error('Expected array separator');
      }
    } else {
      const m = /^(true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(s.slice(i));
      if (m) { i += m[0].length; return JSON.parse(m[0]); }
    }
    throw new Error('Invalid JSON');
  }
  const out = value(); ws();
  if (i !== s.length) throw new Error('Trailing JSON data');
  canonical(out); // Apply restricted numeric and Unicode rules.
  return out;
}

const keywords = new Set(['$schema', 'title', 'type', 'const', 'enum', 'properties', 'required', 'additionalProperties', 'items', 'minItems', 'minLength', 'pattern', 'minimum', 'maximum']);
export function validate(schema, value, at = '$') {
  for (const key of Object.keys(schema)) if (!keywords.has(key)) throw new Error(`Unsupported schema keyword ${key}`);
  const fail = msg => { throw new Error(`${at}: ${msg}`); };
  if (Object.hasOwn(schema, 'const') && !equal(value, schema.const)) fail('const mismatch');
  if (schema.enum && !schema.enum.some(v => equal(v, value))) fail('enum mismatch');
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (schema.type && !(schema.type === 'integer' ? Number.isSafeInteger(value) : type === schema.type)) fail(`expected ${schema.type}`);
  if (type === 'object') {
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) fail(`missing ${key}`);
    for (const key of Object.keys(value)) {
      if (Object.hasOwn(schema.properties ?? {}, key)) validate(schema.properties[key], value[key], `${at}.${key}`);
      else if (schema.additionalProperties === false) fail(`unexpected ${key}`);
    }
  }
  if (type === 'array') {
    if (value.length < (schema.minItems ?? 0)) fail('too few items');
    if (schema.items) value.forEach((item, n) => validate(schema.items, item, `${at}[${n}]`));
  }
  if (type === 'string') {
    if ([...value].length < (schema.minLength ?? 0)) fail('string too short');
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) fail('pattern mismatch');
  }
  if (type === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) fail('below minimum');
    if (schema.maximum !== undefined && value > schema.maximum) fail('above maximum');
  }
  canonical(value);
}
