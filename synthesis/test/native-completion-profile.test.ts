// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs'
import { expect, it } from 'vitest'
import { nativeCompletionProfile, permissionCoverageEvidenceForCompletion } from '../src/wallet-lab/native/completion-profile.js'
import { selectedCoverageExtensionPolicy } from '../src/wallet-lab/native/coverage-extension-model.js'
import { selectedBasketPolicy } from '../src/wallet-lab/native/coverage-completion/baskets-model.js'
for (const [profile, program, extension, basket] of [['ITCVE-1@4.5.0', 'ISI-4@5.5.0', 2, 1], ['ITCVE-1@4.6.0', 'ISI-4@5.6.0', 3, 1], ['ITCVE-1@4.7.0', 'ISI-4@5.7.0', 4, 2], ['ITCVE-1@4.8.0', 'ISI-4@5.8.0', 4, 3]] as const) it(`binds capture and independent completion children to exact ${profile} criteria`, () => {
  const selected = nativeCompletionProfile(profile), manifest = JSON.parse(fs.readFileSync(new URL(`../../${selected.manifest}`, import.meta.url), 'utf8'))
  expect(manifest.program).toBe(program); expect(manifest.version).toBe(profile.split('@')[1]); expect(selected.program).toBe(program)
  expect(selected.extensionRevision).toBe(extension); expect(selected.basketRevision).toBe(basket)
  for(const [name,module] of Object.entries(manifest.nativeConformance.coverageModules) as Array<[string,any]>){const policy=JSON.parse(fs.readFileSync(new URL(`../../${module.manifest}`,import.meta.url),'utf8'));expect(module.oracle).toBe(policy.oracle);expect(module.assertions).toBe(module.assertionIds.length);const ids=policy.assertionIds??policy.variantIds??policy.assertions.map((id:string)=>name==='certificates'?`coverage-certificates.${id}`:id);expect(module.assertionIds).toEqual(ids)}
  expect(manifest.nativeConformance.coverageModules.extension.oracle).toBe(`tpnil-native-coverage-extension-oracle@${extension}.0.0`)
  expect(selectedCoverageExtensionPolicy(`tpnil-native-coverage-extension-oracle@${extension}.0.0`).policy.oracle).toBe(`tpnil-native-coverage-extension-oracle@${extension}.0.0`)
  expect(selectedBasketPolicy(selected.basketRevision).policy.schema).toBe(`tpnil-native-basket-boundaries-policy@${basket}.0.0`)
})
it('rejects a child oracle masquerading as a parent profile', () => { expect(() => nativeCompletionProfile('tpnil-native-coverage-extension-oracle@4.0.0')).toThrow(); expect(() => nativeCompletionProfile('ITCVE-1@4.9.0')).toThrow() })


it('projects the permission prefix only from the complete declared completion chain', () => {
  const value = { schema:'tpnil-native-browser-contexts@1', contexts:Array.from({length:9}, (_,sequence)=>({sequence, marker:`context-${sequence}`})) }
  const bytes=Buffer.from(JSON.stringify(value)),read=(name:string)=>name==='native-browser-contexts.json'?bytes:Buffer.from('other evidence')
  const scoped=permissionCoverageEvidenceForCompletion(read,'ITCVE-1@4.8.0')
  expect(JSON.parse(scoped('native-browser-contexts.json').toString()).contexts).toEqual(value.contexts.slice(0,5))
  expect(bytes.toString()).toBe(JSON.stringify(value));expect(scoped('other').toString()).toBe('other evidence')
  for(const contexts of[value.contexts.slice(0,5),value.contexts.slice(0,8),[...value.contexts,{sequence:9}],value.contexts.map((row,index)=>index===8?{...row,sequence:7}:row)]) {
    expect(()=>permissionCoverageEvidenceForCompletion(()=>Buffer.from(JSON.stringify({...value,contexts})),'ITCVE-1@4.8.0')('native-browser-contexts.json')).toThrow()
  }
})
