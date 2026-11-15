# V2 — Canais nativos de notificação

## Estado desta etapa

A branch `v2.0-testes-reais` prepara três canais Android:

- `express_orders_v2`: novos pedidos.
- `express_quotes_v2`: novas cotações.
- `express_reminders_v2`: lembretes.

Os canais são criados pelo plugin Capacitor Push Notifications, com importância alta, vibração e luz. A configuração do Capacitor também solicita apresentação de alerta e som quando a notificação chega com o app em primeiro plano.

## Limite atual

Criar os canais não envia notificações. O aplicativo ainda precisa de um backend confiável que envie mensagens FCM contendo o campo Android `channelId` correspondente. Sem esse backend, não há entrega em segundo plano iniciada por eventos de pedidos/cotações.

O som de cada canal é controlado pelo Android. Canais existentes não podem ter o som alterado programaticamente depois de criados. Para sons próprios, arquivos de áudio precisam ser incluídos em `android/app/src/main/res/raw` e os canais devem ser criados com esses nomes de arquivo antes de serem usados. Para mudar uma preferência já criada, será necessário criar um novo ID de canal/versionar o canal.

## Próximas etapas

1. Backend Firebase Admin SDK com validação de destinatário e token.
2. Envio FCM com payload de notificação e channelId.
3. Preferências de som por usuário e dispositivo, aplicadas pelo backend.
4. Lembretes idempotentes a cada cinco minutos, cancelados ao responder ou quando o pedido deixar de estar elegível.
5. Testes no Emulator e em aparelho real: app aberto, minimizado, reiniciado e encerrado pelo usuário.

## Restrições

Não implantar Functions, publicar regras ou ativar Blaze sem autorização expressa. Não usar dados reais nos testes de backend. Android pode restringir notificações por Doze, economia de bateria e force-stop; o aplicativo não pode garantir entrega durante force-stop.
