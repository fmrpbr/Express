# V3 — arquitetura alvo

## Visão geral

```text
Aplicativo Android/Web
        |
        v
Firebase Authentication + App Check
        |
        v
Backend confiável (Cloud Functions 2ª geração ou Cloud Run)
        |
        +---- Realtime Database: pedidos e índices
        +---- Cloud Storage: comprovantes
        +---- Firebase Cloud Messaging: push
        +---- Logs e auditoria
        |
        v
Monitoramento, backup e recuperação
```

O cliente não deve decidir sozinho se um pagamento foi confirmado, se uma corrida pode ser aceita ou se um usuário pode alterar dados de outro participante.

## Componentes

### Authentication
- Identidade por UID.
- Perfil e papel validados no servidor.
- Claims administrativas atribuídas somente por processo administrativo confiável.
- Não confiar em `role`, `storeId` ou `courierId` enviados livremente pelo cliente.

### App Check
- Ativar primeiro em modo de monitoramento.
- Validar Android e Web separadamente.
- Observar tráfego legítimo antes de exigir tokens.
- Não confundir App Check com autenticação ou autorização.

### Realtime Database

Estrutura de referência:

```text
profiles/
  stores/{storeUid}
  couriers/{courierUid}

orders/{orderId}
storeOrders/{storeUid}/{orderId}
courierOrders/{courierUid}/{orderId}
availableOrders/{orderId}
quoteBoard/{orderId}
publicTracking/{randomToken}
courierPresence/{courierUid}
orderEvents/{orderId}/{eventId}
financialLedger/{participantUid}/{entryId}
deviceTokens/{uid}/{deviceId}
notificationInbox/{uid}/{notificationId}
```

- `orders` é o registro canônico privado.
- Índices são projeções para consulta, não fontes de autoridade.
- Índices e eventos são atualizados pelo backend.
- Dados públicos de rastreamento são minimizados.
- Regras devem negar acesso por padrão.

### Backend

Operações previstas:
- createOrder, updateOrder, cancelOrder.
- publishQuote, submitBid, acceptBid.
- acceptDelivery, confirmPickup, completeDelivery.
- reportPayment, confirmPayment.
- updateCourierLocation, updatePresence.
- createTrackingToken, revokeTrackingToken.
- createAppointment, assignAppointment, confirmAppointment, cancelAppointment.
- registerDeviceToken, dispatchNotification.
- createDeliveryProof.
- exportFinancialReport.

Cada operação deve validar autenticação, App Check quando aplicável, perfil, propriedade, estado atual, idempotência e concorrência.

### Notificações
- Tokens de dispositivos por UID e dispositivo.
- Envio no servidor por evento de domínio.
- Tratamento de tokens inválidos e renovação.
- Não enviar telefone, endereço completo ou valores desnecessários no payload.
- A tela consulta os detalhes autorizados após abrir a notificação.

### Arquivos e comprovantes
- Armazenamento privado por pedido.
- Regras por loja/motoboy autorizado.
- Limite de tamanho e formatos permitidos.
- URLs temporárias ou leitura autenticada.
- Política de retenção e exclusão a definir.

### Offline
- Cache de leitura e fila IndexedDB.
- Cada ação enfileirada recebe identificador idempotente.
- A interface distingue ação local pendente de confirmação do servidor.
- Não permitir confirmação final offline para pagamento, aceite exclusivo ou conclusão.
- Ao reconectar, revalidar estado no servidor antes de sincronizar.

## Segurança e privacidade
- Não expor coleções privadas em caminhos públicos.
- Não usar ID de pedido como segredo de rastreamento.
- Tokens públicos aleatórios com entropia adequada, expiração e revogação.
- Minimizar localização e reter somente pelo tempo necessário.
- Não guardar segredos no aplicativo, repositório ou artefatos APK.
- Definir política de retenção, acesso administrativo e resposta a incidentes.

## Custos e implantação
- Blaze é necessário para Cloud Functions e pode gerar custos.
- FCM não cobra pelo envio, mas infraestrutura de backend, banco, armazenamento e tráfego podem gerar custos.
- Criar alertas de orçamento por projeto.
- Alertas não são limites rígidos de gasto.
- Usar quotas, limites de taxa, logs e monitoramento.
- Não implantar nada pago sem aprovação expressa.
