import { Services, StorageClient, Wallet, WalletStorageManager } from '/Users/tyeverett/tmp/network-ops/worktrees/ty-everett/yours-wallet/codex/ghsa-5vmp-dependency-upgrade/node_modules/@bsv/wallet-toolbox-client/out/index.client.mjs'
// @ts-expect-error The exact pinned compiled SDK entrypoint has no adjacent declarations.
import { CachedKeyDeriver, PrivateKey } from '/Users/tyeverett/tmp/network-ops/worktrees/ty-everett/yours-wallet/codex/ghsa-5vmp-dependency-upgrade/node_modules/@bsv/sdk/dist/esm/mod.js'
export { StorageClient as CandidateStorageClient }
export async function createCandidateFixtureWallet(services:any,key:string,clientFactory=(wallet:any,endpoint:string)=>new StorageClient(wallet,endpoint)) {
 const keyDeriver=new CachedKeyDeriver(PrivateKey.fromHex(key)),storage=new WalletStorageManager(keyDeriver.identityKey),dependencies=new Services('main')
 const wallet=new Wallet({chain:'main',keyDeriver,storage,services:dependencies,actionBatchMode:'legacy'})
 await storage.addWalletStorageProvider(clientFactory(wallet,services.storageUrl));await storage.makeAvailable()
 dependencies.options.chainTracker={isValidRootForHeight:async(root:string,height:number)=>services.headers.get(height)?.merkleRoot===root,currentHeight:async()=>900100}
 dependencies.getHeight=async()=>900100
 dependencies.getHeaderForHeight=async(height:number)=>{const h=services.headers.get(height);if(!h)throw Error('Missing controlled header');const b=Buffer.alloc(80);b.writeInt32LE(h.version,0);Buffer.from(h.previousHash,'hex').reverse().copy(b,4);Buffer.from(h.merkleRoot,'hex').reverse().copy(b,36);b.writeUInt32LE(h.time,68);b.writeUInt32LE(h.bits,72);b.writeUInt32LE(h.nonce,76);return [...b]}
 dependencies.postBeef=async(beef:any,ids:string[])=>ids.map(txid=>{services.recordSubmission({txid,bytes:Uint8Array.from(beef.toBinaryAtomic(txid)),verdict:'ACCEPTED_BY_NETWORK'});return{name:'tpnil-controlled-submission',status:'success',txidResults:[{txid,status:'success'}]}})
 return wallet
}
