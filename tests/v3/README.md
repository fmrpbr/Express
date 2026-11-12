# Testes da V3

## Camadas de teste

1. Unitários: validação, transições e cálculos.
2. Regras Firebase: leitura e escrita permitidas/negadas por perfil.
3. Backend: autorização, idempotência e erros.
4. Concorrência: aceite simultâneo, propostas e pagamentos.
5. Integração: banco, Storage e FCM.
6. End-to-end: fluxo completo de loja e motoboy.
7. Android: permissões, background, GPS, push e retomada.
8. Offline: fila persistente, reconexão e prevenção de duplicidade.

## Perfis mínimos

- Loja A e Loja B.
- Motoboy A e Motoboy B.
- Administrador.
- Visitante sem autenticação.

## Regra de aprovação

Cada teste deve demonstrar tanto o caminho permitido quanto a tentativa não autorizada. Testes devem usar dados fictícios e o Emulator Suite ou projeto dedicado de testes.
