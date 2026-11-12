# Migração de segurança do Firebase

## Objetivo

Fechar o acesso público ao Realtime Database sem interromper o Express Entregas. Esta migração deve acontecer em etapas. **Não publicar regras novas antes de concluir a adaptação do aplicativo e validar cada perfil.**

## Diagnóstico confirmado no código atual

- Lojistas, motoboys e administradores escutam `orders` pela raiz.
- O filtro por loja ou motoboy é feito no JavaScript, depois que os dados já foram baixados.
- O rastreamento público lê `orders/{id}` sem autenticação.
- O link usa o ID sequencial/aleatório do pedido como único controle de acesso.
- O GPS grava coordenadas diretamente em `orders/{id}/location`.
- Criar conta permite ao cliente gravar o próprio perfil em `stores/{uid}` ou `couriers/{uid}`; o papel é inferido pela existência do perfil.
- Pagamento, aceite, cancelamento, retirada, conclusão, edição e taxas são gravados diretamente pelo cliente.
- O administrador é identificado por Custom Claim `admin: true`, mas as demais operações ainda não são protegidas por validação equivalente no servidor.

## Arquitetura de destino

O banco deve separar dados privados, listas de trabalho e dados públicos de rastreamento. A lista pública de corridas nunca deve conter telefone, nome do cliente, endereço completo ou coordenadas exatas.

### Estrutura proposta

```text
profiles/
  stores/{uid}
  couriers/{uid}

orders/{orderId}
  # Registro canônico privado. Escrita feita pelo backend.
  # Leitura individual autorizada para loja proprietária,
  # motoboy atribuído e administrador.

storeOrders/{storeUid}/{orderId}
  # Índice de pedidos da loja. Acesso somente ao próprio uid.

courierOrders/{courierUid}/{orderId}
  # Índice dos serviços atribuídos ao motoboy.

availableOrders/{orderId}
  # Cartão reduzido de corrida aberta, sem dados pessoais.
  # Leitura por motoboys autenticados.

quoteBoard/{orderId}
  # Cartão reduzido de cotação, com informação suficiente
  # para avaliar a proposta sem expor endereço completo ou telefone.

publicTracking/{token}
  # Somente status, código público, nome comercial da loja
  # e localização estritamente necessária ao rastreio.
  # Sem telefone, nome do cliente ou endereço residencial completo.

courierPresence/{courierUid}
  # Estado online, última atividade e disponibilidade.
  # Escrita pelo próprio motoboy; leitura autenticada conforme necessidade.

config/rates
  # Leitura para usuários autenticados.
  # Escrita exclusiva do administrador.
```

Os índices serão atualizados pelo backend junto com o pedido canônico. Não devem ser tratados como fonte definitiva de pagamento ou estado. A autorização sempre será validada contra o registro canônico.

## Operações que devem passar pelo backend

Criar funções autenticadas para:

- Criar e editar pedido.
- Publicar e cancelar cotação.
- Enviar e aceitar proposta.
- Aceitar corrida e reservar o motoboy.
- Confirmar retirada e concluir entrega.
- Cancelar corrida e devolver à fila correta.
- Confirmar acerto/pagamento.
- Atualizar localização do motoboy.
- Criar e renovar token de rastreamento.
- Atualizar presença e disponibilidade.
- Criar, confirmar, alterar e cancelar agendamentos.

Cada função deve verificar o usuário autenticado, o perfil real no banco, a propriedade do pedido, o estado atual e as regras de concorrência. O campo `role` enviado pelo navegador não é prova de permissão.

## Regras de autorização

- Loja: pode consultar e alterar somente o próprio perfil e seus pedidos.
- Motoboy: pode consultar o mural reduzido, suas propostas e os serviços atribuídos a ele.
- Administrador: acesso ampliado somente com Custom Claim `admin: true`.
- Visitante: não acessa pedidos privados. O rastreamento usa somente um token aleatório de alta entropia e dados minimizados.
- Nenhum usuário pode alterar diretamente `paid`, `courierId`, taxas, status ou índices canônicos por uma gravação arbitrária no cliente.
- Regras do Realtime Database não filtram automaticamente uma coleção inteira por proprietário. O aplicativo deve consultar caminhos separados por usuário e por finalidade.

## Plano de migração

### Etapa 1 — Preparação, sem alterar o Firebase
- [x] Auditar as leituras e gravações atuais.
- [x] Identificar caminhos e operações existentes.
- [x] Registrar a arquitetura de destino.
- [ ] Definir o contrato de dados dos índices e cartões públicos.
- [ ] Definir e implementar as funções de backend.
- [ ] Adaptar o aplicativo para consultar os novos caminhos.

### Etapa 2 — Implementação paralela
- Criar os novos caminhos e funções sem remover os caminhos atuais.
- Migrar os pedidos existentes para os índices, preservando IDs e histórico.
- Testar com contas separadas de loja, motoboy e administrador.
- Testar concorrência de aceite, proposta, cancelamento e pagamento.
- Criar rastreamento com token e testar sem autenticação.
- Confirmar que nenhum dado pessoal aparece nos cartões públicos.

### Etapa 3 — Regras restritivas
- Versionar as regras em `database.rules.json`.
- Testar as regras com o Firebase Local Emulator Suite.
- Validar leitura e gravação permitidas e negadas para cada perfil.
- Aplicar as regras somente após a versão compatível do aplicativo estar pronta e testada.
- Manter um plano de reversão que não reabra acesso público.

### Etapa 4 — Limpeza
- Remover listeners e gravações antigas.
- Remover o rastreamento baseado em `#track={orderId}`.
- Remover permissões temporárias e caminhos duplicados que não forem mais necessários.
- Monitorar erros de permissão e operações recusadas.

## Testes obrigatórios antes da publicação

1. Loja A não consegue ler pedidos da Loja B.
2. Motoboy não consegue ler telefone ou endereço completo de pedidos não atribuídos.
3. Motoboy A não consegue alterar pedido atribuído ao Motoboy B.
4. Usuário comum não consegue alterar taxas nem assumir papel de administrador.
5. Visitante não consegue consultar `orders/{id}`, mesmo conhecendo o ID.
6. Token de rastreamento permite somente os dados públicos previstos.
7. Duas tentativas simultâneas de aceitar a mesma corrida resultam em uma única contratação.
8. Uma proposta não pode ser aceita depois que a cotação mudou de estado.
9. Pagamento e cancelamento respeitam o estado e os participantes autorizados.
10. Lojista, motoboy e administrador continuam usando suas telas sem erros de permissão.

## Decisão de segurança

As regras atualmente abertas não devem ser substituídas por regras genéricas que liberem `orders` para qualquer usuário autenticado. Também não devem ser aplicadas regras de bloqueio total antes da migração, pois o aplicativo atual depende dos caminhos existentes.

**Este documento é um plano de implementação. Não é um arquivo de regras pronto para publicação e não altera o Firebase em produção.**
