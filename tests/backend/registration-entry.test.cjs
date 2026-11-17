const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const html=fs.readFileSync('www/index.html','utf8');
const source=html.match(/<script id="registration-entry">([\s\S]*?)<\/script>/)[1];
function entry(search){
 const state={profile:'store',mode:'login',extra:{style:{display:'none'}},notes:[],authenticatedUid:'existing-user'};
 const window={location:{search},__expressUI:{selectLoginRole:p=>state.profile=p,setAuthTab:m=>state.mode=m}};
 const document={getElementById:id=>id==='field-extra'?state.extra:id==='auth-form'?{before:note=>state.notes.push(note)}:null,createElement:()=>({})};
 vm.runInNewContext(source,{window,document,URLSearchParams});return state;
}
test('link de lojista abre pré-cadastro existente e informa aprovação',()=>{const s=entry('?cadastro=lojista');assert.equal(s.profile,'store');assert.equal(s.mode,'register');assert.equal(s.extra.style.display,'grid');assert.match(s.notes[0].textContent,/Pré-cadastro de lojista.*aprovação do administrador/);});
test('link de motoboy seleciona perfil antes do carregamento do módulo Firebase',()=>{const s=entry('?cadastro=motoboy');assert.equal(s.profile,'courier');assert.equal(s.mode,'register');assert.equal(s.extra.style.display,'grid');assert.equal(s.notes[0].id,'registration-entry-note');});
test('acesso comum e parâmetros inválidos preservam o login padrão',()=>{for(const q of ['', '?cadastro=admin','?cadastro=motoboyX','?cadastro=','?cadastro=%3Cscript%3E']){const s=entry(q);assert.equal(s.profile,'store');assert.equal(s.mode,'login');assert.equal(s.notes.length,0);assert.equal(s.extra.style.display,'none');}});
test('links não encerram a sessão existente nem preenchem dados vindos da URL',()=>{const s=entry('?cadastro=motoboy&email=someone@example.test&admin=true');assert.equal(s.authenticatedUid,'existing-user');assert.equal(s.notes.length,1);assert.ok(!s.notes[0].textContent.includes('someone'));});
