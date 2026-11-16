# Express 2.0.8: pagamento, atalhos e notificações

A confirmação financeira agora usa um diálogo dentro do Express, sem depender de `window.confirm` no navegador. A loja informa e o motoboy confirma; valores, histórico e permissões do servidor são preservados. Se houver falha, o estado não é alterado localmente.

“Minha operação” reúne Tarifas e avisos, Notificações e som, Meu Pix e Sinalizar chuva. Disponibilidade continua em destaque. Loja também tem acesso à configuração das notificações.

Web push usa a chave pública do servidor autenticado, evitando uma configuração vazia no pacote. A chave privada não é enviada ao cliente. Uma inscrição com chave antiga é substituída ao ativar. Android só confirma cadastro após gravar o token no servidor e verifica também a permissão para exibir notificações em primeiro plano. O teste é enviado somente à própria conta e limitado a um por minuto. Sua solicitação não prova entrega: conferir a notificação no dispositivo.

## Publicação necessária no Firebase

No Cloud Shell, dentro do checkout atualizado, mantenha `functions/.env.express-entregas-2-testes` e o Secret Manager da publicação anterior. Não gere um novo par VAPID. Execute:

```sh
npm ci --prefix functions
node scripts/deploy-notifications-v2.mjs
```

O comando publica somente funções no projeto de testes. Não reimporta banco, não altera tarifas e não modifica regras. APK e site podem mostrar “servidor precisa ser atualizado” até esta publicação.

## Conferência real ainda necessária

- Loja conclui Informar pagamento e motoboy confirma recebimento em outra sessão; recarregar preserva o estado.
- Ativar e testar no computador, com página aberta e minimizada. Conceder permissão neste endereço exato.
- Ativar e testar no APK, aberto e em segundo plano/tela apagada. Conferir volume e cada categoria em Configurações do Android.
- Novo pedido: motoboy disponível recebe aviso; pausado não recebe novas ofertas. Atualizações das corridas continuam.
- Trocar de conta no mesmo aparelho e sair: dispositivo da sessão anterior não deve receber dados daquela conta.
- Sem permissão, sem rede ou sem chave: mostrar erro claro, sem afirmar que notificações funcionam.

O sistema operacional pode impedir avisos com app forçado a parar, notificações bloqueadas ou navegador encerrado sem execução em segundo plano. Som e volume das notificações do sistema são controlados pelo Android/navegador, não pela página. O teste usa os mesmos transportes e canais das atualizações de corridas. Não habilita acesso administrativo nem envia pagamentos.
