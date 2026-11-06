// SPDX-License-Identifier: Apache-2.0
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { startOverlayNode, lookup } from '../../integrations/services/src/overlay.ts';

export async function loadMessageBoxDiscoveryPlugins(source) {
  const { default: Manager } = await import(pathToFileURL(path.join(source, 'src/topic-managers/MessageBoxTopicManager.ts')).href);
  const { default: makeLookup } = await import(pathToFileURL(path.join(source, 'src/lookup-services/MessageBoxLookupService.ts')).href);
  return { Manager, makeLookup };
}
/** Register the actual advertisement plugins in the actual Overlay Engine. */
export async function startMessageBoxDiscovery({ source, mongoUri, directory, name, tracker, log }) {
  const { Manager, makeLookup } = await loadMessageBoxDiscoveryPlugins(source);
  const instance = await startOverlayNode({ directory, name, mongoUri, tracker, log, controlledTopics: ['tm_messagebox'], configure(node) {
    node.configureTopicManager('tm_messagebox', new Manager());
    node.configureLookupService('ls_messagebox', makeLookup(node.mongoDb));
  }});
  const require = createRequire(new URL('../../integrations/services/package.json', import.meta.url));
  const { Transaction, PushDrop, Utils } = await import(pathToFileURL(require.resolve('@bsv/sdk')).href);
  return { ...instance, async resolve(identityKey) {
    const result = await lookup(instance.origin, 'ls_messagebox', { identityKey });
    return result.outputs.map(output => {
      const tx = Transaction.fromBEEF(output.beef), fields = PushDrop.decode(tx.outputs[output.outputIndex].lockingScript).fields;
      if (Utils.toHex(fields[0]) !== identityKey) throw new Error('Discovery output identity differs from question');
      return { host: Utils.toUTF8(fields[1]), txid: tx.id('hex'), outputIndex: output.outputIndex, beef: output.beef };
    });
  }};
}
