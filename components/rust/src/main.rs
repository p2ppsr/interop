use bsv::primitives::{hash, private_key::PrivateKey, public_key::PublicKey, signature::Signature};
use bsv::transaction::{Beef, Transaction};
use bsv::script::{spend::{Spend, SpendParams}, locking_script::LockingScript, unlocking_script::UnlockingScript};
use serde_json::{json, Value};
use std::io::{self, Read};
use std::collections::{HashMap, HashSet};

fn s<'a>(v: &'a Value, key: &str) -> Result<&'a str, String> {
    v[key].as_str().ok_or_else(|| format!("Missing string: {key}"))
}
fn unique_inputs(tx: &Transaction) -> bool {
    let mut seen=HashSet::new();
    tx.inputs.iter().all(|input| seen.insert((input.source_txid.clone(),input.source_output_index)))
}
fn anchored_graph(tx: &Transaction, root: &str, height: u32, depth: usize, verified: &mut HashSet<String>, spent: &mut HashMap<(String,u32),String>) -> Result<bool,String> {
    if depth>64 { return Err("Ancestry depth exceeded".into()); }
    let txid=tx.id().map_err(|e|e.to_string())?;
    if verified.contains(&txid) { return Ok(true); }
    if !unique_inputs(tx) { return Ok(false); }
    if let Some(proof)=&tx.merkle_path {
        return Ok(proof.block_height==height && proof.compute_root(Some(&tx.id().map_err(|e|e.to_string())?)).map_err(|e|e.to_string())?==root);
    }
    if tx.inputs.is_empty() { return Ok(false); }
    let mut input_value=0u64;
    for (index,input) in tx.inputs.iter().enumerate() {
        let source=input.source_transaction.as_ref().ok_or("Unanchored missing ancestor")?;
        if !anchored_graph(source,root,height,depth+1,verified,spent)? { return Ok(false); }
        let source_id=source.id().map_err(|e|e.to_string())?;
        if input.source_txid.as_ref().is_some_and(|id|*id!=source_id) { return Ok(false); }
        let outpoint=(source_id.clone(),input.source_output_index);
        if let Some(owner)=spent.get(&outpoint) { if *owner!=txid { return Ok(false); } }
        spent.insert(outpoint,txid.clone());
        let output=source.outputs.get(input.source_output_index as usize).ok_or("Missing ancestor output")?;
        let value=output.satoshis.ok_or("Missing ancestor value")?;
        input_value=input_value.checked_add(value).ok_or("Ancestor input overflow")?;
        let mut spend=Spend::new(SpendParams {
            locking_script:output.locking_script.clone(),unlocking_script:input.unlocking_script.clone().ok_or("Missing ancestor signature")?,
            source_txid:source_id,source_output_index:input.source_output_index as usize,source_satoshis:value,
            transaction_version:tx.version,transaction_lock_time:tx.lock_time,transaction_sequence:input.sequence,
            other_inputs:tx.inputs.iter().enumerate().filter(|(i,_)|*i!=index).map(|(_,x)|x.clone()).collect(),
            other_outputs:tx.outputs.clone(),input_index:index
        });
        if !spend.validate().unwrap_or(false) { return Ok(false); }
    }
    let output_value=tx.outputs.iter().try_fold(0u64,|n,o|n.checked_add(o.satoshis.unwrap_or(0))).ok_or("Ancestor output overflow")?;
    if input_value<output_value { return Ok(false); }
    verified.insert(txid);
    Ok(true)
}
fn execute(v: &Value) -> Result<Value, String> {
    match s(v, "op")? {
        "hash" => Ok(json!({"sha256":hex::encode(hash::sha256(&hex::decode(s(v,"hex")?).map_err(|e|e.to_string())?))})),
        "key" => {
            let key=PrivateKey::from_hex(s(v,"privateKey")?).map_err(|e|e.to_string())?;
            let message=hex::decode(s(v,"message")?).map_err(|e|e.to_string())?;
            let sig=key.sign(&message, true).map_err(|e|e.to_string())?;
            Ok(json!({"publicKey":key.to_public_key().to_der_hex(),"signature":sig.to_hex()}))
        },
        "signature" => {
            let key=PublicKey::from_string(s(v,"publicKey")?).map_err(|e|e.to_string())?;
            let sig=Signature::from_hex(s(v,"signature")?).map_err(|e|e.to_string())?;
            Ok(json!({"valid":key.verify(&hex::decode(s(v,"message")?).map_err(|e|e.to_string())?,&sig).map_err(|e|e.to_string())?}))
        },
        "derive" => {
            let key=PrivateKey::from_hex(s(v,"privateKey")?).map_err(|e|e.to_string())?;
            let counterparty=PublicKey::from_string(s(v,"counterparty")?).map_err(|e|e.to_string())?;
            Ok(json!({"publicKey":key.derive_child(&counterparty,s(v,"invoice")?).map_err(|e|e.to_string())?.to_public_key().to_der_hex()}))
        },
        "derive-public" => {
            let key=PublicKey::from_string(s(v,"publicKey")?).map_err(|e|e.to_string())?;
            let anyone=PrivateKey::from_hex(&format!("{}01","00".repeat(31))).map_err(|e|e.to_string())?;
            Ok(json!({"publicKey":key.derive_child(&anyone,s(v,"invoice")?).map_err(|e|e.to_string())?.to_der_hex()}))
        },
        "transaction" => {
            let tx=Transaction::from_hex(s(v,"hex")?).map_err(|e|e.to_string())?;
            Ok(json!({"txid":tx.id().map_err(|e|e.to_string())?,"hex":tx.to_hex().map_err(|e|e.to_string())?,"outputs":tx.outputs.len()}))
        },
        "beef" => {
            let bytes=hex::decode(s(v,"hex")?).map_err(|e|e.to_string())?;
            let beef=Beef::from_binary_strict(&bytes).map_err(|e|e.to_string())?;
            let txid=s(v,"txid")?;
            let tx=beef.find_txid(txid).ok_or("Subject transaction absent")?;
            let root=beef.find_bump(txid).map(|b|b.compute_root(Some(txid))).transpose().map_err(|e|e.to_string())?;
            Ok(json!({"valid":beef.is_valid(false).map_err(|e|e.to_string())?,"atomic":beef.is_atomic(Some(txid)),"root":root,"txid":tx.txid}))
        },
        "script" => {
            let mut spend=Spend::new(SpendParams {
                locking_script:LockingScript::from_hex(s(v,"locking")?).map_err(|e|e.to_string())?,
                unlocking_script:UnlockingScript::from_hex(s(v,"unlocking")?).map_err(|e|e.to_string())?,
                source_txid:"00".repeat(32),source_output_index:0,source_satoshis:1,transaction_version:1,
                transaction_lock_time:0,transaction_sequence:u32::MAX,other_inputs:vec![],other_outputs:vec![],input_index:0
            });
            Ok(json!({"valid":spend.validate().unwrap_or(false)}))
        },
        "spends" => {
            let tx=Transaction::from_beef(s(v,"hex")?).map_err(|e|e.to_string())?;
            let mut valid=vec![];
            let mut inputs=0u64;
            for (index,input) in tx.inputs.iter().enumerate() {
                let source=input.source_transaction.as_ref().ok_or("Missing source transaction")?;
                let output=source.outputs.get(input.source_output_index as usize).ok_or("Missing source output")?;
                let satoshis=output.satoshis.ok_or("Missing source value")?;
                inputs=inputs.checked_add(satoshis).ok_or("Input overflow")?;
                let mut spend=Spend::new(SpendParams {
                    locking_script:output.locking_script.clone(),
                    unlocking_script:input.unlocking_script.clone().ok_or("Missing unlocking script")?,
                    source_txid:source.id().map_err(|e|e.to_string())?,
                    source_output_index:input.source_output_index as usize,source_satoshis:satoshis,
                    transaction_version:tx.version, transaction_lock_time:tx.lock_time,transaction_sequence:input.sequence,
                    other_inputs:tx.inputs.iter().enumerate().filter(|(i,_)|*i!=index).map(|(_,x)|x.clone()).collect(),
                    other_outputs:tx.outputs.clone(),input_index:index
                });
                valid.push(spend.validate().unwrap_or(false));
            }
            let outputs=tx.outputs.iter().try_fold(0u64,|total,o|total.checked_add(o.satoshis.unwrap_or(0))).ok_or("Output overflow")?;
            let anchored=if let Some(root)=v["merkleRoot"].as_str() {
                anchored_graph(&tx,root,v["height"].as_u64().ok_or("Missing anchor height")? as u32,0,&mut HashSet::new(),&mut HashMap::new())?
            } else { false };
            Ok(json!({"valid":unique_inputs(&tx) && !valid.is_empty() && valid.iter().all(|x|*x) && inputs>=outputs,"inputs":valid,"inputSatoshis":inputs,"outputSatoshis":outputs,"fee":inputs.checked_sub(outputs),"anchoredGraphValid":anchored}))
        },
        _=>Err("Unsupported operation".into())
    }
}
fn main() {
    let mut input=String::new(); io::stdin().take(16*1024*1024).read_to_string(&mut input).expect("stdin");
    let commands:Vec<Value>=serde_json::from_str(&input).expect("JSON command array");
    let output:Vec<Value>=commands.iter().map(|v| match execute(v) { Ok(result)=>json!({"ok":true,"result":result}),Err(error)=>json!({"ok":false,"error":error}) }).collect();
    println!("{}",serde_json::to_string(&output).unwrap());
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn repeated_outpoint_cannot_inflate_input_value() {
        let input=format!("{}0000000000ffffffff","11".repeat(32));
        let duplicate=Transaction::from_hex(&format!("0100000002{input}{input}010100000000000000015100000000")).unwrap();
        assert!(!unique_inputs(&duplicate));
        let different=input.replacen("0000000000ffffffff","0100000000ffffffff",1);
        let distinct=Transaction::from_hex(&format!("0100000002{input}{different}010100000000000000015100000000")).unwrap();
        assert!(unique_inputs(&distinct));
    }
}
