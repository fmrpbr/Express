const {test}=require('node:test');const assert=require('node:assert/strict');
const {phoneKey,fingerprint}=require('../../browser/phone-customers');
test('telefones com DDD e +55 são equivalentes sem colidir com DDD 55',()=>{
 assert.equal(phoneKey('(27) 99888-7766'),'5527998887766');assert.equal(phoneKey('+55 27 99888-7766'),'5527998887766');assert.equal(phoneKey('55 99988-7766'),'5555999887766');assert.equal(phoneKey('2733334444'),'552733334444');
 for(const bad of ['99999','+1 202 555 019999',null,'00000000000'])assert.equal(phoneKey(bad),null);
});
test('confirmação considera destinatário, cidade, referência e região da tarifa',()=>{const a={name:'A',street:'RUA',number:'1',neighborhood:'CENTRO',city:'ARACRUZ',reference:'',zone:''};for(const k of Object.keys(a))assert.notEqual(fingerprint(a),fingerprint({...a,[k]:'ALTERADO'}));});
