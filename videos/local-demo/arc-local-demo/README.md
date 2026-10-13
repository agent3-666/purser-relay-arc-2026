# Purser Relay on Arc — recorded local evidence

Editable HyperFrames composition. Four chapters, 60 seconds, 1920×1080 at 30 fps, silent by design.

This film explains this project's actual local acceptance run. It is not a live UI capture, and the matching chain ID does not make a local run Arc mainnet. Mainnet deployment and a real funded lifecycle were pending at the time of this recording.

## Evidence

`evidence/verified-local-summary.json` contains the extracted local receipt states, short transaction references displayed in the film, test/mutation counts and SHA256 provenance. The exact frozen local receipt file is included as `evidence/local-run-frozen.json`; its SHA256 is recorded in the summary. The film shows independent payee claim and owner refund after discarding the worker journal, 23 passing Solidity tests, and six deliberately broken contract versions caught by tests.

The final local cold-recovery run uses ethers 6.17.0. Request and report hashes bind the actual example JSON files. Structural schema checks do not verify content truth or quality.

## Reproduce

Requires Node.js 22 or newer and the HyperFrames local renderer dependencies.

```
npm ci
npm run check
npm run render -- --quality delivery --fps 30 --output arc-local-engineering-demo.mp4
```

`index.html` mounts four scene compositions. `assets/gsap.min.js` is bundled locally; rendering does not require asset fetching. GSAP remains under its own standard no-charge license, with the upstream copyright notice retained.
