# Pedido por celular, somente no navegador

Implementação separada da versão Android 2.0.13. A compilação `build:browser` cria `browser-dist` e injeta o fluxo novo nesse diretório. O HTML em `www`, os recursos nativos, backend de pedidos, regras originais, versão e workflow do APK não foram alterados. Não executar publicação Android para essa atualização.

## Comportamento

- Telefone com DDD identifica o cliente; números nacionais e +55 são normalizados.
- Cada loja tem seu próprio cadastro no Firebase, consultado individualmente por telefone.
- Cliente conhecido exige confirmação explícita do endereço, ou edição.
- Edição permite usar outro endereço apenas nessa entrega, ou atualizar o cadastro.
- Cliente novo é salvo depois de o servidor confirmar o pedido.
- As gravações do pedido e do cadastro são separadas. Se o cadastro falhar, o pedido já criado não é reenviado e a interface informa a falha. Uma revisão impede sobrescrever cadastro atualizado por outra sessão.
- Trocar de número invalida a confirmação e limpa o endereço anterior. Respostas atrasadas da consulta são descartadas.
- Cotações mantêm o formulário reduzido. Completar uma cotação exige confirmar os dados.
- Não há importação automática dos antigos favoritos locais; evita vincular nomes/endereço incorretos a um telefone sem confirmação.

## Verificação

```sh
npm ci
npm ci --prefix functions
npm ci --prefix tests/firebase-rules
npm run build:browser
npx playwright install chromium
npm run check
npm test
node scripts/test-browser-phone.mjs
```

O último comando usa Firebase Auth e Database emulados e projeto `demo-`, sem gravar dados reais. Testa isolamento entre lojas, bloqueio de acesso, revisão concorrente, cadastro novo, confirmação obrigatória, recuperação em outra sessão e endereço temporário/permanente. Nenhum teste no Android real foi executado nesta alteração.

## Publicação isolada

Executar no Google Cloud Shell autenticado, dentro de uma cópia desta branch:

```sh
npm ci --prefix tests/firebase-rules
node scripts/deploy-browser-phone.mjs
```

O script usa exclusivamente `express-entregas-2-testes` e cria/utiliza o site separado `express-v2-web-fmrpbr`. O site de rastreamento e o endereço web antigo não são substituídos. A URL só estará ativa após a publicação concluir. Nenhum APK é gerado ou publicado. Não há implantação de Cloud Functions.

Antes de publicar, o script copia as regras REAIS do banco e a referência da versão anterior do site para `.browser-backups/<data>`. Mescla somente o novo ramo `storeCustomers` com as regras reais, preservando as demais permissões. Para se certificar da compatibilidade, as regras originais do repositório não foram modificadas.

O cadastro ficará compartilhado entre os navegadores da mesma loja; o APK antigo continuará criando pedidos normalmente e não consultará nem atualizará esse cadastro.

## Voltar atrás

Backup do código anterior: branch `backup/antes-pedido-celular-web-20261116`, commit `dfc24d61b2fa5c74c0598765138ff05defb75f59`.

O script informa o caminho exato do backup. Para restaurar:

```sh
node scripts/rollback-browser-phone.mjs .browser-backups/CAMINHO-INFORMADO
```

Se já existia uma versão no site novo, restaura aquela versão. Na primeira publicação, restaura a interface original 2.0.13 no site separado. Pedidos e cadastros não são apagados. As permissões adicionais do cadastro são preservadas, sem restaurar regras antigas por cima de mudanças posteriores. O backup das regras anteriores fica disponível para revisão manual, caso seja necessário remover especificamente esse ramo.

## Estado da entrega

Código e testes preparados. Publicação no Firebase depende da sessão autenticada do proprietário. O endereço publicado não deve ser anunciado como disponível antes de executar o script e conferir uma solicitação no ambiente real.

## Visão geral e avisos • web.2

Somente no navegador: um aviso do sistema em destaque até 3 minutos após a publicação; depois, na barra do topo até completar 4 horas, respeitando expirações menores. Novos avisos do mesmo assunto substituem os anteriores, sem ressuscitar avisos vencidos. Agendamentos futuros continuam na barra até a vigência. O histórico permanece na Central de Alertas; o estado atual das tarifas e da chuva continua em Tarifas e avisos. Avisos operacionais dos usuários mantêm sua validade original de 2 horas, e pendências financeiras continuam visíveis.

Preferências ficam recolhidas após os pedidos. Listas vazias são ocultas somente na visão geral; os contadores e as abas completas continuam disponíveis. A atividade recente mostra encerramentos, sem repetir pedidos ativos.

Backup anterior à organização: branch `backup/antes-organizar-avisos-web-20261116`, commit `3a78011b6457ab0dadc47400dced192e3573ff94`. Publicar com o mesmo script após atualizar esta branch. A publicação e reversão continuam restritas ao site do navegador, sem recompilar APK.
