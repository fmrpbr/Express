# Express Entregas 2.0.12

Corrige o aceite de pedidos com conteúdo frágil ou observação importante quando o resumo recebido pelo motoboy está incompleto ou desatualizado.

Antes, a tela só consultava os cuidados se as marcações já estivessem no resumo local. Sem elas, enviava um aceite sem declaração de leitura e o servidor recusava com “Leia e confirme os cuidados atualizados antes de aceitar”.

Agora, todo aceite consulta os cuidados e a revisão no servidor. Pedidos marcados abrem o aviso “Li e estou ciente”; Voltar mantém o pedido disponível. A consulta atualiza os destaques visíveis no cartão da sessão. Se o pedido mudar durante a leitura, o app consulta novamente e pede outra confirmação, com limite de tentativas. Erros de disponibilidade, acesso ou rede continuam sendo apresentados sem aceitar o pedido por engano.

A sessão é conferida antes e depois das operações e os cuidados temporários são apagados ao encerrar a sessão. A versão 2.0.12 aparece no login e no cabeçalho para facilitar a conferência da atualização.

Não altera funções, regras, preços, dados de pedidos ou a exigência de confirmação no servidor. Esta correção é publicada na web e no APK 2.0.12; não exige novo deploy Firebase.

Validação: o cenário com resumo sem marcações foi reproduzido antes da correção. A regressão cobre confirmação/cancelamento, edição enquanto o aviso está aberto e nova leitura antes de aceitar. Os demais cenários existentes permanecem na suíte de navegador, além das verificações de backend, segurança e compilação Android.
