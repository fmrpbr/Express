# Notificações Express 2.0.9

## O que mudou

- Canais Android de pedidos, cotações, lembretes, atualizações e alertas com um toque de três notas incluído no APK. Os canais antigos são mantidos para compatibilidade. O novo aplicativo registra `sound-v1`; o servidor seleciona o canal por dispositivo, sem quebrar APKs anteriores. Preferências alteradas pelo usuário nos novos canais são preservadas.
- O diagnóstico lê permissão, volume de notificações, modo silencioso/vibração, Não perturbe, importância e som de cada canal. O botão de som abre a categoria escolhida, sem buscar menus do sistema.
- Teste local usa a mesma categoria do Android que o push. Teste remoto permite escolher categoria e somente o dispositivo atual. O resultado diferencia fila, aceitação pelo provedor, rejeição e nova tentativa. Aceitação do provedor não comprova som ou entrega no aparelho.
- Web registra a inscrição pelo servidor. Trocar de conta transfere a inscrição do mesmo navegador e remove a vinculação anterior. Quando já autorizado e ativado antes, o login sincroniza a inscrição automaticamente. A página não promete áudio customizado de push em segundo plano, controlado pelo navegador.
- Alertas operacionais geram push por trigger, com mensagem genérica na tela bloqueada e texto completo só no app autenticado. Há limite de push por remetente e expiração. Preferência de alertas é independente de disponibilidade para ofertas.
- Atualizações têm até três tentativas para recusas transitórias conhecidas. Cada dispositivo tem controle de duplicidade. Falhas definitivas invalidam tokens expirados. Respostas incertas não são reenviadas automaticamente.
- O worker abre a central de alertas, avisos ou pedido correto. No Android, o aviso de GPS é separado e silencioso. Não é usado timer JavaScript para sustentar push em segundo plano.
- Administração pode registrar dispositivos autenticados com a claim admin para receber alertas. A claim não é obtida pelo formulário nem por endereço de e-mail digitado.

## Publicar o backend

No checkout atualizado do Cloud Shell, mantenha `functions/.env.express-entregas-2-testes` e o Secret Manager existentes. Não gere outra chave VAPID.

```sh
npm ci --prefix functions
node scripts/deploy-notifications-v2.mjs
```

O script publica as funções (incluindo `onAlertCreated`) e as regras com o índice das novas tentativas. O banco não é reimportado e pedidos, valores e pagamentos não são alterados. Instalar o APK sem atualizar o servidor não conclui a ativação dos novos canais.

## Verificação no aparelho, ainda necessária

1. Instalar o APK 2.0.9 sem desinstalar o anterior, entrar e ativar o dispositivo.
2. Conferir o diagnóstico e executar teste local em cada categoria.
3. Testar recebimento remoto com o app aberto, minimizado e com tela apagada.
4. Criar pedido e cotação em outra conta; receber avisos, aceitar e confirmar que lembretes param. Com disponibilidade OFF, não receber novas ofertas; continuar recebendo atualização de pagamento e alertas habilitados.
5. Publicar um alerta em outra conta e tocar na notificação para abrir a central correta.
6. Trocar de conta no mesmo navegador e aparelho; testar apenas o dispositivo selecionado.
7. Repetir no Chrome/Edge usando o endereço público, com permissão para aquele endereço. Navegadores internos podem não oferecer push.

Não modificar automaticamente volume, Não perturbe ou economia de bateria. Aplicativo forçado a parar nas configurações do Android precisa ser aberto novamente. A homologação exige evidência de recebimento e som em um aparelho real, incluindo os estados acima. Compilação e emuladores não substituem essa evidência.
