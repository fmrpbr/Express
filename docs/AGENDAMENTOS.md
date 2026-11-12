# Agendamentos do Express Entregas

## Regras aprovadas

- Contratação em duas modalidades: motoboy específico ou publicação para receber propostas.
- Todos os motoboys disponíveis podem visualizar os agendamentos publicados.
- Na modalidade específica, somente o motoboy escolhido pode confirmar.
- Na modalidade de propostas, motoboys disponíveis enviam valores e o lojista escolhe uma proposta.
- A escolha de uma proposta reserva o serviço para o motoboy escolhido; nenhum outro motoboy pode assumir o mesmo agendamento.
- Coleta + entrega deve ser um único serviço com origem e destino definidos.
- O agendamento deve guardar data/hora local, loja solicitante, tipo de serviço, endereços, observações, modalidade, propostas, motoboy responsável e histórico de status.

## Estados

- published: publicado e aguardando confirmação ou propostas.
- assigned: motoboy escolhido pelo lojista, aguardando confirmação.
- confirmed: motoboy confirmou o compromisso.
- in_progress: serviço iniciado.
- done: concluído.
- cancelled: cancelado.

## Notificações e lembretes

Eventos que devem gerar notificação:
- Novo agendamento publicado.
- Novo agendamento direcionado a um motoboy específico.
- Nova proposta recebida.
- Proposta escolhida.
- Agendamento confirmado, alterado ou cancelado.
- Lembretes para lojista e motoboy, com antecedência de 1 hora e 15 minutos.

Os lembretes precisam ser disparados no servidor, não por temporizadores dentro do aplicativo, para funcionar com o app fechado.

## Regras de concorrência e segurança

- A confirmação e a escolha de proposta devem usar transação atômica no Firebase.
- Validar no servidor que o usuário é o lojista dono do agendamento ou o motoboy autorizado.
- Um motoboy não pode confirmar dois serviços com horários incompatíveis.
- Alterações de data, horário, origem ou destino após confirmação devem solicitar nova confirmação do motoboy.
- Cancelamentos devem registrar autor, data e motivo.
- Não expor telefone, endereço completo ou dados privados em links públicos de acompanhamento.

## Dependências técnicas

- Presença online/offline dos motoboys precisa de heartbeat e timeout no Realtime Database.
- Push com o app fechado exige Firebase Cloud Messaging nativo no Android e um backend confiável para enviar mensagens.
- Credenciais privadas e chaves de serviço nunca devem ser armazenadas no repositório público.
- Os lembretes precisam de Cloud Functions ou outro serviço backend agendado.
