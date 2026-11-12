# Piloto operacional — 5 lojas e 5 motoboys

## Objetivo

Usar o Express Entregas em uma operação pequena e controlada para identificar necessidades reais, validar os fluxos e orientar a V3.

## Participantes

- 5 lojas.
- 5 motoboys.
- 1 responsável pelo acompanhamento do piloto.
- Contas individuais; não compartilhar senhas.
- Cada participante deve saber que está usando uma versão piloto.

## Pré-requisitos obrigatórios

- [ ] APK correto identificado por versão e commit.
- [ ] Firebase de teste separado da produção.
- [ ] Regras de segurança revisadas e testadas.
- [ ] Operações críticas protegidas no servidor.
- [ ] Política de dados e localização explicada aos participantes.
- [ ] Canal de suporte definido.
- [ ] Procedimento manual de contingência para falha do aplicativo.
- [ ] Teste de backup e recuperação.
- [ ] Aprovação do responsável antes de usar dados pessoais e entregas reais.

Não iniciar operação com dados reais enquanto a segurança do Firebase e o controle das operações críticas estiverem pendentes.

## Etapas sugeridas

### Preparação
- Criar contas e validar os papéis.
- Instalar o APK nos aparelhos.
- Verificar permissões de localização e notificações.
- Simular pedido normal, cotação, cancelamento, entrega e pagamento.
- Conferir que cada participante só vê o que deve ver.

### Operação assistida
- Começar com poucas entregas por dia.
- Aumentar gradualmente após verificar estabilidade.
- Ter um responsável acompanhando erros e dúvidas.
- Não depender do aplicativo como único registro financeiro durante a fase inicial.

### Revisão semanal
- Reunir problemas e sugestões.
- Classificar gravidade e frequência.
- Reproduzir erros antes de corrigir.
- Publicar novas versões de teste somente após build e testes.
- Manter registro do APK e commit usados por cada participante.

## Indicadores

- Pedidos criados e concluídos.
- Tempo até aceite.
- Tempo de espera para retirada.
- Tempo total de serviço.
- Cotações recebidas e aceitas.
- Cancelamentos e respectivos motivos.
- Pagamentos pendentes e tempo para confirmação.
- Notificações enviadas, recebidas e abertas.
- Falhas de GPS e sincronização.
- Erros do app por versão e aparelho.
- Satisfação de lojas e motoboys.

## Registro de ocorrência

Para cada problema, registrar:
- Data e horário.
- Versão do aplicativo e commit.
- Perfil (loja ou motoboy), sem expor dados desnecessários.
- Modelo do aparelho e versão Android.
- Etapas para reproduzir.
- Resultado esperado e resultado observado.
- Captura de tela sem dados pessoais ou financeiros sensíveis.

## Encerramento

O piloto termina quando os fluxos essenciais estiverem estáveis, os problemas críticos resolvidos e os participantes aprovarem a experiência. A decisão de publicar a V3 é separada e exige autorização expressa.
