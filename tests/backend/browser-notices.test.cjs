const {test}=require('node:test');
const assert=require('node:assert/strict');
const {select,SPOTLIGHT,LIFETIME}=require('../../browser/notice-policy');
const NOW=1800000000000;
const n=(id,age=0,extra={})=>({id,title:id,body:'AVISO',createdAt:NOW-age,expiresAt:NOW+86400000,...extra});
test('destaque por 3 minutos, depois barra, e encerramento em 4 horas, sem reiniciar ao abrir',()=>{
  const item=n('tariff_active_a');
  assert.equal(select([item],NOW+SPOTLIGHT-1).spotlight,item);
  assert.equal(select([item],NOW+SPOTLIGHT).spotlight,null);
  assert.deepEqual(select([item],NOW+SPOTLIGHT).ticker,[item]);
  assert.equal(select([item],NOW+LIFETIME).ticker.length,0);
  assert.equal(select([item],NOW+LIFETIME).history.length,1);
});
test('chuva e tarifa substituem somente o próprio assunto; aviso encerrado não ressuscita anterior',()=>{
  const rainOld=n('rain_active_old',10000),rainNew=n('rain_active_new',1000,{expiresAt:NOW-1});
  const tariff=n('tariff_active_a',SPOTLIGHT);
  assert.deepEqual(select([rainOld,rainNew,tariff],NOW).ticker,[tariff]);
  assert.equal(select([rainOld,rainNew],NOW).spotlight,null);
});
test('no máximo um destaque; outros assuntos entram na barra; agendamento fica até a vigência',()=>{
  const a=n('rain_active_a',1000),b=n('tariff_active_b',2000);
  const result=select([a,b],NOW);assert.equal(result.spotlight,a);assert.deepEqual(result.ticker,[b]);
  const scheduled=n('tariff_scheduled_a',LIFETIME+1,{expiresAt:NOW+60000});
  assert.deepEqual(select([scheduled],NOW).ticker,[scheduled]);
  assert.equal(select([scheduled],NOW+60000).ticker.length,0);
});
test('expiração original é respeitada, entradas futuras ou sem data não são divulgadas',()=>{
  assert.equal(select([n('a',SPOTLIGHT,{expiresAt:NOW-1}),n('b',-1000),n('c',1,{createdAt:NaN})],NOW).ticker.length,0);
});
test('texto de aviso sem identificador agrupa ativação e desativação de chuva',()=>{
  const a=n('',1000,{title:'TAXA DIA DE CHUVA ATIVADA'}),b=n('',0,{title:'Taxa de chuva desativada'});
  assert.equal(select([a,b],NOW).spotlight,b);
});
