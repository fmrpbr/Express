# Express Entregas 2.0 — ambiente de testes reais

## Objetivo
Construir uma segunda versão instalável em paralelo à versão atual, com dados e serviços de teste separados. A V2 deve permitir testes reais com contas de lojista, motoboy e administrador, sem acessar nem alterar pedidos, usuários ou configurações da produção.

## Isolamento obrigatório
- Branch exclusiva: `v2.0-testes-reais`.
- Não alterar `main`, `android-apk` nem o site publicado.
- Não mesclar nem publicar sem aprovação expressa.
- Android applicationId/appId exclusivo: `com.fmrpbr.express.v2`, para instalar lado a lado com a versão atual.
- Nome visível: `Express Entregas 2.0 (Teste)`.
- Projeto Firebase de desenvolvimento separado, sem reutilizar o projeto de produção `express-entregas-86e3e`.
- Nenhuma credencial privada, chave de serviço ou arquivo de produção será versionado.
- Dados fictícios ou contas de teste; nunca copiar dados pessoais reais para o ambiente de testes.

## Escopo funcional da V2
1. Login, cadastro e perfis de lojista, motoboy e administrador com autorização real.
2. Pedidos e cotações com validação de propriedade e estados.
3. Propostas, aceite atômico e prevenção de duas contratações para a mesma corrida.
4. Cancelamento com retorno correto à fila de cotação quando aplicável.
5. Confirmação de retirada, conclusão e acerto de pagamento com registro de autor e horário.
6. Edição de pedidos somente quando permitida pelo estado e pelo perfil.
7. Rastreamento por token aleatório, com dados públicos mínimos e sem liberar o pedido privado.
8. Presença online, em serviço e offline, com heartbeat e timeout.
9. Agendamentos: motoboy específico ou mural de propostas; confirmação exclusiva; coleta + entrega como um serviço; lembretes de 1h e 15min.
10. Notificações push Android, inclusive com aplicativo em segundo plano/fechado, após integração nativa FCM e serviço seguro de envio.
11. Interface Android com menu inferior fixo, modais funcionais, link de rastreio por WhatsApp sem valor e telas de gestão.

## Arquitetura e dependências
- Realtime Database com regras fechadas por padrão, caminhos de leitura separados por perfil e índices não autoritativos.
- Operações críticas (criar/editar pedido, aceitar cotação, reservar corrida, concluir, confirmar pagamento, agendamentos, tokens e notificações) precisam de validação em ambiente confiável de servidor.
- O plano Firebase Spark não permite implantar Cloud Functions. A V2 deve primeiro validar regras e dados no Emulator Suite. Para testes reais com operações privilegiadas, será necessário escolher e autorizar um backend: Cloud Functions com Blaze ou serviço externo. Não ativar faturamento nem mudar o plano sem autorização.
- FCM exige integração Android nativa e backend de envio; notificações locais do navegador não substituem push confiável com app fechado.
- Segredos e credenciais devem ser configurados como secrets no ambiente de CI/deploy, nunca commitados.

## Etapas e critérios de aceite
### Fase 0 — isolamento
- [x] Criar branch independente.
- [ ] Separar identificador Android e nome da versão de teste.
- [ ] Definir projeto Firebase de teste e configuração por ambiente.
- [ ] Garantir que build de teste não aponte para produção.

### Fase 1 — base e testes automatizados
- [ ] Executar a suíte atual do Emulator Suite e corrigir falhas.
- [ ] Criar testes de regras para loja A/B, motoboy A/B, administrador e visitante.
- [ ] Criar testes de transição de estados, concorrência e dados públicos.
- [ ] CI deve compilar e testar sem publicar em produção.

### Fase 2 — autenticação e segurança
- [ ] Criar perfis protegidos e autorização por UID/claims.
- [ ] Separar consultas por perfil.
- [ ] Remover leituras amplas de toda a coleção de pedidos.
- [ ] Migrar escrita de operações críticas para backend confiável.
- [ ] Testar tentativas não autorizadas e abuso de endpoints.

### Fase 3 — fluxos de entrega
- [ ] Pedidos, cotações, propostas, aceite e cancelamento.
- [ ] Retirada, conclusão e pagamento sincronizados.
- [ ] Rastreamento público minimizado e seguro.
- [ ] Presença e disponibilidade em tempo real.

### Fase 4 — agendamentos e push
- [ ] Modalidade motoboy escolhido ou propostas abertas.
- [ ] Reserva exclusiva e prevenção de conflito de horário.
- [ ] Lembretes de 1h e 15min no servidor.
- [ ] FCM nativo Android com app fechado.

### Fase 5 — validação real
- [ ] APK de teste instalável ao lado do app atual.
- [ ] Teste com contas independentes de loja, motoboy e admin.
- [ ] Teste em aparelhos Android e redes diferentes.
- [ ] Teste de reinstalação, atualização, perda de conexão e retomada.
- [ ] Relatório de falhas e correções.
- [ ] Aprovação explícita antes de qualquer migração ou publicação.

## Estado atual
A branch foi criada a partir de `feature/agendamentos-express`, preservando os ajustes e documentos de segurança existentes. A V2 ainda não está implementada nem conectada a um Firebase de teste. O arquivo `database.rules.json` é um rascunho restritivo e não deve ser publicado no banco atual. A suíte do Emulator Suite ainda precisa ser executada.