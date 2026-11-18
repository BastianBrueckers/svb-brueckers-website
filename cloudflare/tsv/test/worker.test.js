import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker,{range,count} from '../src/worker.js';
import {dashboard} from '../src/dashboard.js';
test('private paths fail closed before touching D1',async()=>{
 for(const path of ['/statistik/','/statistik/api','/statistik/app.js']){
 const r=await worker.fetch(new Request('https://svb-brueckers.de'+path,{headers:{'Cf-Access-Jwt-Assertion':'forged'}}),{});
 assert.equal(r.status,403);assert.match(r.headers.get('Cache-Control'),/no-store/);
 }
});
test('dates validate real calendar days and order',()=>{
 assert.throws(()=>range(new URL('https://x?from=2026-02-30')));
 assert.throws(()=>range(new URL('https://x?from=2026-11-20&to=2026-11-01')));
 assert.equal(range(new URL('https://x?from=2026-01-01&to=2026-01-02')).from,'2026-01-01');
});
test('one awaited transaction writes all three values with Berlin day',async()=>{
 let statements;const db={prepare(sql){return {sql,bind(...args){return {sql,args}}}},async batch(s){statements=s}};
 await count(db,new Date('2026-11-18T23:30:00Z'));
 assert.equal(statements.length,3);assert.equal(statements[0].args[2],'2026-11-19');assert.equal(statements[1].args[0],'2026-11-19');
});
test('HEAD never counts; GET remains redirect even on database outage',async()=>{
 let calls=0;const env={DB:{prepare(){calls++;throw Error('offline')}}};
 assert.equal((await worker.fetch(new Request('https://svb-brueckers.de/qrcode_tsv',{method:'HEAD'}),env)).status,302);assert.equal(calls,0);
 const r=await worker.fetch(new Request('https://svb-brueckers.de/qrcode_tsv/'),env);assert.equal(r.status,302);assert.equal(calls,1);assert.match(r.headers.get('Location'),/utm_campaign=tsv/);
});
test('dashboard script parses',()=>{new Function(dashboard.js)});
test('VivaVoce paths redirect with separate attribution; HEAD and unknown paths never count',async()=>{
 let calls=0;const env={DB:{prepare(sql){return {sql,bind(...args){return {sql,args}}}},async batch(statements){calls++;assert.equal(statements.length,3);assert.ok(statements.every(s=>s.sql.includes('qr_vivavoce_')))}}};
 for(const path of ['/qr_vivavoce','/qr_vivavoce/','/qr_vivavoce/index.html']){
  const r=await worker.fetch(new Request('https://svb-brueckers.de'+path),env);assert.equal(r.status,302);assert.equal(r.headers.get('Location'),'https://svb-brueckers.de/?utm_source=qr_code&utm_medium=offline&utm_campaign=vivavoce');assert.match(r.headers.get('Cache-Control'),/no-store/);
 }
 assert.equal(calls,3);
 assert.equal((await worker.fetch(new Request('https://svb-brueckers.de/qr_vivavoce',{method:'HEAD'}),env)).status,302);
 assert.equal((await worker.fetch(new Request('https://svb-brueckers.de/qr_vivavoce/unknown'),env)).status,404);assert.equal(calls,3);
 assert.equal((await worker.fetch(new Request('https://svb-brueckers.de/statistik/api?campaign=vivavoce'),{})).status,403);
});
test('website link uses referral attribution and its own event tables',async()=>{
 let batches=0;const env={DB:{prepare(sql){return {sql,bind(...args){return {sql,args}}}},async batch(statements){batches++;assert.ok(statements.every(s=>s.sql.includes('click_vivavoce_')))}}};
 const url='https://svb-brueckers.de/klick_vivavoce';
 for(const path of ['', '/', '/index.html']){const r=await worker.fetch(new Request(url+path),env);assert.equal(r.status,302);assert.equal(r.headers.get('Location'),'https://svb-brueckers.de/?utm_source=vivavoce&utm_medium=referral&utm_campaign=vivavoce_web');}
 assert.equal(batches,3);assert.equal((await worker.fetch(new Request(url,{method:'HEAD'}),env)).status,302);assert.equal(batches,3);
 assert.equal((await worker.fetch(new Request('https://svb-brueckers.de/statistik/api?campaign=vivavoce_web'),{})).status,403);
});
