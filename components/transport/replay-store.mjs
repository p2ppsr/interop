import { DatabaseSync } from 'node:sqlite'

/** Atomic, crash-durable claims shared by local worker processes. The database
 * must be on a local filesystem supporting SQLite locking, never an NFS share. */
export class SQLitePaymentReplayStore {
  constructor(filename, { now = Date.now, maxEntries = 100_000 } = {}) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new RangeError('Invalid capacity')
    this.now = now
    this.maxEntries = maxEntries
    this.db = new DatabaseSync(filename)
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS payment_claims (txid TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS payment_expiry ON payment_claims(expires_at);`)
  }
  claim(txid, expiresAt) {
    const now = this.now()
    if (!/^[0-9a-f]{64}$/.test(txid)) throw new TypeError('Invalid transaction ID')
    if (![now, expiresAt].every(n => Number.isSafeInteger(n) && n >= 0) || expiresAt < now) {
      throw new RangeError('Invalid claim lifetime')
    }
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('DELETE FROM payment_claims WHERE expires_at < ?').run(now)
      if (this.db.prepare('SELECT txid FROM payment_claims WHERE txid=?').get(txid)) {
        this.db.exec('COMMIT'); return false
      }
      if (this.db.prepare('SELECT count(*) AS n FROM payment_claims').get().n >= this.maxEntries) {
        throw new Error('Replay-store capacity exceeded')
      }
      this.db.prepare('INSERT INTO payment_claims VALUES (?,?)').run(txid, expiresAt)
      this.db.exec('COMMIT'); return true
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  close() { this.db.close() }
}
