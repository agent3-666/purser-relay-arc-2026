// Create NEW dedicated Arc mainnet keys only after separate human authorization.
// This script is never part of test setup and never reads a previous key.
import {mkdir,open,realpath,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {Wallet} from 'ethers';
import {fileURLToPath} from 'node:url';
const [flag,directory]=process.argv.slice(2);
if(flag!=='--create-new-dedicated-arc-mainnet-wallets'||!directory)throw Error('Explicit authorized creation flag and outside-repo directory required');
const repo=await realpath(resolve(dirname(fileURLToPath(import.meta.url)),'..'));
await mkdir(directory,{recursive:true,mode:0o700});const dir=await realpath(directory);
if(dir===repo||dir.startsWith(repo+'/')||((await stat(dir)).mode&0o077))throw Error('Use a private mode700 directory outside the repository');
const addresses:Record<string,string>={};
for(const role of ['owner','workerA','workerB','workerC','payee']){
 const wallet=Wallet.createRandom();const file=await open(resolve(dir,role+'.json'),'wx',0o600);
 try{await file.write(JSON.stringify({project:'purser-relay-arc',scope:'ARC_MAINNET_5042',createdAt:new Date().toISOString(),role,address:wallet.address,privateKey:wallet.privateKey})+'\n');await file.sync();}finally{await file.close();}
 addresses[role]=wallet.address;
}
const folder=await open(dir,'r');try{await folder.sync();}finally{await folder.close();}
console.log(JSON.stringify({chainId:5042,scope:'NEW_DEDICATED_MAINNET_ROLE_ADDRESSES',addresses,noBroadcast:true},null,2));
