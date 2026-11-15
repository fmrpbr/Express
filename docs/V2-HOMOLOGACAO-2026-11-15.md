# V2: correções e homologação de 15/11/2026

Base: `f9ce1f82402d7ad0f6f3852c5938faedf3112e38`, branch `v2.0-testes-reais`.
Referências: issues #5, #6 e #7. Este relatório separa implementação, testes locais e validação operacional. A V2 continua sem liberação para o piloto.

## Alterações implementadas

| Área | Comportamento resultante |
| --- | --- |
| Identidade | App usa `profiles/stores` e `profiles/couriers`. Perfil é criado/alterado por operação autenticada no servidor. Cadastro interrompido pode ser retomado com o mesmo e-mail e senha. Nenhum perfil administrativo é criado pelo formulário. |
| Pedidos | Lojista lê `storeOrders/{uid}`; motoboy lê `courierOrders/{uid}` e murais mínimos. A coleção canônica não é baixada pelo usuário comum. |
| Integridade | Callable `orderCommand` valida criação, edição, proposta, contratação, aceite, retirada, etapas, cancelamento, conclusão, pagamento, GPS e rastreio. Preço e timestamps vêm do servidor. |
| Concorrência | Uma transação confirma pedido, projeções, ocupação, evento e recibo juntos. Apenas um motoboy assume a corrida; o mesmo motoboy não assume duas corridas ativas. Repetições com o mesmo recibo retornam o mesmo resultado. |
| Cotação | Contratação preserva motoboy e preço ao completar os dados. A resposta da contratação entrega o pedido confirmado para abrir o formulário sem depender da chegada do listener; revisões antigas não substituem registros mais recentes. Chuva não altera preço acordado. Devolução antes da retirada remove a atribuição e reabre cotação sem propostas antigas. |
| Pagamento | Loja ou motoboy pode confirmar após conclusão. Autoria e horário da primeira confirmação são preservados. Repetições não geram novos eventos de pagamento. |
| Cancelamento | Prazo de 25 minutos é conferido pelo servidor, junto ao estado e à ausência de retirada. Uma corrida com retirada não volta silenciosamente à fila. |
| Presença | `availableForWork` é independente da conexão. Sessões em `courierConnections` têm heartbeat, expiração visual de 90 segundos e remoção por desconexão. Ocupação deriva dos pedidos no servidor. OFF pausa novas ofertas, inclusive lembretes. |
| Notificações | Jobs duráveis de envio inicial e lembretes de cinco minutos. Validação antes de enviar, deduplicação por evento/dispositivo, remoção de tokens inválidos. Atualizações de corrida possuem canal separado e não dependem do ON/OFF de novas ofertas. |
| Aparelhos | Registro FCM passa pelo servidor, com identificação do aparelho. Renovação e troca de conta removem vínculos antigos desse aparelho/token. Logout remove o registro local do usuário. |
| Som | Preferências em diálogo no app e atalho às configurações Android. Primeiro plano usa notificação local no mesmo canal do push, em vez de beep independente. Volume, Não Perturbe e configurações do fabricante continuam sujeitos ao Android. |
| Rastreamento | Token aleatório de 256 bits, validade de 24 horas, rotação/revogação via servidor, assinatura em tempo real e leitura negada após validade/revogação. Encerramento ou devolução remove o link público. Nenhum nome, endereço, telefone, UID ou valor na projeção pública. |
| GPS | Escrita autorizada apenas na corrida ativa do motoboy. Limites no cliente e servidor, horário da última posição e erros visíveis. APK usa serviço nativo de localização durante a corrida; navegador depende das capacidades do navegador. Serviço para ao encerrar, cancelar ou sair da conta. |
| Interface | Entrega Loja → Cliente como padrão. Zona não se perde ao recalcular. Valor combinado é mostrado ao completar cotação. Menu do motoboy tem seis opções na ordem solicitada, sem rolagem horizontal. Loja mantém perfil no avatar. Avisos transitórios não se acumulam sobre os controles. |
| Web/APK | `www` é a fonte comum; entrada na raiz encaminha para ela. SDK Firebase empacotado localmente, sem depender de imports do CDN no início. Cache recebe versão por conteúdo; não substitui configuração por HTML. Favoritos locais separados por conta. |
| Build | Dependências e lockfiles nos quatro pacotes. Plugin push fixado em 7.0.7. Preparação Android confere projeto/package Firebase, plugin Google Services, serviço privado, backup e versão. Compilação em CI não publica APK automaticamente. |

## Evidências executadas

Ambiente local: Node 24, Java 21, Firebase Realtime Database Emulator e Auth Emulator, Chromium Headless Shell. CI está configurado para Node 22.

| Verificação | Resultado local |
| --- | --- |
| `npm run check` | Sintaxe dos scripts e backend, JSON das regras, ausência de leitura global/gravação direta de pedidos no app: aprovado. |
| `npm test` | 14 testes aprovados: integridade, autorização de operações, preço, etapas, pagamento, links, migração offline e vínculo de aparelho. |
| `npm test --prefix tests/firebase-rules` | 40 testes aprovados: regras atuais, isolamento, rastreio, preferências, Web Push e 8 testes de integração com transações reais no emulador. |
| `node scripts/run-browser-emulators.mjs` | 4 cenários aprovados: fluxo completo e pagamento entre contas; rastreio sem login e revogação; cotação com duas viagens; recuperação de cadastro interrompido. |
| `npm run build:web` | Bundles e recursos gerados. |
| `npx cap add android`, `npx cap sync android`, `node scripts/prepare-android.mjs` | Projeto e integração nativa preparados. Não equivale à compilação Gradle nem à instalação no aparelho. |

