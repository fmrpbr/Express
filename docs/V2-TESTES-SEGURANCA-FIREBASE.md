# Testes de segurança Firebase da V2

## Objetivo

A suíte compara a linha de base das regras atuais com um candidato de regras restritivas, sem publicar o candidato.

## Execução

O workflow `.github/workflows/security-rules-v2.yml` executa os testes no Firebase Emulator com o projeto fictício `demo-express-entregas-security`.

Os arquivos `security.rules.test.js` e `target.rules.test.js` testam, respectivamente, as regras atuais e o candidato `database.rules.candidate.json`.

## Direção de segurança do candidato

- Pedidos canônicos e índices são somente leitura para clientes.
- Lojistas consultam `storeOrders/{uid}`; motoboys consultam `courierOrders/{uid}`, `availableOrders` e `quoteBoard`.
- Presença é visível apenas a usuários com perfil de loja ou motoboy.
- Motoboy só altera a própria presença.
- Tokens FCM permanecem isolados por UID.
- Rastreamento continua acessível por token aleatório existente.
- Alertas são limitados a perfis cadastrados e não podem ser alterados após criação.
- Tarifas são somente leitura para clientes.

## Atenção antes de adotar

Este candidato é uma base de validação, não uma substituição pronta para produção. A aplicação ainda precisa ser adaptada para ler pelos índices em vez de escutar `orders` globalmente. Os índices, pedidos, cotações, perfis e rastreamento precisam ser escritos por backend confiável. Operações críticas de aceite, cancelamento, pagamento, expiração e distribuição de pedidos exigem validação transacional no servidor.

As regras de presença ainda permitem que o próprio motoboy altere online/busy. A semântica do campo `registered` e o futuro controle ON/OFF de trabalho devem ser alinhados ao contrato de dados antes da homologação.

## Segurança operacional

- Não publicar regras.
- Não executar deploy.
- Não migrar dados.
- Não configurar projeto real.
- Não ativar Blaze ou billing.
- Só considerar aprovado após resultado real do GitHub Actions.
