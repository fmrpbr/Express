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

## Situação após implantação no projeto de testes

Em 15/11/2026, até 18h56 (America/Sao_Paulo), o usuário executou a implantação pelo próprio Cloud Shell. Evidências: capturas do terminal fornecidas na conversa. Não houve execução autenticada do deploy pelo agente.

| Etapa | Evidência observada |
| --- | --- |
| Plano | Blaze confirmado no console após ativação pelo usuário. |
| Pedidos | `orderCommand`, Node.js 22, 2ª geração, `southamerica-east1`: criação bem-sucedida e `Deploy complete!`. |
| Lembretes | `processPushReminders`, `southamerica-east1`: criação bem-sucedida. |
| Eventos de notificação | `onPushJobCreated` e `onOrderUpdateCreated`, `us-central1`: criação bem-sucedida e `Deploy complete!` após propagação das permissões do Eventarc. |
| Chaves Web Push | Par VAPID gerado no Cloud Shell; chave privada criada no Secret Manager. Parâmetros público/subject gravados no arquivo local de ambiente. Nenhuma chave privada foi enviada à conversa ou ao Git. A configuração pública no cliente web continua pendente. |
| Dados de teste | Cópia original salva no Cloud Shell, conversão offline aprovada e importação confirmada por `Data persisted successfully`. Usuário confirmou que os registros são de teste. Conferência anterior à atualização da cópia: 3 lojas, 2 motoboys, 6 pedidos, status `done`, `cotacao`, `open`. |
| Regras RTDB | Sintaxe validada e regras publicadas para `express-entregas-2-testes-default-rtdb`; `Deploy complete!` às 18h56. |
| Imagens de compilação | Política de limpeza após sete dias configurada em `southamerica-east1` e `us-central1`. |

A implantação usou o checkout `a25018f99c7281df6fe23f3a49509d8b5f9df313`, da branch `v2.0-testes-reais`. O APK foi gerado no commit de código anterior `8b20ccd`; a diferença até `a25018f` é documental. Main e produção não foram alteradas nesta rodada.

## Pendências que bloqueiam a liberação

1. Validar no APK desta rodada: login com contas migradas, leitura dos próprios dados, criação/aceite de pedido, concorrência, etapas, cancelamento e pagamento sincronizado.
2. Comprovar no Android real: registro FCM, recebimento, som, lembretes, OFF, segundo plano e GPS. Publicação de funções não comprova entrega de notificações.
3. Inserir a chave VAPID pública correspondente no cliente web e publicar a versão web de testes. Web Push ainda não foi homologado.
4. Definir e publicar a URL HTTPS de rastreio em `publicTrackingBaseUrl`. Rastreio compartilhado fora do APK ainda não foi homologado.
5. Confirmar a instalação do APK validado e sua atualização no aparelho. APK antigo de assinatura desconhecida pode exigir reinstalação inicial.
6. Executar a matriz de aparelhos abaixo e registrar evidências. Só depois aprovar o piloto de 5 lojas e 5 motoboys.
7. Acompanhar consumo do Blaze e configurar alertas de orçamento; alertas e limite efetivo de gastos ainda não foram confirmados.

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

**Resultado final: aprovado.** O commit de código `c142196e2acec905aa215a6335139a9e8b4f4e38` passou as 58 verificações automatizadas e a compilação Android no [run 43729725749](https://github.com/fmrpbr/Express/actions/runs/43729725749). Backend e segurança também foram aprovados. Naquela execução nenhum APK foi disponibilizado. A disponibilização posterior está registrada abaixo. Naquela rodada ainda não havia implantação; a implantação posterior consta na seção de situação atual. O piloto continua bloqueado pelas dependências e pela matriz real de aparelhos acima.

A primeira compilação Android foi interrompida por HTTP 429 ao baixar dependências do Maven Central. O build agora usa cache Gradle, dois workers e o espelho público hospedado no Google Cloud, documentado em https://docs.cloud.google.com/docs/buildpacks/java#google_cloud_hosted_maven_central_mirror. Não houve troca das versões dos artefatos nem uso de repositório privado.

A repetição dos testes de navegador identificou sincronização intermitente do preço visual da cotação. O formulário passou a usar o pedido confirmado na resposta do servidor e a preservar seu valor contratado durante recálculos. O teste continua exigindo os R$ 25,00 contratados.

## APK autorizado e verificado

Em 15/11/2026, o usuário autorizou disponibilizar o APK de testes e armazenar sua chave de assinatura no segredo do repositório. Alterações restritas à branch `v2.0-testes-reais`; main, produção e billing não foram alterados.

- Commit do APK: `8b20ccdf771a18129b7f29687cf74cbbe5522e9f`.
- [Build e assinatura aprovados](https://github.com/fmrpbr/Express/actions/runs/43733544753).
- [Validação V2 e regras aprovada novamente](https://github.com/fmrpbr/Express/actions/runs/43733544761).
- Artefato: `Express-Entregas-2.0-TESTE-APK`, id `14169435970`.
- APK: `com.fmrpbr.express.v2`, 5.018.147 bytes.
- SHA-256 do APK: `bf405f24d127d906de73da7d4ed213b72576426c6adf27ab359b188576cc3395`.
- SHA-256 do certificado: `d4e736f9a49620a3152b8cc0a506d73f0ca065dd82fb558daf4e7150b5cc75b6`.
- `apksigner verify` aprovou assinaturas v1, v2 e v3. Certificado reconferido no APK extraído do artefato.
- A primeira tentativa de disponibilização gerou assinatura diferente da chave autorizada e foi descartada. A publicação agora assina explicitamente o APK e exige o fingerprint esperado antes de liberar o artefato.

As novas funções e regras foram implantadas posteriormente, conforme evidências registradas na seção de situação atual. A disponibilização do APK e a implantação não liberam o piloto: configuração pública do Web Push/rastreio e matriz de aparelhos continuam pendentes.
