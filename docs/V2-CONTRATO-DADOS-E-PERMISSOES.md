# V2 — contrato de dados alvo e matriz de permissões

Status: proposta técnica para revisão e implementação gradual
Branch: v2.0-testes-reais
Base: mapa atual em docs/V2-MAPA-DADOS-E-ACESSOS.md

Este documento propõe a arquitetura de destino. Não altera o banco, não migra dados e não publica regras. Os nomes e campos abaixo são um contrato proposto, ainda sujeito aos testes de compatibilidade com todas as telas.

## 1. Princípios

1. orders/{orderId} é a fonte canônica de cada pedido.
2. O aplicativo não pode decidir sozinho quem recebe um pedido, qual valor foi contratado, se houve pagamento ou se uma corrida pode ser cancelada.
3. Não usar leitura global de pedidos, perfis ou presença no aplicativo comum.
4. Índices são projeções para consulta, não fontes independentes de verdade.
5. Dados pessoais e endereço completo só aparecem para a loja proprietária, o motoboy contratado e administradores autorizados.
6. A área pública de rastreamento contém apenas dados mínimos e usa token aleatório não previsível.
7. Toda mudança de estado importante é validada no servidor e registrada em histórico.
8. As regras Firebase negam por padrão; cada exceção deve ser justificada e testada.

## 2. Estrutura RTDB proposta

profiles/
  stores/{storeUid}/
  couriers/{courierUid}/
  admins/{adminUid}/                 # projeção opcional; claim continua sendo autoridade

orders/{orderId}/                    # registro canônico, acesso por servidor
orderEvents/{orderId}/{eventId}/     # histórico append-only, servidor
storeOrders/{storeUid}/{orderId}/    # projeção privada da loja
courierOrders/{courierUid}/{orderId}/# projeção privada do motoboy contratado
availableOrders/{orderId}/           # projeção mínima para fila aberta
quoteBoard/{orderId}/                # cotação sem dados pessoais
publicTracking/{token}/              # projeção pública mínima

courierPresence/{courierUid}/        # presença e disponibilidade do motoboy
alerts/{alertId}/                    # avisos operacionais com expiração
config/rates/                        # configuração de tarifas, leitura autenticada
fcmTokens/{uid}/{tokenKey}/          # tokens privados do próprio usuário
pushPreferences/{uid}/               # preferências privadas do próprio usuário
pushSubscriptions/{uid}/{key}/       # apenas se Web Push continuar habilitado

operationLocks/{key}/               # controle interno do servidor, não legível pelo app

Os nós de projeção devem ser atualizados em conjunto com o registro canônico por operação de servidor idempotente. Se a atualização de um índice falhar, o servidor deve reparar/reprocessar sem duplicar eventos ou notificações.

## 3. Campos e projeções

### 3.1 Pedido canônico

Manter os campos de negócio já utilizados: orderCode, storeId, storeName, storeAddress, serviceType, serviceDate, city, client, phone, clientStreet, clientNumber, clientNeighborhood, clientReference, address, paymentMethod, notes, selectedZone, bag, bank, fee, agreedFee, status, bids, courierId, courierName, assignedCourierId, accepted, picked, completed, durationMs, paid, rain, tripStage, location, trackingToken, created, quoteAcceptedAt.

Adicionar:
- schemaVersion: versão numérica do formato.
- updatedAt: timestamp do servidor.
- revision: contador crescente para controle de concorrência.
- createdBy: UID autenticado.
- lastActorUid: UID responsável pela última transição.
- lastEventId: referência ao evento mais recente.
- paymentStatus: pending, confirmed, disputed (a migração deve compatibilizar com o booleano legado paid).
- cancelledAt, cancelledBy, cancellationReason quando aplicável.
- trackingTokenVersion se a rotação de tokens for implementada.

O cliente não define livremente campos de servidor como IDs atribuídos, preço acordado, timestamps de transição, pagamento, histórico, revisão ou dados de rastreamento.

### 3.2 Índices

