# Express Entregas 2.0.14

Pedido por celular e visão geral organizada passam a fazer parte da fonte compartilhada (`www`) do navegador e do Android.

- Busca privada por telefone na conta da loja, com confirmação obrigatória do endereço.
- Cadastro novo salvo após confirmar o pedido; alterações temporárias ou permanentes; proteção contra sobrescrita concorrente e duplicação de pedido.
- Avisos de sistema por 3 minutos em destaque, depois na barra até 4 horas. Na lista de corridas do motoboy, o aviso novo já aparece na barra desde a publicação.
- Substituição por assunto, histórico na Central de Alertas e manutenção do estado atual em Tarifas.
- Preferências recolhidas; listas vazias ocultas na visão geral; sem duplicação de pedidos ativos em atividade recente.
- Rotas múltiplas, duas viagens com prioridade, cotações, pagamentos, aprovação de contas e rastreio preservados.
- Cache inclui todos os novos módulos. Clique de notificação preserva a URL correta também em subdiretórios do GitHub Pages.

## Verificação local

- Sintaxe e recursos de marca: aprovados.
- 81 testes Node aprovados.
- 19 cenários completos de navegador aprovados, com Firebase Auth/Database emulados: cadastro/aprovação, pedido, cotação, aceite, retirada, conclusão, pagamento, duas viagens, rota múltipla, rastreio, notificações e controle administrativo.
- 4 cenários adicionais do pedido por celular e avisos aprovados na integração inicial; dois testes específicos de regras do cadastro aprovados.
- Testes automatizados de notificações/GPS usam ponte simulada. Não comprovam recebimento FCM nem GPS com tela bloqueada em Android físico.

## Compatibilidade e publicação

O projeto continua sendo `express-entregas-2-testes`. Não houve migração de pedidos nem alteração das funções de negócio. As permissões adicionadas para `storeCustomers` já foram publicadas pelo proprietário na implantação inicial do navegador. Uma instalação que não recebeu essas regras precisa publicá-las antes de usar o novo cadastro.

O APK usa o mesmo pacote e a mesma assinatura de teste; versão 2.0.14-teste, com código superior gerado pelo workflow. Atualização preserva dados e sessão conforme suporte do Android. O APK 2.0.13 permanece disponível para consulta e comparação; o Android pode impedir downgrade direto de versão.

Backups: `backup/antes-unificar-app-web-20261116` para a fonte do APK e `backup/pagina-principal-antes-2.0.14` para a página principal. Backups de cada publicação Firebase continuam em `.browser-backups` no Cloud Shell do proprietário. Reverter o site não exclui pedidos/cadastros.
