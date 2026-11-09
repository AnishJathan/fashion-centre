import {createServer} from 'node:http';
// Test-only API: no datastore, credentials, upstream transport or write endpoints.
const readiness={ready:false,connected:false,connections:[],blockers:['Authenticated brand-owner sign-in and brand membership are not configured.','Shopify app installation is not configured in browser tests.']};
createServer((req,res)=>{
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.writeHead(405);return res.end(JSON.stringify({error:'Test fixture rejects writes'}));}
 if(req.url==='/api/merchant/shopify/readiness')return res.end(JSON.stringify(readiness));
 if(req.url==='/api/integrations/shopify/status')return res.end(JSON.stringify({connected:false,shops:[{key:'mock',name:'Mock Shop'},{key:'apparel',name:'Elysian Thread'}]}));
 res.writeHead(404);res.end(JSON.stringify({error:'No fixture: mock this request explicitly in the test'}));
}).listen(8082,'127.0.0.1');
