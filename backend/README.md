# Backend do Express

Esta pasta reservará o código de serviços confiáveis do Express 3.0.

## Diretriz

O backend será a autoridade para operações que afetam dinheiro, propriedade, atribuição de motoboy, status de entrega, tokens de rastreamento e notificações.

## Estrutura planejada

```text
backend/
  functions/
    README.md
    src/
      index.ts
      auth/
      orders/
      quotes/
      delivery/
      payments/
      tracking/
      notifications/
      appointments/
      shared/
    test/
  contracts/
    README.md
```

A estrutura de diretórios será criada junto com a implementação, conforme os contratos forem aprovados. Não adicionar credenciais ou segredos.

## Escolha tecnológica pendente

- Cloud Functions 2ª geração é a opção preferencial pela integração com Firebase.
- Cloud Run é alternativa se houver necessidade de serviço HTTP mais amplo ou controle de runtime.
- A decisão depende do custo, região, limites e fluxo real do piloto.

## Regras

- Validar Firebase Auth e App Check.
- Validar papel e propriedade a partir de dados confiáveis.
- Usar operações idempotentes.
- Registrar auditoria sem armazenar dados pessoais desnecessários.
- Nunca confiar em valor, status ou papel enviado pelo cliente sem validação.
- Não implantar sem aprovação expressa do proprietário e sem testes no Emulator Suite.
