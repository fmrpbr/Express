# Express Entregas 3.0 — plano mestre

## Objetivo

Preparar a próxima geração do Express Entregas com segurança, confiabilidade e operação simples para lojas e motoboys. A V3 será construída a partir das necessidades observadas no piloto da V2, sem interromper a versão atual.

## Regras de desenvolvimento

- Trabalhar nesta branch: `v3.0-planejamento`.
- Não alterar `main`, `android-apk`, o site publicado ou o Firebase de produção.
- Não mesclar, publicar ou migrar dados sem aprovação expressa do proprietário.
- A V2 continua sendo a base do piloto. A V3 não substitui a V2 automaticamente.
- Usar Firebase de testes separado da produção.
- Não colocar chaves privadas, service accounts, tokens de servidor ou arquivos de credenciais no Git.
- Não publicar regras Firebase antes de adaptar o aplicativo e executar os testes de autorização.
- Não ativar Blaze, criar recursos pagos ou implantar serviços sem autorização expressa.
- Não considerar funcionalidade concluída apenas porque existe documentação ou estrutura de pastas.

## Versão atual como ponto de partida

A branch V3 parte do commit da V2:
- Commit: `ab04b1aa2fb1bc248738036c909b8ae51ab71130`
- Mensagem: atualização do estado local após aceitar cotação e antes de abrir o formulário de conclusão.
- A compilação desse commit foi concluída com sucesso no GitHub Actions.
- O APK ainda precisa de validação manual no aparelho.
- A V2 já possui fluxo de pedidos, cotações, propostas, aceite, etapas de entrega, confirmação de pagamento, rastreamento compartilhável e organização do painel do lojista.
- A inscrição de push está iniciada, mas o envio automático confiável ainda depende de backend.
- A segurança do Firebase continua pendente e as regras atuais são apenas um rascunho restritivo. Não publicar o arquivo atual de regras.

## Escopo funcional planejado para a V3

### Pedidos e operação
- Histórico cronológico e imutável de eventos do pedido.
- Repetir pedido com revisão dos dados antes de enviar.
- Endereços e locais favoritos por loja.
- Busca e filtros por data, status, motoboy, tipo e cliente.
- Cancelamento com motivo, autor e horário.
- Painel com indicadores operacionais e atividade recente.
- Estados claros de sincronização: confirmado, pendente e offline.

### Comunicação
- Central de notificações dentro do aplicativo.
- Push para novos pedidos, cotações, propostas, aceite, cancelamento, retirada, conclusão e pagamento.
- Preferências de notificação por usuário.
- Lembretes de agendamentos em 1 hora e 15 minutos.
- Link público de rastreamento com dados mínimos e sem valores.

### Rastreamento e entrega
- Atualização de localização com permissão e indicação clara de compartilhamento.
- Horário da última localização recebida.
- Previsão de chegada somente quando houver dados suficientes.
- Comprovante de entrega com foto opcional, nome de quem recebeu e confirmação.
- Tratamento de GPS indisponível, permissão negada e conexão perdida.

### Financeiro operacional
- Valores combinados, pendentes, informados e confirmados.
- Histórico financeiro por loja, motoboy e período.
- Confirmação bilateral do acerto, com autor e data.
- Relatórios e exportação.
- Não processar Pix/cartão automaticamente nesta fase. Integração com intermediador de pagamentos será uma etapa separada, com análise de custos, contrato e segurança.

### Gestão e reputação
- Avaliação de loja e motoboy após serviço concluído.
- Perfil operacional do motoboy com indicadores objetivos.
- Favoritos e endereços recorrentes.
- Gestão de disponibilidade e presença, com expiração automática.

### Confiabilidade
- Proteção contra ações duplicadas e concorrência.
- Operações críticas validadas no servidor.
- Auditoria de alterações.
- Fila local persistente para operações não críticas e sincronização controlada.
- Backup, recuperação e monitoramento.
- Testes automatizados, de regras, integração e regressão.

## Arquitetura alvo

- Aplicativo: manter a base web/Capacitor existente durante a primeira etapa, evitando reescrita sem justificativa.
- Identidade: Firebase Authentication.
- Proteção do cliente: Firebase App Check, com configuração compatível com Web e Android.
- Dados em tempo real: Realtime Database, mantendo a estrutura atual inicialmente e migrando para caminhos separados por usuário.
- Backend: Cloud Functions 2ª geração ou Cloud Run, após aprovação do Blaze e avaliação de custos.
- Push: Firebase Cloud Messaging, com envio exclusivamente pelo backend.
- Arquivos: Cloud Storage com regras por proprietário e validação de tipo/tamanho.
- Observabilidade: Cloud Logging, Error Reporting e Crashlytics para a camada Android nativa, se aplicável.
- Offline: IndexedDB para fila local persistente; operações sensíveis só são confirmadas após resposta do servidor.
- Testes: Firebase Emulator Suite e testes de integração.
- CI: GitHub Actions para testes, análise estática e APK de teste.

## Ambientes

1. Desenvolvimento local: Emulator Suite e dados fictícios.
2. Testes compartilhados: projeto Firebase de teste, com contas controladas.
3. Piloto: ambiente de teste dedicado e dados reais somente após revisão de segurança, privacidade e autorização.
4. Produção: projeto separado, migração planejada, backup e aprovação expressa.

Não reutilizar o Firebase de produção nos builds de desenvolvimento ou piloto.

## Critérios para considerar a V3 pronta

- Testes automatizados e de regras aprovados.
- Nenhuma leitura ampla de pedidos por usuário comum.
- Nenhuma operação crítica autorizada somente pelo cliente.
- Aceite concorrente resulta em apenas um vencedor.
- Pagamento e conclusão têm trilha de auditoria.
- Push testado em primeiro plano, segundo plano e aplicativo encerrado, nos aparelhos suportados.
- Offline e retomada testados sem duplicar pedidos ou pagamentos.
- Rastreamento público não expõe dados pessoais.
- Backup e restauração testados.
- APK instalado e validado em aparelhos reais.
- Piloto aprovado pelos participantes.
- Aprovação expressa antes de qualquer publicação ou migração para produção.

## Decisões que exigem autorização do proprietário

- Ativar ou manter faturamento Blaze.
- Criar serviços pagos ou recursos em regiões pagas.
- Implantar Cloud Functions/Cloud Run.
- Publicar regras no Firebase.
- Usar dados pessoais reais no piloto.
- Integrar provedor de pagamentos.
- Migrar dados ou publicar a V3.
