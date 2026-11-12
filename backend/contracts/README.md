# Contratos de dados e operações

Esta pasta conterá os contratos versionados entre aplicativo, backend e banco de dados.

## Contratos previstos

- order.schema: pedido e transições permitidas.
- quote.schema: cotação, proposta e aceite.
- delivery.schema: etapas e comprovante.
- payment.schema: valores e confirmações bilaterais.
- tracking.schema: dados públicos mínimos.
- notification.schema: eventos, destinatários e payloads.
- appointment.schema: agendamento e conflito de horário.
- audit-event.schema: trilha de auditoria.

## Regras

- Campos obrigatórios e opcionais explícitos.
- Datas em formato consistente, com timezone definido.
- Valores monetários em centavos inteiros, nunca float.
- Identificadores e referências validados.
- Campos privados não podem aparecer em schemas públicos.
- Mudanças incompatíveis exigem versionamento.
