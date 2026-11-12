# Backend Functions — scaffold reservado para a V3

Ainda não há funções de produção implementadas nesta pasta. Este arquivo documenta o contrato de trabalho para evitar que a estrutura seja confundida com backend pronto.

## Módulos planejados

- auth: validação de identidade, perfil e permissões.
- orders: criação, edição e cancelamento.
- quotes: publicação, propostas e aceite exclusivo.
- delivery: retirada, etapas e conclusão.
- payments: informação e confirmação bilateral do acerto.
- tracking: tokens públicos, localização e revogação.
- notifications: registro de dispositivos, FCM e central de notificações.
- appointments: agendamentos, conflito de horário e lembretes.
- shared: validação, idempotência, erros e auditoria.

## Requisitos antes de implementar

- Definir contratos em `backend/contracts`.
- Definir região e estimativa de custos.
- Configurar secrets no ambiente de deploy.
- Criar testes unitários e de integração.
- Usar Emulator Suite sempre que possível.
- Não salvar service account, chave VAPID privada ou token FCM no Git.
- Não implantar no Firebase de produção.