- storeOrders/{storeUid}/{orderId}: resumo completo necessário à própria loja, incluindo dados do cliente e endereço, sem dados de outros lojistas.
- courierOrders/{courierUid}/{orderId}: pedido completo apenas após atribuição ao motoboy.
- availableOrders/{orderId}: apenas pedidos open, com cidade/bairro, tipo de serviço, data, distância/zona necessária à decisão e dados mínimos para cotação. Sem nome, telefone, rua, número ou referência do cliente.
- quoteBoard/{orderId}: cotação especial com cidade, bairro, data, tipo e estado; sem dados pessoais. Propostas devem ter UID do motoboy e valor, sem expor dados privados do motoboy.
- publicTracking/{token}: código público, status, tipo de serviço, localização aproximada/necessária ao acompanhamento e horário da última atualização. Nunca incluir nome, telefone, endereço textual, valor, UID, notas ou dados de pagamento.

Os índices não devem permitir que um usuário altere diretamente campos de projeção.

## 4. Matriz de acesso proposta

| Recurso | Visitante | Lojista | Motoboy | Administrador |
|---|---|---|---|---|
| Perfil próprio | Não | Ler próprio | Ler próprio | Conforme suporte administrativo |
| Perfis de terceiros | Não | Não | Não | Consulta paginada e auditada |
| Pedido canônico | Não | Não direto | Não direto | Não direto pelo app |
| storeOrders/{uid} | Não | Ler somente UID próprio | Não | Leitura administrativa via servidor |
| courierOrders/{uid} | Não | Não | Ler somente UID próprio | Leitura administrativa via servidor |
| availableOrders | Não | Não | Ler projeção mínima se disponível para trabalhar | Via servidor |
| quoteBoard | Não | Ler cotações próprias por índice privado | Ler projeção sem dados pessoais | Via servidor |
| publicTracking/{token} | Ler somente token existente | Igual visitante | Igual visitante | Igual visitante |
| Presença individual | Não | Ler somente projeção operacional necessária | Ler somente projeção operacional necessária | Via servidor |
| Alertas ativos | Não | Ler e publicar conforme validação | Ler e publicar conforme validação | Ler e moderar via servidor |
| Tarifas | Não | Ler | Ler | Alterar via servidor |
| Token/preferências push | Não | Próprio | Próprio | Não |
| Histórico de eventos | Não | Pedido próprio | Pedido atribuído | Consulta auditada |

A leitura de presença deve expor somente online, availableForWork, busy e lastSeen, sem perfil ou localização detalhada. A disponibilidade para trabalhar é distinta do estado de conexão.

## 5. Operações que devem ser executadas no servidor

- Criar perfil e vincular o papel autorizado.
- Criar pedido ou cotação e gerar código/token.
- Editar pedido, verificando proprietário, estado e campos permitidos.
- Enviar proposta e validar limites/formato do valor.
- Aceitar proposta e reservar a atribuição em transação.
- Aceitar pedido aberto, impedindo dupla aceitação e respeitando disponibilidade.
- Completar dados de cotação contratada.
- Avançar etapas de recolha/entrega/roundtrip.
- Confirmar retirada e conclusão.
- Cancelar pedido e validar regra dos 25 minutos sem retirada.
- Confirmar pagamento, exigindo ator autorizado e preservando trilha de auditoria.
- Atualizar localização e projeção pública, validando motoboy atribuído e pedido em execução.
- Publicar/expirar alertas.
- Atualizar tarifas.
- Criar/atualizar índices, eventos e notificações de forma idempotente.

As operações devem validar o UID do token Firebase, o papel obtido de fonte confiável, a propriedade do pedido, o estado atual e a revisão. Nunca confiar em role, actor, storeId ou preço enviados sem validação pelo cliente.

## 6. Eventos e histórico

Cada transição relevante gera um evento imutável em orderEvents/{orderId}/{eventId}:
- eventId, orderId, type, actorUid, actorRole, createdAt (servidor), fromStatus, toStatus, revision, metadata mínima.

