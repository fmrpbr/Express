# V2 — mapa atual de dados e acessos

Data da inspeção: 2026-11-14
Branch: `v2.0-testes-reais`
HEAD observado antes deste documento: `e7c2acfce43bffb91e5f885f874d42e689527b3d`

Este documento descreve o comportamento observado no código atual. Não representa a arquitetura aprovada nem autoriza publicação das regras.

## Arquivos inspecionados

- `www/index.html`
- `database.rules.json`
- `package.json`
- `firebase.json`
- `.github/workflows/build-android-apk.yml`

## Mapa dos caminhos atualmente usados pelo cliente

| Caminho RTDB | Uso observado no aplicativo | Risco / observação |
|---|---|---|
| `stores/{uid}` | Cadastro, identificação de papel, perfil, leitura administrativa e atualização | Leitura administrativa da coleção inteira; regras atuais descrevem `profiles/stores`, não este caminho |
| `couriers/{uid}` | Cadastro, identificação de papel, perfil e leitura administrativa | Leitura administrativa da coleção inteira; regras atuais descrevem `profiles/couriers` |
| `orders/{orderId}` | Listener de pedidos, criação, edição, propostas, aceite, cancelamento, etapas, retirada, conclusão, pagamento e GPS | Listener global para todos os papéis; várias gravações críticas são feitas diretamente pelo cliente |
| `publicTracking/{token}` | Escrita do resumo público e leitura pelo link de rastreamento | Leitura pontual; escrita direta pelo cliente; regra atual bloqueia escrita |
| `courierPresence/{uid}` | Registro, online/offline, ocupado, heartbeat e desconexão | Listener global; escrita pelo próprio motoboy; regra permite leitura a qualquer usuário autenticado |
| `alerts/{alertId}` | Publicação e consulta de alertas ativos | Consulta indexada por `expiresAt`; regras exigem campos e validade |
| `config/rates` | Leitura das taxas e atualização administrativa | Escrita depende de claim admin; código usa `role === admin` derivado da claim |
| `fcmTokens/{uid}/{tokenId}` | Registro de token Android | Escrita do próprio usuário; ainda sem serviço servidor de envio |
| `pushSubscriptions/{uid}/{subscriptionId}` | Inscrição Web Push | Não há regra correspondente identificada no arquivo atual; VAPID vazia |
| `.info/connected` | Estado de conexão para presença | Caminho reservado do RTDB, não é dado de negócio |

## Leituras/listeners observados

- `orders`: `onValue(ref(db, "orders"))`; o cliente baixa todos os pedidos e filtra por papel/UID localmente.
- `stores`: administrador escuta a coleção inteira; lojista escuta seu próprio registro.
- `couriers`: administrador escuta a coleção inteira; motoboy escuta seu próprio registro.
- `courierPresence`: todos os usuários autenticados recebem a coleção inteira.
- `alerts`: consulta por `expiresAt >= Date.now()`.
- `config/rates`: todos os usuários autenticados leem as taxas.
- `publicTracking/{token}`: tela pública faz uma leitura única com `get()`.

## Escritas observadas em pedidos

- Criar pedido/cotação: `push(orders)` + `set()`.
- Editar pedido/completar cotação: `update(orders/{id})`.
- Enviar proposta: `update(orders/{id}/bids/{courierUid})`.
- Aceitar proposta: `runTransaction(orders/{id})`.
- Aceitar corrida: `runTransaction(orders/{id})`.
- Cancelar sem custo: `runTransaction(orders/{id})`.
- Etapa roundtrip: `update(orders/{id})`.
- Confirmar retirada: `update(orders/{id})`.
- Concluir: `update(orders/{id})`.
- Retornar corrida para fila: `update(orders/{id})`.
- Confirmar pagamento: `update(orders/{id})`.
- Localização GPS: `update(orders/{id})`.
- Compartilhar rastreamento: transação para criar token em `orders/{id}`, seguida de escrita em `publicTracking/{token}`.

## Escritas observadas fora de pedidos

- Cadastro: `set(stores/{uid})` ou `set(couriers/{uid})`.
- Perfil da loja: `update(stores/{uid})`.
- Presença: `runTransaction`, `set`, `update` e `onDisconnect` em `courierPresence/{uid}`.
- Alertas: `push(alerts)` + `set()`.
- Taxas: `set(config/rates)`.
- Token FCM: `set(fcmTokens/{uid}/{tokenId})`.
- Web Push: `set(pushSubscriptions/{uid}/{subscriptionId})`.

## Incompatibilidades entre o app e as regras atuais

1. O app usa `stores/{uid}` e `couriers/{uid}`; as regras contêm proteção em `profiles/stores/{uid}` e `profiles/couriers/{uid}`.
2. O app faz leitura global de `orders`; as regras tentam autorizar cada `orders/{orderId}` por propriedade. Regras RTDB não filtram o resultado de uma leitura no nó pai.
3. O app grava diretamente em `orders` e `publicTracking`; as regras atuais negam essas gravações.
4. O app lê toda a presença em `courierPresence`; a regra permite leitura a qualquer usuário autenticado, expondo a presença global.
5. O app usa `pushSubscriptions`; não foi encontrada regra para esse caminho.
6. As regras incluem `storeOrders`, `courierOrders`, `availableOrders` e `quoteBoard`, mas o código atual inspecionado não os utiliza como fontes de leitura.
7. As regras negam escrita em perfis, índices e pedidos; o cadastro e o perfil ainda tentam escrever diretamente.

## Direção de correção proposta

1. Definir um contrato de dados único antes de alterar listeners ou regras.
2. Separar dados privados canônicos de índices de consulta.
3. Criar consultas específicas para cada papel, sem leitura global de pedidos ou presença.
4. Transferir para backend confiável as operações que alteram estado, atribuição, preço, pagamento, índices e rastreamento.
5. Fazer as regras negarem por padrão e liberar apenas leituras e escritas mínimas necessárias.
6. Criar testes no Emulator Suite para lojista A/B, motoboy A/B, administrador e visitante.
7. Adaptar o app ao contrato novo antes de publicar regras.

## Não realizado nesta etapa

- Nenhum código funcional foi alterado.
- Nenhuma regra foi publicada no Firebase.
- Nenhum deploy foi feito.
- Nenhum serviço pago foi ativado.
- Nenhum dado de produção foi acessado ou migrado.

## Próxima tarefa

Desenhar o contrato de dados alvo e a matriz de permissões por papel, relacionando cada tela e ação atual com sua consulta ou operação de servidor correspondente. Só depois iniciar a migração em alterações pequenas e testáveis.
