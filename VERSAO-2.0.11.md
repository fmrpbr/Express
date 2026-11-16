# Express Entregas 2.0.11

## Alterações

- Novos lojistas e motoboys são criados como pendentes. O administrador aprova, reprova, bloqueia e libera acessos em Cadastros, com contador no dashboard, motivo visível ao usuário e histórico administrativo. Cadastros existentes sem situação explícita continuam aprovados.
- Contas pendentes, reprovadas ou bloqueadas não podem ler dados operacionais, publicar alertas, ativar disponibilidade, executar comandos ou receber push. A tela acompanha a situação em tempo real. Bloquear um motoboy pausa ofertas e encerra sua presença; mantém pedidos e histórico para revisão administrativa.
- Conteúdo frágil e observação importante aparecem no formulário e nos cartões. Antes do aceite, o motoboy consulta os cuidados e confirma “Li e estou ciente”. O servidor exige a revisão atual e registra a confirmação. Observações livres não entram no mural público nem no rastreio.
- Autor e administrador podem cancelar alertas ativos. O alerta sai da faixa, permanece no histórico e envios ainda pendentes são cancelados quando revalidados. Uma notificação já entregue ao aparelho não pode ser retirada.
- O lojista imprime o pedido com identificação, coleta/destino, contatos, valor e cuidados. No navegador abre a impressão com opção de PDF; no APK usa o serviço de impressão Android.

## Publicação necessária

APK, página web, funções e regras precisam usar esta revisão. Atualizar só o APK não ativa a aprovação no servidor.

No projeto `express-entregas-2-testes`, com uma conta Firebase autorizada:

```sh
npm ci
npm ci --prefix functions
npm run build:web
npx firebase-tools deploy --project express-entregas-2-testes --only database,functions:orderCommand,functions:onAlertCreated,functions:onPushJobCreated,functions:processPushReminders,functions:onOrderUpdateCreated,functions:notificationTools
```

Publique o conteúdo web gerado pela rotina já usada no projeto, incluindo `www/vendor/firebase.bundle.js`, configuração e service workers. O deploy de Hosting configurado neste repositório atende apenas o rastreio, e não publica o app web completo.

A impressão nativa precisa do APK 2.0.11. A configuração de impressora/PDF e a aparência no aparelho real devem ser conferidas após instalar.

## Validação

60 testes de backend e 51 testes de integração/regras passaram. Os 15 cenários de navegador cobrem cadastro, aprovação, bloqueio em tempo real, aceite com confirmação, impressão e cancelamento de alerta, além dos fluxos existentes. A compilação e assinatura Android são verificadas pela rotina de APK. Teste em aparelho real permanece necessário.
