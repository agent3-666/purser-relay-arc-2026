// Structural checker only: DOES NOT prove factual quality or external delivery.
import {readFile} from 'node:fs/promises';import {keccak256,toUtf8Bytes} from 'ethers';
const base=new URL('../examples/',import.meta.url);
const files=await Promise.all(['request.json','report.json','acceptance-rule.json'].map(x=>readFile(new URL(x,base),'utf8')));
const [request,report,rule]=files.map(x=>JSON.parse(x));
if(report.schema!=='controlled-public-report/v1'||report.sourceUrl!==request.sourceUrl||report.sourceSha256!==request.sourceSha256||typeof report.observedAt!=='string')throw Error('Invalid report binding');
for(const k of ['chainId','rpc','explorer','nativeCurrency','nativeDecimals'])if(typeof report.facts?.[k]!=='string')throw Error('Missing field '+k);
if(rule.authority!=='owner'||rule.qualityOracle!==false)throw Error('Acceptance authority mismatch');
console.log(JSON.stringify({structuralCheck:'PASS',truthQualityVerified:false,requestHash:keccak256(toUtf8Bytes(files[0])),deliverableHash:keccak256(toUtf8Bytes(files[1])),acceptanceRuleHash:keccak256(toUtf8Bytes(files[2]))},null,2));
