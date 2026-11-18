import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {count,statistics,authorized} from '../src/worker.js';
function database(){
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE qr_daily(day TEXT PRIMARY KEY,count INTEGER NOT NULL); CREATE TABLE qr_total(id INTEGER PRIMARY KEY CHECK(id=1),count INTEGER NOT NULL,last_scan TEXT); INSERT INTO qr_total VALUES(1,33,NULL); INSERT INTO qr_daily VALUES(\'2026-11-15\',32);');
 sql.exec(readFileSync(new URL('../migrations/0001_events.sql',import.meta.url),'utf8'));
 return {sql,prepare(query){return {query,args:[],bind(...args){return {query,args}}}},async batch(statements){sql.exec('BEGIN');try{const result=statements.map(({query,args})=>({results:sql.prepare(query).all(...args)}));sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}};
}
test('real SQL keeps legacy discrepancy, uses Berlin midnight and pages tied timestamps',async()=>{
 const db=database();
 await count(db,new Date('2026-11-18T23:30:00Z'));
 let result=await statistics(db,{from:'2026-11-19',to:'2026-11-19'});
 assert.equal(result.total.count,34);assert.equal(result.dailySum,33);assert.equal(result.daily[0].day,'2026-11-19');assert.equal(result.events.length,1);
 const insert=db.sql.prepare('INSERT INTO qr_events VALUES(?,?,?)');
 for(let i=0;i<105;i++)insert.run(String(i).padStart(3,'0'),'2026-11-19T12:00:00.000Z','2026-11-19');
 result=await statistics(db,{from:'2026-11-19',to:'2026-11-19'});
 const second=await statistics(db,{from:'2026-11-19',to:'2026-11-19'},result.next);
 assert.equal(result.events.length,100);assert.equal(second.events.length,6);
 assert.equal(new Set([...result.events,...second.events].map(e=>e.id)).size,106);
 db.sql.close();
});
test('transaction rolls back event and day if total write fails',async()=>{
 const db=database();db.sql.exec("CREATE TRIGGER fail_total BEFORE UPDATE ON qr_total BEGIN SELECT RAISE(ABORT,'test failure'); END;");
 await assert.rejects(()=>count(db));
 assert.equal(db.sql.prepare('SELECT count(*) AS n FROM qr_events').get().n,0);
 assert.equal(db.sql.prepare('SELECT SUM(count) AS n FROM qr_daily').get().n,32);
 db.sql.close();
});
test('configured authentication rejects forged assertions',async()=>{
 const env={ACCESS_ISSUER:'https://soft-waterfall-7e74.cloudflareaccess.com',ACCESS_AUD:'configured',ALLOWED_EMAILS:'mail@svb-brueckers.de'};
 for(const token of ['', 'forged', 'eyJhbGciOiJub25lIn0.eyJlbWFpbCI6Im1haWxAc3ZiLWJydWVja2Vycy5kZSJ9.'])assert.equal(await authorized(new Request('https://svb-brueckers.de/statistik/api',{headers:{'Cf-Access-Jwt-Assertion':token}}),env),false);
});
