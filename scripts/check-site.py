"""Release guard: HTML must request the exact reviewed app/SDK, and ZIP must match."""
import pathlib,hashlib,zipfile,json,sys
r=pathlib.Path(__file__).resolve().parents[1]/'docs'
app=hashlib.sha256((r/'app.js').read_bytes()).hexdigest()[:16]
sdk=hashlib.sha256((r/'vendor/ethers.min.js').read_bytes()).hexdigest()[:16]
def check(s):
 assert f'src="app.js?v={app}"' in s,'Unversioned/stale application asset: publication blocked'
 assert f'src="vendor/ethers.min.js?v={sdk}"' in s,'Unversioned/stale wallet SDK: publication blocked'
for n in ['index.html','recovery.html']:check((r/n).read_text())
# Known-bad cached/unversioned source must be caught, not simply compared positively.
bad=(r/'index.html').read_text().replace(f'app.js?v={app}','app.js')
try:check(bad)
except AssertionError:pass
else:raise AssertionError('Cache guard missed its known bad control')
with zipfile.ZipFile(r/'recovery-kit.zip') as z:
 for n in ['recovery.html','app.js','styles.css','vendor/ethers.min.js','vendor/ethers-LICENSE.md','RECOVERY_KIT.txt']:
  assert z.read(n)==(r/n).read_bytes(),f'Stale offline kit entry: {n}'
 assert 'index.html' not in z.namelist(),'Recovery must not require main app'
print(json.dumps({'status':'PASS','knownBadUnversionedCaught':True,'appFingerprint':app,'sdkFingerprint':sdk,'offlineKitCurrent':True}))
