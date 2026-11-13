// SPDX-License-Identifier: Apache-2.0
import {expect,it} from 'vitest'
import {selectActiveStorageSummary} from '../src/wallet-lab/native/coverage-completion/provider-summary-observer.js'
const allowed=[{id:'source',providerUrl:'https://wallet.1sat.app'},{id:'replacement',providerUrl:'https://replacement-wallet.itcve.test'}]
it('selects the active summary independently of backup-row badges and CSS casing',()=>{
  const selected=selectActiveStorageSummary('ACTIVE STORAGE\nSynced across devices\nREPLACEMENT-WALLET.ITCVE.TEST',['wallet.1sat.app\nBACKUP COPY'],allowed)
  expect(selected.id).toBe('replacement');expect(selected.candidates.every(row=>row.present)).toBe(true)
})
it.each([
 ['no summary','replacement-wallet.itcve.test',[]],
 ['local active store','Active Storage\nThis Browser',[]],
 ['foreign host','Active Storage\nreplacement-wallet.itcve.test.evil',[]],
 ['ambiguous hosts','Active Storage\nwallet.1sat.app\nreplacement-wallet.itcve.test',[]],
 ['duplicate heading','Active Storage\nActive Storage\nwallet.1sat.app',[]],
 ['duplicate provider','Active Storage\nwallet.1sat.app',['WALLET.1SAT.APP\nBackup copy']]
]as const)('rejects %s',(_name,summary,backups)=>{expect(()=>selectActiveStorageSummary(summary,[...backups],allowed)).toThrow()})
