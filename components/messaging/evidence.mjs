// SPDX-License-Identifier: Apache-2.0
import { sha256 } from './identity.mjs';

/** Canonical JSON for the helper's JSON-only evidence: recursively sorted
 * object keys, ordered arrays, and safe integer numbers. This matches the
 * enclosing EvidenceBundle writer without depending on TypeScript loading.
 */
export function canonicalMessageEvidence(value) {
  function normalize(item) {
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return item;
    if (typeof item === 'number') {
      if (!Number.isSafeInteger(item) || Object.is(item, -0)) throw new TypeError('Canonical evidence numbers must be safe integers');
      return item;
    }
    if (Array.isArray(item)) return item.map(normalize);
    if (typeof item === 'object') return Object.fromEntries(Object.keys(item).sort().map(key => [key, normalize(item[key])]));
    throw new TypeError(`Unsupported canonical evidence value: ${typeof item}`);
  }
  return JSON.stringify(normalize(value));
}

export function messageEvidenceHash(value, encoding = 'canonical-json-v2') {
  if (encoding === 'canonical-json-v2') return sha256(canonicalMessageEvidence(value));
  // Preserve the historical insertion-order format exactly. In particular,
  // never reinterpret or repair a failed native archive under the newer rule.
  if (encoding === 'canonical-json') return sha256(JSON.stringify(value));
  throw new TypeError(`Unsupported messaging evidence encoding: ${encoding}`);
}