Não gravar telefone, endereço completo, token FCM ou credenciais em metadados de eventos. O cliente pode ler eventos apenas se tiver acesso ao pedido relacionado; nunca pode editar ou apagar eventos.

## 7. Disponibilidade e presença

Manter separados:
- online: conexão atual com o Firebase.
- availableForWork: escolha explícita do motoboy para receber novas corridas.
- busy: derivado no servidor de pedido ativo atribuído.

A fila availableOrders só pode ser lida quando availableForWork === true e o motoboy estiver elegível. A regra de segurança deve limitar acesso no nó do próprio motoboy; não confiar em filtro visual no app.

## 8. Migração compatível

1. Congelar o contrato legado como referência e criar fixtures sem dados pessoais reais.
2. Adicionar schemaVersion e normalizadores sem mudar a leitura atual.
3. Implementar operações de servidor em ambiente de teste e testar isoladamente.
4. Gerar projeções paralelas a partir dos pedidos legados, com reconciliação por ID e sem duplicação.
5. Alterar o app para ler os novos índices por papel, mantendo temporariamente fallback de leitura controlado somente no ambiente de teste.
6. Comparar contagens, estados, valores e IDs entre legado e projeções.
7. Rodar testes de autorização e concorrência.
8. Remover fallback legado somente após homologação funcional.
9. Publicar regras apenas após aprovação expressa e janela de migração definida.

Não executar migração de dados reais como parte desta etapa.

## 9. Testes obrigatórios no Emulator Suite

### Identidade e isolamento
- Lojista A não lê perfil, pedido, índice ou histórico do lojista B.
- Motoboy A não lê pedido atribuído ao motoboy B.
- Motoboy sem disponibilidade não acessa fila de novos pedidos.
- Visitante só lê rastreamento por token válido e não enumera pedidos.
- Usuário comum não obtém privilégio administrativo alterando dados locais ou escolhendo papel no formulário.

### Integridade de pedidos
- Dois motoboys aceitando o mesmo pedido: apenas um sucesso.
- Duas lojas tentando aceitar a mesma proposta: apenas uma transição válida.
- Usuário não autorizado não muda preço, pagamento, loja, motoboy, estado ou timestamps.
- Cancelamento após 25 minutos só ocorre se ainda não houve retirada e o estado continua elegível.
- Etapas roundtrip só avançam na ordem correta.
- Conclusão e pagamento não podem ser repetidos para gerar eventos duplicados.

### Projeções e privacidade
- Falha na atualização de índice pode ser reparada sem duplicar evento.
- availableOrders e quoteBoard não contêm dados pessoais.
- publicTracking não contém informações privadas.
- Token FCM e preferências são privados ao UID dono.

### Operação
- Alertas respeitam limite de texto e expiração.
- Presença online/offline não altera automaticamente availableForWork.
- Repetição da mesma chamada de servidor não duplica pedido, evento ou notificação.

## 10. Dependências e limites de custo

A escolha do produto Firebase e o custo devem ser avaliados antes de implementar backend gerenciado. Cloud Functions e agendamentos podem exigir plano Blaze e configuração de faturamento. Não ativar Blaze, criar recursos faturáveis ou implantar funções sem autorização explícita.

Enquanto a decisão de backend não for aprovada, limitar o trabalho a:
- desenho de contrato;
- testes locais e Emulator Suite;
- refatoração sem publicação;
- estimativa de custo e alternativas de execução.

Não prometer push agendado ou operações confiáveis no servidor sem backend ativo.

## 11. Decisões pendentes antes da implementação

1. Confirmar se a V2 terá backend Firebase Functions/Cloud Run (com análise de custo e aprovação) ou outro backend já disponível.
2. Definir se o painel administrativo terá acesso a dados pessoais por padrão ou apenas por consultas auditadas.
3. Definir a política de retenção dos pedidos, eventos, localização e rastreamento.
4. Confirmar quais campos de endereço são necessários ao motoboy antes de aceitar a corrida.
5. Definir se pagamento será confirmação manual bilateral ou integração futura com provedor.

Até essas decisões serem tomadas, manter este documento como proposta, não como especificação final aprovada.
