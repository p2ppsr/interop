from pathlib import Path
import json,shutil
r=Path.cwd();dst=r/'out/storage-sync-order-sdk-experiment';shutil.copytree(r/'out/storage-caller-known-inputs-sdk-source',dst)
report=json.loads((r/'out/source17-native-intake/original/repetition-2/evidence/conformance/portability.json').read_bytes());pairs=[]
for a in report['source']['provenTxReqs']:
 b=next(x for x in report['destination']['provenTxReqs']if x['txid']==a['txid'])
 if a.get('inputBEEF')!=b.get('inputBEEF'):pairs.append({'txid':a['txid'],'source':bytes(a['inputBEEF']).hex(),'destination':bytes(b['inputBEEF']).hex()})
assert len(pairs)==2;fixture=dst/'transaction/testdata/tpnil_native19_sync_order.json';fixture.parent.mkdir(exist_ok=True);fixture.write_text(json.dumps({'claim':'LAB_SELF_TEST_ONLY','originalRun':43411602601,'source':'3aac88975fc0f4e911fcf10fea6c8158f7760534','pairs':pairs},indent=2)+'\n')
(dst/'transaction/native_sync_order_tpnil_test.go').write_text('''// SPDX-License-Identifier: Apache-2.0
package transaction

import (
 "bytes"
 "encoding/hex"
 "encoding/json"
 "os"
 "sort"
 "testing"

 "github.com/bsv-blockchain/go-sdk/chainhash"
 "github.com/stretchr/testify/require"
)

// Exact public ancestry bytes from failed native19; no wallet or qualification
// is synthesized. Same graph exported by independent counterpart databases.
func TestNativeSyncOrderExactCapturedGraphs(t *testing.T) {
 raw, err := os.ReadFile("testdata/tpnil_native19_sync_order.json"); require.NoError(t, err)
 var f struct { Pairs []struct { TxID, Source, Destination string } }
 require.NoError(t, json.Unmarshal(raw, &f)); require.Len(t, f.Pairs, 2)
 for _, pair := range f.Pairs { t.Run(pair.TxID, func(t *testing.T) {
  fromHex := func(value string) *Beef { b, e := hex.DecodeString(value); require.NoError(t,e); beef,e:=NewBeefFromBytes(b);require.NoError(t,e);return beef }
  baseline:=fromHex(pair.Source); require.Len(t,baseline.Transactions,8)
  expected,err:=baseline.Bytes();require.NoError(t,err)
  for _, wire := range []string{pair.Source,pair.Destination} {
   for permutation:=0;permutation<128;permutation++ {
    b:=fromHex(wire); ids:=make([]chainhash.Hash,0,len(b.Transactions));for id:=range b.Transactions {ids=append(ids,id)}
    sort.Slice(ids,func(i,j int)bool{return ids[i].String()<ids[j].String()});if permutation%2==1{for i,j:=0,len(ids)-1;i<j;i,j=i+1,j-1{ids[i],ids[j]=ids[j],ids[i]}}
    reordered:=make(map[chainhash.Hash]*BeefTx,len(ids));for i:=range ids{id:=ids[(i+permutation)%len(ids)];reordered[id]=b.Transactions[id]};b.Transactions=reordered
    got,e:=b.Bytes();require.NoError(t,e);require.True(t,bytes.Equal(expected,got),"same captured graph must have exact bytes, independent of map order (permutation %d)",permutation)
    parsed,e:=NewBeefFromBytes(got);require.NoError(t,e);require.Equal(t,baseline.Version,parsed.Version);require.Equal(t,baseline.NewestTxID,parsed.NewestTxID);require.Len(t,parsed.Transactions,len(baseline.Transactions));require.Len(t,parsed.BUMPs,len(baseline.BUMPs))
    for id,original:=range baseline.Transactions {actual,ok:=parsed.Transactions[id];require.True(t,ok);require.Equal(t,original.DataFormat,actual.DataFormat);require.Equal(t,original.BumpIndex,actual.BumpIndex);if original.Transaction!=nil{require.Equal(t,original.Transaction.Bytes(),actual.Transaction.Bytes())}}
    for i,proof:=range baseline.BUMPs {require.Equal(t,proof.Bytes(),parsed.BUMPs[i].Bytes())}
   }
  }
 }) }
}
''')
print(dst)
