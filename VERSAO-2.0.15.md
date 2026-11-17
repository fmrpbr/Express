# Express Entregas 2.0.15

Identidade aprovada: moto vermelha, azul escuro #061d27, painéis claros e ações principais vermelhas. Fonte compartilhada em www/brand.css, preservando as cores semânticas dos estados. Ícones web e Android usam a moto, com margem para máscaras adaptativas. Rastreio mantém privacidade e passa a seguir a marca.

release.json centraliza a versão da interface e da compilação Android. check.mjs rejeita divergência na interface e ausência do tema no cache. A revisão corrige o APP_VERSION interno que ainda informava 2.0.13 apesar do rótulo 2.0.14. Versões de contrato do servidor, como notificationTools 2.0.9, permanecem independentes da versão do produto.

A publicação web e o download devem ser atualizados somente após a compilação e conferência do novo APK. downloads/latest.json deve apontar para o arquivo real, hash e tamanho conferidos. APKs instalados precisam de atualização pelo usuário. A cópia Firebase web e o rastreio exigem publicação no Hosting autenticado. Não há mudança de regras, funções, preços ou dados.

Verificação local: build web, sintaxe, recursos de marca e 85 testes Node aprovados. Conferência visual da tela de login efetuada no navegador. A validação Android, aparelhos e publicação Firebase são etapas separadas e devem ter evidências registradas.
