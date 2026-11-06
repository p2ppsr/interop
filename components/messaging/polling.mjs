// SPDX-License-Identifier: Apache-2.0
/** Recipient-side live delivery for HTTP-only servers. Never delegates recipient keys. */
export function subscribeByPolling({ client, messageBox, host, onMessage, onError = () => {}, intervalMs = 500, maxRememberedIds = 10000 }) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 10 || !Number.isSafeInteger(maxRememberedIds) || maxRememberedIds < 1) throw new Error('Invalid polling bounds');
  let stopped = false, timer, active;
  const delivered = new Set();
  async function poll() {
    try {
      const messages = await client.listMessages({ messageBox, host });
      for (const message of messages) {
        if (stopped) break;
        if (delivered.has(message.messageId)) continue;
        if (delivered.size >= maxRememberedIds) throw new Error('Polling deduplication budget exhausted; acknowledge/reset explicitly');
        await onMessage(message);
        delivered.add(message.messageId);
      }
    } catch (error) { if (!stopped) await onError(error); }
    finally { if (!stopped) timer = setTimeout(() => { active = poll(); }, intervalMs); }
  }
  active = poll();
  return { async close() { stopped = true; clearTimeout(timer); await active; }, delivered };
}
