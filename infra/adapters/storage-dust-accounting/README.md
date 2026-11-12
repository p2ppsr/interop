# Prospective discarded-change accounting correction

This immutable child of `storage-batch-subjects` corrects a real Go storage balance-accounting defect. It does not change the historical native-contract layer, batch parent, native observations, or the signed-net interpretation dispute in the pinned standard.

The funder's `prepareResult` removed outputs when change was below the dust floor, but still returned the discarded positive `ChangeAmount` and the rate-estimated fee. `CreateAction` persists a transaction's net wallet change as emitted change minus allocated inputs. The nonexistent change therefore understated the debit reported through `listActions` and consumed by wallet spending allowances.

The retained pre-fix regression uses one 50-satoshi input and a 13-satoshi recipient. There is no change output: actual miner fee is 37, and wallet debit is 50. The unchanged parent instead stored −36, crediting 14 nonexistent satoshis. A 1,000-satoshi case with real change provides the unaffected control. Logs are under `out/storage-dust-accounting-review` and are engineering evidence, not native qualification.

The correction leaves coin selection, dust threshold, output count, signing and broadcast behavior unchanged. When positive change is discarded, the returned change is zero and the returned actual fee includes that remainder. It does not mutate the collector's estimated fee, so repeated `GetResult` calls cannot add dust twice. The existing `CreateAction` accounting then records the actual net debit without clamping, taking an absolute value, or losing signed history.

Tests cover value conservation across fee rates and input amounts, underfunded rejection, repeatable results, actual SQLite allocation, authenticated action history, and cross-user rejection. The inherited tests that explicitly expected phantom change now assert zero emitted change and the actual miner fee; tests with real change retain their rate-based fee assertion. Full inherited storage, services, RPC, validation and mapping suites are run by `node scripts/prepare-storage-dust-accounting-go.mjs`.

The separate binary is `out/itcve-go-storage-dust-accounting`, with manifest schema `tpnil-storage-dust-accounting-go-build@1.0.0`. It retains the batch parent's one-process v2 output observer and records all patch ancestry, generated host source and build inputs. Admission is explicit and prospective; older native profiles cannot select this layer.
