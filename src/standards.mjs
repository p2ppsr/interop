import fs from 'node:fs';
import path from 'node:path';
import { createDecipheriv, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const sha256 = bytes => createHash('sha256').update(bytes).digest();
const hex = bytes => Buffer.from(bytes).toString('hex');

function readFixture(root, relativePath) {
  const absolute = path.resolve(root, relativePath);
  if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error('Fixture path escapes repository');
  const bytes = fs.readFileSync(absolute);
  return { bytes, value: JSON.parse(bytes.toString('utf8')) };
}

function base58(bytes) {
  let value = BigInt(`0x${hex(bytes) || '0'}`);
  let encoded = '';
  while (value > 0n) {
    const remainder = Number(value % 58n);
    encoded = ALPHABET[remainder] + encoded;
    value /= 58n;
  }
  let leading = 0;
  while (leading < bytes.length && bytes[leading] === 0) leading++;
  return '1'.repeat(leading) + (encoded || (leading === 0 ? '1' : ''));
}

function uhrpIdentifier(digestHex) {
  const payload = Buffer.concat([Buffer.from('ce00', 'hex'), Buffer.from(digestHex, 'hex')]);
  const checksum = sha256(sha256(payload)).subarray(0, 4);
  return base58(Buffer.concat([payload, checksum]));
}

function materializeSource(source) {
  if (source.encoding === 'hex') return Buffer.from(source.value, 'hex');
  if (source.encoding === 'utf8') return Buffer.from(source.value, 'utf8');
  if (source.encoding === 'repeat') return Buffer.alloc(source.length, source.byte);
  throw new Error(`Unsupported CHIRP source encoding: ${source.encoding}`);
}

function verifyCHIRP(corpus) {
  if (corpus.standard !== 'BRC-167' || corpus.profile !== 1) throw new Error('Unexpected CHIRP corpus');
  let directVectors = 0;
  for (const vector of corpus.vectors) {
    const expected = vector.expected;
    if (vector.input.source) {
      const source = materializeSource(vector.input.source);
      if (String(source.length) !== expected.logicalLength) throw new Error(`${vector.id}: logical length mismatch`);
      if (hex(sha256(source)) !== expected.contentHash) throw new Error(`${vector.id}: content hash mismatch`);
    }
    if (expected.rootBytes) {
      directVectors++;
      const rootHash = hex(sha256(Buffer.from(expected.rootBytes, 'hex')));
      if (rootHash !== expected.rootHash) throw new Error(`${vector.id}: root hash mismatch`);
      if (uhrpIdentifier(rootHash) !== expected.rootIdentifier) throw new Error(`${vector.id}: root identifier mismatch`);
      if (expected.chirpURL !== `chirp://${expected.rootIdentifier}`) throw new Error(`${vector.id}: CHIRP URL mismatch`);
      if (expected.blobIdentifier && uhrpIdentifier(expected.contentHash) !== expected.blobIdentifier) {
        throw new Error(`${vector.id}: blob identifier mismatch`);
      }
    }
  }
  return { vectors: corpus.vectors.length, directlyRecomputed: directVectors };
}

function decryptRecord(recordHex, layout, keyHex) {
  const record = Buffer.from(recordHex, 'hex');
  if (record.length !== layout.length || record.length < 16) throw new Error('Invalid LCH record length');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), Buffer.from(layout.ivHex, 'hex'), { authTagLength: 16 });
  decipher.setAAD(Buffer.from(layout.aadHex, 'hex'));
  decipher.setAuthTag(record.subarray(-16));
  return Buffer.concat([decipher.update(record.subarray(0, -16)), decipher.final()]);
}