Os testes de notificações usam um transporte simulado, com Firebase Emulator real para filas/transações. Eles comprovam decisões de envio e deduplicação; não comprovam entrega FCM/Web Push, som, bateria ou GPS em Android real. O teste de navegador usa o wrapper callable oficial em servidor TCP junto aos emuladores, sem implantar funções externas.

Para reproduzir:

```sh
npm ci
npm ci --prefix functions
npm ci --prefix tests/firebase-rules
npm ci --prefix tests/security
npm run check
npm test
npm run test:rules
npm run build:web
npx playwright install --with-deps chromium
node scripts/run-browser-emulators.mjs
```

## Pendências que bloqueiam a liberação

1. Revisar a mudança e aprovar implantação exclusivamente no Firebase `express-entregas-2-testes`. Não houve publicação de regras, funções, site ou APK nesta rodada.
2. Confirmar plano/permissões/custos para Functions e Scheduler antes de qualquer ativação. Blaze e billing não foram alterados.
3. Revisar dados de teste legados e os índices. Há conversor offline em `scripts/migrate-test-snapshot.cjs`; ele não acessa o Firebase. Exportação, revisão e importação devem ser aprovadas. Não apontar clientes antigos às novas regras durante essa transição.
4. Configurar VAPID público, segredo privado `EXPRESS_VAPID_PRIVATE_KEY` e `EXPRESS_VAPID_SUBJECT` para Web Push. A chave privada nunca deve ser colocada no app ou no Git. Sem configuração, não há promessa de Web Push.
5. Definir URL HTTPS pública de testes em `publicTrackingBaseUrl`, acessível fora do APK. Um endereço `capacitor://localhost` nunca é usado para compartilhar rastreio.
6. Obter resultado aprovado da compilação Gradle no CI. Para disponibilizar APK atualizável, configurar o segredo `ANDROID_TEST_KEYSTORE_BASE64` com um debug.keystore estável, usando alias/senhas padrão de debug. Não substituir a chave de produção. APK antigo de chave desconhecida pode exigir reinstalação inicial.
7. Executar a matriz de aparelho abaixo, registrando versão, commit, modelo, Android, horário e evidência. Só depois aprovar o piloto de 5 lojas e 5 motoboys.

## Matriz obrigatória em aparelhos

| Caso | Aceite |
| --- | --- |
| Instalar e atualizar APK | Sem erro de instalação; atualização preserva sessão/configuração quando assinatura é a mesma. |
| Novo pedido e cotação | Chegam uma vez por aparelho elegível, com app aberto, em segundo plano e fechado normalmente. |
| Reinício e Forçar parada | Documentar resultados separadamente; não prometer recebimento durante Forçar parada do Android. Registro é recuperado ao abrir. |
| Som | Categoria escolhida funciona em primeiro e segundo plano; testar volume e permissão negada. |
| Lembretes | Primeiro aos cinco minutos, próximos a cada cinco minutos, com tolerância do agendador e rede registrada. Nenhum novo envio elegível após aceite, cancelamento, expiração ou OFF. |
| OFF durante corrida | Bloqueia novas ofertas, preserva atualizações da corrida atual. |
| GPS | Trajeto real, tela bloqueada e mais de cinco minutos em segundo plano; posição com horário atual. Testar permissão negada/revogada e perda de sinal. |
| Encerramento | Serviço de localização para ao concluir/cancelar/sair; link público perde acesso. |
| Reconexão e duas sessões | ON/OFF persiste; conexão é recalculada sem uma sessão derrubar outra. Sem dupla corrida ou pagamento duplicado. |
| Chrome/PWA | Versão da mesma fonte, cache atualizado e Web Push validado separadamente do FCM nativo. |
| Layout | Seis opções acessíveis em 320, 393 e 480 px; conferir barra do Android, formulários e teclado em S21 FE. |

Registro de cada execução: `ID | commit/APK | conta/perfil | aparelho/Android | passos | esperado | observado | passou/falhou/bloqueado | evidência | reteste`.

## Limites técnicos que permanecem explícitos

- A transação de integridade opera na raiz do RTDB para manter os índices existentes atômicos. É uma opção limitada ao projeto de testes e ao piloto pequeno. Crescimento de histórico e volume exige medir contenção/latência e dividir a arquitetura antes de escalar.
- FCM/Web Push e banco não participam da mesma transação. O servidor evita uma segunda submissão por evento/dispositivo. Falha entre reserva e envio fica registrada para análise; resultado incerto não é reenviado automaticamente, para evitar duplicidade. Confirmação de entrega real e reconciliação operacional continuam necessárias.
- OFF não consegue recolher uma notificação já entregue ao sistema operacional. Há revalidação imediatamente antes de cada submissão.
- Navegador não oferece o mesmo serviço nativo de localização do APK. Force Stop, permissões e restrições do fabricante precisam de evidência real.
- Funcionalidades adicionais da V3 continuam no plano mestre. Nenhuma integração de cobrança Pix/cartão foi ativada.

## Verificação adicional no CI

A primeira compilação Android foi interrompida por HTTP 429 ao baixar dependências do Maven Central. O build agora usa cache Gradle, dois workers e o espelho público hospedado no Google Cloud, documentado em https://docs.cloud.google.com/docs/buildpacks/java#google_cloud_hosted_maven_central_mirror. Não houve troca das versões dos artefatos nem uso de repositório privado.

A repetição dos testes de navegador identificou sincronização intermitente do preço visual da cotação. O formulário passou a usar o pedido confirmado na resposta do servidor e a preservar seu valor contratado durante recálculos. O teste continua exigindo os R$ 25,00 contratados.
