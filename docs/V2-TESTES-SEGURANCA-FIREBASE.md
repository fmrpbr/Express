# Testes de segurança Firebase da V2

## Objetivo

Esta suíte registra o comportamento das regras atuais de `database.rules.json` antes de qualquer alteração. Ela usa o projeto fictício `demo-express-entregas-security` e o Realtime Database Emulator. Nenhum projeto Firebase real é selecionado.

## Como executar no GitHub Actions

O workflow `.github/workflows/security-rules-v2.yml` executa quando há mudanças nas regras ou nos testes da branch `v2.0-testes-reais`.

Localmente, dentro de `tests/security`:

```bash
npm install
firebase emulators:exec --project demo-express-entregas-security --only auth,database "npm test"
```

As identidades dos testes são simuladas pelo `@firebase/rules-unit-testing` com UIDs e claims controlados. O Auth Emulator fica disponível no ambiente isolado, mas a suíte inicial ainda não testa cadastro/login real pelo SDK de Authentication.

## Cobertura inicial

- leitura do perfil próprio e bloqueio do perfil de outro usuário;
- divergência entre `profiles/{role}/{uid}` e os caminhos legados `stores/{uid}` / `couriers/{uid}`;
- leitura de pedido individual pelo lojista e motoboy associados;
- bloqueio de leitura global da coleção `orders`;
- exposição atual da presença de motoboys a usuários autenticados;
- leitura pública do rastreamento quando o token existe;
- isolamento dos tokens FCM por UID;
- bloqueio de gravação direta de pedidos pelas regras atuais.

## Como interpretar

Os testes de caracterização não significam que o estado atual está seguro. Alguns testes confirmam explicitamente comportamentos conhecidos como exposição de presença e leitura pública por token. Eles criam uma linha de base reproduzível para impedir que mudanças futuras alterem o comportamento sem revisão.

A próxima etapa é separar testes de acesso esperado dos testes que devem falhar por risco, definir as regras-alvo e validar a arquitetura de leitura por índices. Operações críticas de pedidos continuam dependendo de backend confiável. Não publicar regras diretamente apenas porque a suíte passa.

## Limites

- Nenhuma regra foi publicada.
- Nenhum deploy ou migração foi executado.
- Nenhum projeto real foi usado.
- Nenhuma cobrança ou plano Blaze foi ativado.
- A execução no GitHub Actions ainda precisa concluir para que os resultados sejam considerados verificados.
