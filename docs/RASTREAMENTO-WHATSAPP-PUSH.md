# Rastreamento seguro, WhatsApp e notificações

## Rastreamento público
- O link usa um token aleatório de 256 bits, criado com `crypto.getRandomValues`.
- O token aponta para `publicTracking/{token}`, nunca para `orders/{orderId}`.
- O registro público contém somente código de acompanhamento, status, tipo de serviço, horário de atualização e localização durante a corrida.
- Nome do cliente, telefone, endereço residencial, observações, loja/endereço da loja, valor, forma de pagamento e propostas não são copiados para o registro público.
- O token é criado em novos pedidos. Pedidos antigos recebem um token quando o lojista/admin usa o botão de compartilhamento.

## Compartilhar pelo WhatsApp
O botão **Compartilhar WhatsApp** prepara o link de rastreamento e abre o WhatsApp com uma mensagem curta. Não inclui valor, taxa, telefone nem endereço do cliente.

## Aceitação de cotações e corridas
- Aceitar proposta agora usa `runTransaction` no pedido e só conclui se o status ainda for `cotacao` e a proposta selecionada continuar válida.
- A proposta aceita reserva o pedido para o UID do motoboy escolhido (`assignedCourierId`).
- O mural dos demais motoboys não exibe pedidos reservados, e a transação de aceite da corrida verifica novamente o UID atribuído.
- Isso evita conflito entre clientes legítimos concorrentes usando as transações do Realtime Database. Ainda não substitui validação de servidor: enquanto as gravações críticas forem permitidas diretamente pelo cliente, um cliente modificado pode tentar contornar a interface. A proteção definitiva exige regras que impeçam alteração indevida e/ou backend confiável.

## Inscrição de notificações
- O botão de sino solicita permissão do navegador, registra o Service Worker, cria uma inscrição Web Push e salva endpoint/chaves em `pushSubscriptions/{uid}/{subscriptionId}`.
- Configure `vapidPublicKey` em `www/firebase-config.js` com a chave pública VAPID do projeto de testes.
- O Service Worker já trata eventos `push` e exibe a notificação.

### Limitação que permanece
A inscrição do aparelho está implementada, mas o envio real das notificações ainda exige um serviço confiável que leia as inscrições e envie Web Push. Não existe endpoint de envio nem backend de push neste repositório. Não colocar chave privada VAPID no aplicativo ou no Git. Não ativar Blaze nem publicar regras Firebase sem autorização. Sem backend, não é correto afirmar que as notificações automáticas estão completas ou que funcionarão com o app fechado em todos os aparelhos.

## Validação manual necessária
1. Criar uma cotação e enviar propostas de dois motoboys.
2. Aceitar uma proposta em duas sessões simultâneas e confirmar que somente uma transação é concluída.
3. Confirmar que apenas o motoboy selecionado vê e consegue aceitar a corrida reservada.
4. Compartilhar o link por WhatsApp e abrir em janela anônima.
5. Conferir que a página pública não mostra nome, telefone, endereço nem valores.
6. Confirmar que status e localização são atualizados no registro público.
7. Configurar a chave VAPID pública, permitir notificações e confirmar que a inscrição aparece no nó `pushSubscriptions/{uid}`.
8. Testar o envio somente depois de configurar um backend confiável.
