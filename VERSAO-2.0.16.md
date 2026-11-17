# Express Entregas 2.0.16

Migração da distribuição pública para Firebase Hosting. O APK passa a abrir o download em https://express-v2-web-fmrpbr.web.app/download/, eliminando a dependência do GitHub Pages nesse botão. A fonte web e Android usa release.json. Contratos de backend, regras, usuários, preços e pedidos não são alterados.

A distribuição completa no Firebase deve conter login, /cadastro/, /download/, /downloads/ e /rastreio/. Os links antigos de rastreamento no site dedicado são preservados. O pacote Android e assinatura permanecem os mesmos.

Repositório só deve ser tornado privado depois de conferir a hospedagem completa, o APK e os endereços oficiais. Publicar arquivos no Hosting não altera DNS nem autoriza o domínio na autenticação.
