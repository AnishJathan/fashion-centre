import {readdir,readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
// Regression budgets for this small demo, not a production performance SLA.
const budgets={'.js':110_000,'.css':12_000};
const files=await readdir(new URL('../dist/assets/',import.meta.url));
for(const [extension,budget] of Object.entries(budgets)){
 const matches=files.filter(f=>f.endsWith(extension));
 if(!matches.length)throw Error(`No built ${extension} assets found; run npm run build first.`);
 const sizes=await Promise.all(matches.map(async f=>gzipSync(await readFile(new URL('../dist/assets/'+f,import.meta.url))).length));
 const bytes=sizes.reduce((a,b)=>a+b,0);
 console.log(JSON.stringify({assetType:extension,gzipBytes:bytes,budgetBytes:budget}));
 if(bytes>budget)throw Error(`Built ${extension} exceeds the reviewed gzip regression budget.`);
}
