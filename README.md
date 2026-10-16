# Quati CRM

Sistema de gestão condominial em React, TypeScript e TanStack Start, com visual
responsivo e acesso por perfil: morador, porteiro, administrador e síndico.

## Funcionalidades

- Cadastro de moradores sujeito à aprovação da administração.
- Convites para moradores cadastrados pela administração.
- Veículos: solicitação, aprovação e consulta de placa pela portaria.
- Um veículo pendente ou aprovado por apartamento.
- Chamados com conversa privada, prioridade, andamento e histórico da solução.
- Reservas de áreas comuns com aprovação e bloqueio de horários sobrepostos.
- Gestão de pessoas, entregas, comunicados, votações e financeiro.
- Login com e-mail e senha; integração Google/X pelo intermediário Grok,
  condicionada à configuração do cliente OAuth.

## Desenvolvimento

Requer Node.js 22 ou posterior e npm. Instale com `npm ci` e execute
`npm run dev`. O servidor usa a porta 8080.

Configure `DATABASE_URL` no ambiente do servidor para usar PostgreSQL.
O projeto preserva o suporte do template ao banco PGLite de preview.
Execute `npm run db:migrate` para aplicar migrações ao banco configurado.

Configurações opcionais de uma estação de trabalho podem ser colocadas em
`.quati/local-config.json`, que é ignorado pelo Git. As chaves aceitas são
`DATABASE_URL`, `GROK_PREVIEW_CLIENT_SECRET` e `QUATI_SEED_TEST_USERS`.
Variáveis do ambiente têm precedência. Nunca publique esse arquivo.

## Autenticação

Em uma hospedagem própria, configure `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`,
`GROK_AUTH_CLIENT_ID` e `GROK_AUTH_CLIENT_SECRET` no ambiente seguro do servidor.
As credenciais OAuth são do intermediário `auth.grok.me`, com o retorno da
aplicação autorizado. A integração Google no ambiente local está descrita em
[autenticação local](docs/autenticacao-google-local.md).

Contas de demonstração **não são criadas automaticamente** em uma instalação
nova. `QUATI_SEED_TEST_USERS=true` permite criá-las durante o build para testes;
use essa opção somente em bancos de desenvolvimento. Os scripts de testes e
seus dados de demonstração não representam credenciais de produção.

## Verificação

- `npm run typecheck`
- `npm run build`
- `npm run test:vehicles`
- `npm run test:residents`
- `npm run test:operations`

Builds, dependências, capturas de tela, logs e configurações locais ficam fora
do versionamento. Nenhuma credencial de banco ou token de publicação é necessária
no código-fonte.
