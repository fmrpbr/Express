# Express 2.0.10

- Corrige o PNG de 512px danificado e substitui o caminho de geração que podia manter o robô padrão do Android. Ícones legados em cinco densidades, adaptativos e temáticos são copiados explicitamente para os recursos usados pelo manifesto.
- A identidade segue o símbolo de entregador já usado na web: branco sobre vermelho #EA1D2C. O pequeno ícone é monocromático, com cor de destaque vermelha definida no manifesto para FCM e na configuração de notificações locais. O GPS recebe a mesma cor e continua silencioso. O fundo da notificação permanece sob controle do tema do Android.
- Adiciona Em execução à navegação do lojista, usando exclusivamente seus pedidos no estado run. Corridas aceitas aparecem em tempo real, com os controles de rastreio existentes.
- Mostra OCUPADO desde a primeira corrida ou reserva. O cabeçalho conta como disponíveis apenas os motoboys online, com ofertas ativas e nenhuma vaga ocupada. O painel do motoboy continua informando que uma segunda corrida pode ser aceita quando ainda há vaga. Disponibilidade para novas ofertas e ocupação da entrega continuam sendo informações distintas.

Não altera preços, pagamentos, limite de duas corridas ou regras do servidor. As mudanças desta rodada entram pelo APK e pela publicação web. Mantém o protocolo de notificações da versão 2.0.9.

Validação: dados PNG completos e CRC em todas as densidades, testes existentes de backend/regras, fluxo de aceite com status ocupado e contador atualizado, aba do lojista e retorno a disponível ao concluir, compilação Android e assinatura estável. Aparência da notificação ainda deve ser conferida no aparelho real, pois o Android aplica seu tema e máscara de ícone.
