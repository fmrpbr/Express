# Fonte unificada de pedidos por celular e avisos

A partir da versão 2.0.14, `www/index.html` é a fonte compartilhada do site e do APK. Os módulos em `browser` são copiados por `prepare-web.mjs` e funcionam também no Android. `build:browser` apenas copia a versão compartilhada para `browser-dist` e prepara a configuração do site Firebase, sem reinjetar alterações.

O cliente é identificado pelo telefone com DDD. Cada loja consulta apenas seu cadastro. É necessário confirmar o endereço; edições podem valer só para a entrega ou atualizar o cadastro. A gravação do cadastro ocorre após a confirmação do pedido. Se falhar, a interface avisa e não reenvia o pedido. Revisões impedem sobrescrita concorrente.

Avisos de sistema ficam em destaque por 3 minutos desde a publicação e na barra por até 4 horas. Novos avisos do mesmo assunto substituem os anteriores. Agendamentos futuros permanecem até a vigência. O histórico fica na Central de Alertas. Avisos operacionais dos usuários e alertas financeiros mantêm seus próprios prazos e condições.

## Testes

```sh
npm ci
npm ci --prefix functions
npm ci --prefix tests/firebase-rules
npm ci --prefix tests/security
npm run check
npm test
npm run test:rules
npm run build:browser
npx playwright install chromium
node scripts/run-browser-emulators.mjs
node scripts/test-browser-phone.mjs
```

## Publicar a cópia Firebase do site

No Cloud Shell autenticado, atualizado para a versão 2.0.14:

```sh
node scripts/deploy-browser-phone.mjs
```

O procedimento preserva o site de rastreio, salva as regras reais e a referência do site anterior em `.browser-backups/<data>` e só publica regras quando necessário. Não compila APK. Para restaurar a publicação anterior:

```sh
node scripts/rollback-browser-phone.mjs .browser-backups/CAMINHO-INFORMADO
```

A restauração não apaga pedidos ou cadastros. Instruções e limites da versão em `VERSAO-2.0.14.md`.
