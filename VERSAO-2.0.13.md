# Express Entregas 2.0.13

## Recolha e entrega com duas viagens

Novos pedidos desta modalidade geram duas ordens vinculadas, cada uma com valor, motoboy e pagamento próprios. Uma tarifa de R$ 7,00 corresponde a R$ 14,00 pelas duas viagens. O total contratado por cotação é dividido preservando os centavos. Valores contratados ficam congelados. Pedidos antigos mantêm o funcionamento e preço originais.

Ao concluir a recolha cliente → loja, o motoboy fica livre para outras corridas. A devolução aguarda o lojista tocar em **Solicitar motoboy para devolução**. A partir desse momento, o primeiro motoboy tem prioridade exclusiva de 5 minutos, sem reservar vaga na sua capacidade. Ele pode liberar antes; o lojista também pode buscar outro motoboy. Após o prazo, todos podem aceitar, inclusive o primeiro.

O servidor valida o prazo em cada aceite. O agendador existente reconcilia os pedidos e dispara notificações na próxima execução, normalmente em até um minuto, mesmo com aplicativos fechados. A notificação não determina a elegibilidade e sua entrega depende do aparelho e serviço de push.

Cancelar a devolução não apaga a recolha concluída nem o pagamento devido a quem a realizou.

## Rotas múltiplas

Na aba **Rotas**, o lojista pode agrupar de 2 a 20 entregas simples ainda sem motoboy ou cadastrar entregas em rascunho. Todas devem ter a mesma loja, endereço de coleta e data. A sequência é definida pelo lojista antes da publicação. Os valores individuais são somados, sem desconto automático.

A oferta mostra quantidade, bairros, valores individuais e total. Dados pessoais e endereços completos ficam disponíveis após o aceite. O motoboy confirma os cuidados, coleta todos os itens na loja e conclui as entregas na sequência apresentada, com navegação e cuidados de cada parada.

É necessário estar sem corridas ou reservas para aceitar uma rota. Enquanto ela estiver ativa, ficam bloqueados novos pedidos, cotações reservadas e outras rotas. Cada entrega concluída entra individualmente no financeiro; a rota agregadora não gera cobrança adicional.

Antes do aceite, a loja pode desfazer e reagrupar a rota. Rascunhos podem ser descartados ou publicados separadamente. O motoboy pode devolver a rota inteira à fila antes da coleta. A loja pode cancelar antes do aceite ou após 25 minutos sem coleta. Depois da coleta, as entregas são concluídas individualmente, sem alteração silenciosa da composição.

## Publicação

O aplicativo consulta a capacidade do servidor. Até atualizar o Firebase, a criação de duas viagens e rotas fica indisponível, e os pedidos simples continuam funcionando. APKs antigos não podem aceitar as novas rotas.

No Cloud Shell já autenticado, dentro do repositório da versão de testes:

```sh
cd ~/express-v2-2011
git pull --ff-only && node scripts/deploy-logistics-v2.mjs
```

O script preserva os parâmetros públicos de push existentes, define o projeto de quota e publica regras e funções no projeto `express-entregas-2-testes`. A chave VAPID privada permanece no Secret Manager. Usa o agendador já existente, sem criar outro serviço. Após finalizar, abrir a versão 2.0.13 e conferir os dois fluxos com contas de teste.

O rastreio dedicado e os contratos antigos são preservados. Nenhuma migração retroativa ou publicação Firebase é feita pelo simples envio do APK.

## Ajuste de perfil

Atualizações em tempo real preservam os campos de endereço e Pix em edição. A verificação assíncrona do servidor não apaga dados digitados. A regressão é reproduzida pelo cenário de cadastro com uma nova renderização durante a edição.
