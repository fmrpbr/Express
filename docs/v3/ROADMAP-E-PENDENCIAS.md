# V3 — roadmap, pendências e critérios de aceite

Este documento é a lista principal de trabalho. Marcar uma tarefa como concluída somente após implementação e evidência de teste.

## A. Fechar o piloto da V2

- [ ] Confirmar que o APK do commit `ab04b1aa2fb1bc248738036c909b8ae51ab71130` foi instalado em aparelho real.
- [ ] Testar cancelamento gratuito após 25 minutos sem retirada.
- [ ] Testar painel do lojista: Em execução, Em aberto, Aguardando cotação e Atividade recente.
- [ ] Testar criação de cotação usando cidade, bairro, data e tipo.
- [ ] Testar envio de propostas por mais de um motoboy.
- [ ] Testar aceite da proposta e preservação do motoboy/valor.
- [ ] Testar conclusão dos dados restantes e atribuição exclusiva.
- [ ] Testar compartilhamento do rastreamento no WhatsApp sem valores.
- [ ] Testar concorrência de aceite em dois aparelhos.
- [ ] Registrar falhas, aparelho, versão, horário e passos para reproduzir.

## B. Segurança Firebase

- [ ] Revisar o modelo atual de dados e todas as leituras/gravações do cliente.
- [ ] Definir contrato final de dados e índices.
- [ ] Criar perfis protegidos e processo confiável de atribuição de papel.
- [ ] Separar pedidos por loja e motoboy.
- [ ] Remover listeners amplos da raiz de `orders`.
- [ ] Migrar rastreamento para somente `publicTracking/{token}`.
- [ ] Implementar operações críticas no backend.
- [ ] Bloquear escritas diretas em status, pagamento, taxas, atribuição e índices.
- [ ] Implementar App Check em monitoramento e depois enforcement.
- [ ] Testar loja A/B, motoboy A/B, administrador e visitante.
- [ ] Validar que o rascunho atual de `database.rules.json` não seja publicado sem revisão e adaptação do app.

## C. Backend e operações seguras

- [ ] Escolher Cloud Functions 2ª geração ou Cloud Run.
- [ ] Definir região e estimativa de custos.
- [ ] Configurar secrets fora do Git.
- [ ] Criar validação de autenticação e autorização.
- [ ] Criar idempotência para ações repetidas.
- [ ] Proteger aceite concorrente e reserva de motoboy.
- [ ] Proteger retirada, conclusão, cancelamento e confirmação bilateral de pagamento.
- [ ] Criar trilha de auditoria append-only.
- [ ] Adicionar limites de taxa e validação de payload.
- [ ] Criar testes de integração e concorrência.

## D. Notificações push

- [ ] Escolher estratégia FCM para Android nativo/Capacitor.
- [ ] Registrar token por usuário e dispositivo.
- [ ] Tratar renovação e remoção de token inválido.
- [ ] Criar gatilhos de notificação no backend.
- [ ] Criar preferências e central de notificações.
- [ ] Implementar deep links para pedido, cotação e pagamento.
- [ ] Testar foreground, background e app encerrado.
- [ ] Testar aparelhos com restrições de bateria e notificações.

## E. Financeiro operacional

- [ ] Definir estados: valor combinado, pagamento informado, confirmação pendente e confirmado.
- [ ] Criar livro de movimentações sem sobrescrever histórico.
- [ ] Registrar ator, valor, moeda, data e referência do pedido.
- [ ] Criar visão por loja, motoboy e período.
- [ ] Criar filtros e exportação.
- [ ] Definir como tratar divergência e contestação.
- [ ] Não declarar pagamento bancário confirmado sem integração com provedor ou comprovante verificado.
- [ ] Avaliar integração de Pix/cartão em etapa separada.

## F. Entrega e rastreamento

- [ ] Criar comprovante de entrega com foto opcional.
- [ ] Registrar nome de quem recebeu e horário.
- [ ] Criar política de retenção de fotos.
- [ ] Mostrar última localização e idade do sinal.
- [ ] Implementar previsão de chegada somente com dados suficientes.
- [ ] Tratar permissão GPS negada e localização indisponível.
- [ ] Permitir revogação/expiração do link público.

## G. Produtividade

- [ ] Histórico cronológico por pedido.
- [ ] Repetir pedido com confirmação dos dados.
- [ ] Endereços favoritos.
- [ ] Busca e filtros.
- [ ] Avaliação bilateral.
- [ ] Perfil operacional do motoboy.
- [ ] Central de notificações.
- [ ] Presença com heartbeat e timeout.

## H. Offline e sincronização

- [ ] Definir quais dados podem ser lidos offline.
- [ ] Implementar fila persistente IndexedDB.
- [ ] Adicionar chave idempotente a cada ação enfileirada.
- [ ] Exibir estado pendente/confirmado/erro.
- [ ] Revalidar no servidor ao reconectar.
- [ ] Testar fechar o app, reiniciar aparelho e recuperar conexão.
- [ ] Garantir que a sincronização não duplique pedidos, cobranças ou eventos.

## I. Piloto de 5 lojas e 5 motoboys

- [ ] Selecionar participantes e obter ciência de que é um piloto.
- [ ] Criar contas separadas e permissões mínimas.
- [ ] Definir canal de suporte e procedimento de incidente.
- [ ] Fazer treinamento rápido.
- [ ] Testar primeiro com pedidos simulados.
- [ ] Liberar pedidos reais somente após checklist de segurança.
- [ ] Medir volume, aceite, tempo de espera, duração, cancelamentos, falhas e pendências.
- [ ] Fazer revisão semanal.
- [ ] Registrar solicitações e priorizar por impacto.
- [ ] Encerrar piloto com relatório e aprovação do próximo passo.

## J. Qualidade e lançamento

- [ ] Testes unitários.
- [ ] Testes de regras no Emulator Suite.
- [ ] Testes de integração backend/banco/push.
- [ ] Testes end-to-end de loja e motoboy.
- [ ] Testes Android em aparelhos e redes diferentes.
- [ ] Teste de atualização e reinstalação.
- [ ] Teste de backup e restauração.
- [ ] Revisão de privacidade e segurança.
- [ ] APK de homologação.
- [ ] Aprovação expressa para produção.

## Critério de encerramento

Nenhuma fase será considerada concluída sem evidência reproduzível. Documentação, arquivos de estrutura e build verde não substituem teste real no aparelho.