function verifyLCH(corpus) {
  if (corpus.formatVersion !== 1 || corpus.generatedWith?.lch !== '0.1.0') throw new Error('Unexpected LCH corpus');
  const vector = corpus.segmentedEncryption;
  const plaintext = Buffer.from(vector.plaintextHex, 'hex');
  const ciphertext = Buffer.from(vector.ciphertextHex, 'hex');
  if (plaintext.toString('utf8') !== vector.plaintextUtf8) throw new Error('LCH plaintext encoding mismatch');
  if (hex(sha256(plaintext)) !== vector.plaintextDigestHex) throw new Error('LCH plaintext digest mismatch');
  if (ciphertext.length !== vector.ciphertextLength || hex(sha256(ciphertext)) !== vector.ciphertextDigestHex) {
    throw new Error('LCH ciphertext mismatch');
  }

  const recovered = [];
  for (let i = 0; i < vector.recordsHex.length; i++) {
    const period = vector.descriptor.keyPeriods.find(p => i >= p.firstSegment && i < p.firstSegment + p.segmentCount);
    if (!period) throw new Error(`LCH segment ${i} has no key period`);
    const periodIndex = vector.descriptor.keyPeriods.indexOf(period);
    recovered.push(decryptRecord(vector.recordsHex[i], vector.recordLayout[i], vector.contentEncryptionKeysHex[periodIndex]));
  }
  if (hex(Buffer.concat(recovered)) !== vector.plaintextHex) throw new Error('LCH segmented decryption mismatch');
  const [start, end] = vector.selectedSegmentRange;
  if (hex(Buffer.concat(recovered.slice(start, end))) !== vector.selectedPlaintextHex) throw new Error('LCH selected range mismatch');

  const framing = corpus.framing;
  const header = Buffer.from(framing.headerCborHex, 'hex');
  const embedded = Buffer.from(framing.embeddedFileHex, 'hex');
  if (framing.magicHex !== '4c434801' || embedded.subarray(0, 4).toString('hex') !== framing.magicHex) throw new Error('LCH framing magic mismatch');
  const declaredLength = Number(embedded.readBigUInt64BE(4));
  if (declaredLength !== header.length || embedded.subarray(12, 12 + declaredLength).compare(header) !== 0) {
    throw new Error('LCH header framing mismatch');
  }
  const detached = Buffer.from(framing.prefixWithoutPayloadHex, 'hex');
  if (detached.subarray(12).compare(header) !== 0 || hex(sha256(detached)) !== framing.detachedHeaderSha256Hex || hex(sha256(embedded)) !== framing.embeddedFileSha256Hex) {
    throw new Error('LCH framing digest mismatch');
  }
  if (embedded.subarray(12 + declaredLength).compare(ciphertext) !== 0) throw new Error('LCH embedded ciphertext mismatch');

  for (const reference of corpus.referenceCases) {
    if (reference.result !== 'pass') throw new Error(`${reference.id}: reference case did not pass`);
    for (const check of reference.checks) {
      if (JSON.stringify(check.actual) !== JSON.stringify(check.expected)) throw new Error(`${reference.id}/${check.name}: expectation mismatch`);
    }
  }

  let authenticationRejections = 0;
  const layout = vector.recordLayout[2];
  const key = vector.contentEncryptionKeysHex[1];
  const mutations = [
    () => {
      const bytes = Buffer.from(vector.recordsHex[2], 'hex');
      bytes[0] ^= 1;
      return decryptRecord(bytes.toString('hex'), layout, key);
    },
    () => decryptRecord(vector.recordsHex[3], layout, key),
    () => {
      const changed = { ...layout, aadHex: `${layout.aadHex.slice(0, -2)}${layout.aadHex.endsWith('00') ? '01' : '00'}` };
      return decryptRecord(vector.recordsHex[2], changed, key);
    },
    () => {
      const shortened = Buffer.from(vector.recordsHex[2], 'hex').subarray(0, -1);
      return decryptRecord(shortened.toString('hex'), layout, key);
    }
  ];
  for (const mutate of mutations) {
    try { mutate(); }
    catch { authenticationRejections++; }
  }
  if (authenticationRejections !== vector.negative.length) throw new Error('LCH authentication negative-case mismatch');
  return {
    referenceCases: corpus.referenceCases.length,
    decryptedSegments: vector.recordsHex.length,
    authenticationRejections
  };
}

export function qualifyStandardFixtures(root = ROOT) {
  const resolvedRoot = path.resolve(root);
  const manifest = readFixture(resolvedRoot, 'fixtures/standards/manifest.json').value;
  const results = {};
  for (const fixture of manifest.fixtures) {
    const loaded = readFixture(resolvedRoot, fixture.path);
    const actual = hex(sha256(loaded.bytes));
    if (actual !== fixture.sha256) throw new Error(`${fixture.id}: source digest mismatch`);
    if (fixture.id === 'BRC-167-CHIRP-v1') results.chirp = verifyCHIRP(loaded.value);
    else if (fixture.id === 'BRC-170-LCH-v1') results.lch = verifyLCH(loaded.value);
    else throw new Error(`Unknown standards fixture: ${fixture.id}`);
  }
  return {
    designation: 'LAB_SELF_TEST_ONLY',
    outcome: 'PASS',
    fixtureCount: manifest.fixtures.length,
    results
  };
}
