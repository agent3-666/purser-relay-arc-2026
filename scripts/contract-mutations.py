import pathlib, tempfile, shutil, subprocess, json, hashlib, sys
root=pathlib.Path(__file__).resolve().parents[1]; candidate=root
source=(candidate/'contracts/PurserRelayArc.sol').read_text()
arc='--arc' in sys.argv
forge='arc-forge' if arc else 'forge'
prefix='arc-' if arc else ''
mutations=[
 ('no-intent-uniqueness','if (orders[id].status != Status.None) revert DuplicateIntent();','// MUTANT removed intent guard','testDuplicateIntentPositiveFutureDeadline'),
 ('no-worker-authorization','if (msg.sender != o.workerA && msg.sender != o.workerB) revert Unauthorized();','// MUTANT removed worker guard','testUnauthorizedWorker'),
 ('approved-clawback','if (o.status != Status.Funded && o.status != Status.Submitted) revert WrongState();','if (o.status != Status.Funded && o.status != Status.Submitted && o.status != Status.Approved) revert WrongState();','testApprovedCannotRefund'),
 ('repeated-claim','o.status = Status.Claimed;','// MUTANT no terminal state','testRepeatedClaimRejected'),
 ('native-six-decimal-truncation','uint256 amount = o.credit;','uint256 amount = (o.credit / 1e12) * 1e12;','testNative18SubMicroAmountPreserved'),
 ('no-epoch-guard','if (epoch != o.authorityEpoch) revert EpochMismatch();','// MUTANT no epoch guard','testReplacementRejectsLateAndOldEpoch'),
]
results=[]
for name,old,new,test in mutations:
 assert old in source
 with tempfile.TemporaryDirectory(prefix='arc-mutation-') as tmp:
  p=pathlib.Path(tmp);(p/'contracts').mkdir();(p/'test').mkdir()
  (p/'contracts/PurserRelayArc.sol').write_text(source.replace(old,new))
  shutil.copy(candidate/'test/RelayArc.t.sol',p/'test/RelayArc.t.sol');shutil.copy(candidate/'foundry.toml',p/'foundry.toml')
  proc=subprocess.run([forge,'test',*(['--network','arc'] if arc else []),'--match-test',test,'-vv'],cwd=p,capture_output=True,text=True)
  log=(proc.stdout+proc.stderr).replace(tmp,'<TEMP>')
  (root/'evidence'/f'{prefix}mutation-{name}.txt').write_text(log)
  killed=proc.returncode!=0 and '[FAIL' in log and 'Compiler run successful' in log
  results.append(dict(name=name,test=test,exitCode=proc.returncode,killed=killed,sourceSha256=hashlib.sha256((p/'contracts/PurserRelayArc.sol').read_bytes()).hexdigest(),log=f'{prefix}mutation-{name}.txt'))
(root/f'evidence/{prefix}contract-mutations.json').write_text(json.dumps(dict(baseSha256=hashlib.sha256(source.encode()).hexdigest(),results=results),indent=2)+'\n')
print(json.dumps(results,indent=2));assert all(x['killed'] for x in results)
