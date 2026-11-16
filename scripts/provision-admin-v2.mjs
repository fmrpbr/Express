import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require=createRequire(import.meta.url);
const admin=require('../functions/node_modules/firebase-admin');
const project='express-entregas-2-testes';
process.env.GOOGLE_CLOUD_QUOTA_PROJECT=project;
const email='rp.rephone@gmail.com';
// Usa a sessão já autenticada do Cloud Shell. Nunca grava chave privada ou senha.
const credential={getAccessToken:async()=>({access_token:execFileSync('gcloud',['auth','print-access-token','--project',project],{encoding:'utf8',stdio:['ignore','pipe','inherit']}).trim(),expires_in:300})};
const app=admin.initializeApp({projectId:project,databaseURL:`https://${project}-default-rtdb.firebaseio.com`,credential});
try{
  let user;
  try{user=await app.auth().getUserByEmail(email);}catch(error){if(error.code!=='auth/user-not-found')throw error;user=await app.auth().createUser({email,disabled:false});}
  if(user.disabled)throw Error('Conta desativada. Revise o cadastro antes de conceder acesso.');
  await app.auth().setCustomUserClaims(user.uid,{...user.customClaims,admin:true});
  await app.database().ref('adminAccounts/'+user.uid).update({email,enabled:true,updatedAt:Date.now()});
  console.log('Acesso administrativo configurado para '+email+'. No APK, use Definir ou recuperar senha, confira o e-mail e entre como Administrador. Se já estava conectado, saia e entre novamente.');
}finally{await app.delete();}
