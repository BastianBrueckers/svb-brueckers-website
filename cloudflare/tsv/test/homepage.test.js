import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyHomepage,trackerScript} from '../src/homepage-tracker.js';
import worker from '../src/worker.js';
test('homepage attribution excludes known campaigns, partners, internal navigation, reloads and frames',()=>{
 const base='https://svb-brueckers.de/';
 assert.equal(classifyHomepage(base,''),'direct');
 assert.equal(classifyHomepage(base,'https://www.google.de/search?q=Gutachter'),'google');
 assert.equal(classifyHomepage(base,'https://www.google.com/'),'google');
 assert.equal(classifyHomepage(base,'https://google.de.evil.com/'),'other');
 assert.equal(classifyHomepage(base,'https://example.com/'),'other');
 for(const query of ['?utm_source=qr_code','?utm_campaign=tsv','?utm_source=vivavoce','?utm_campaign=vivavoce_web'])assert.equal(classifyHomepage(base+query,''),null);
 for(const ref of [base+'leistungen/','https://www.svb-brueckers.de/','https://vivavoce-stuttgart.de/'])assert.equal(classifyHomepage(base,ref),null);
 for(const type of ['reload','back_forward'])assert.equal(classifyHomepage(base,'',type),null);
 assert.equal(classifyHomepage(base,'','navigate',false),null);assert.equal(classifyHomepage(base+'statistik/',''),null);
 new Function(trackerScript);
});
test('counter endpoint validates origin, landing page and bounded category; no public DB reads or arbitrary SQL',async()=>{
 let writes=0;const env={DB:{prepare(sql){return{bind(){return{sql}}}},async batch(s){writes++;assert.equal(s.length,3)}}};
 const req=(body={source:'google'},headers={})=>new Request('https://svb-brueckers.de/statistik/visit',{method:'POST',headers:{Origin:'https://svb-brueckers.de','Sec-Fetch-Site':'same-origin',Referer:'https://svb-brueckers.de/','Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 assert.equal((await worker.fetch(req(),env)).status,204);assert.equal(writes,1);
 assert.equal((await worker.fetch(req({}, {Origin:'https://evil.com'}),env)).status,403);
 assert.equal((await worker.fetch(req({}, {Referer:'https://svb-brueckers.de/?utm_campaign=tsv'}),env)).status,403);
 assert.equal((await worker.fetch(req({source:'DROP TABLE qr_total'}),env)).status,400);
 assert.equal((await worker.fetch(req({source:'direct',padding:'x'.repeat(300)}),env)).status,413);
 assert.equal((await worker.fetch(new Request('https://svb-brueckers.de/statistik/visit'),env)).status,405);assert.equal(writes,1);
 assert.equal((await worker.fetch(new Request('https://svb-brueckers.de/statistik/homepage-counter.js'),{})).status,200);
});
