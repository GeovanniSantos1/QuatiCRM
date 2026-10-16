# Login com Google no Quati

O login por Google usa o aplicativo Quati do Clerk. O login por e-mail e as sessões
do CRM continuam no Better Auth 1.6, mantendo os IDs, perfis e aprovações existentes.

## Fluxo

1. O botão Google abre /auth/google e inicia o SSO do Clerk.
2. O retorno conclui verificações adicionais, se necessárias, e obtém o token de sessão.
3. POST /api/auth/sign-in/clerk valida assinatura RS256, emissor fixado pela chave
   pública configurada, audiência quati-crm, expiração, sessão ativa e origem exata.
4. Apenas e-mail verificado em claim assinada pode criar/vincular a identidade.
5. Better Auth cria a sessão do CRM. A sessão temporária do Clerk é encerrada
   com o destino final, incluindo o convite quando existir.
6. O cadastro do morador continua pendente até aprovação. Nenhuma função administrativa
   é atribuída a partir de campos enviados pelo navegador ou metadados editáveis.

A integração usa o JWKS público do Clerk e não precisa de CLERK_SECRET_KEY.
As credenciais do Google permanecem no provedor. A integração antiga com o broker Grok
continua disponível quando suas credenciais estiverem configuradas, inclusive o fluxo
de popup/bearer para o preview da plataforma. X depende da configuração desse broker.

## Hospedagem

Projeto Vercel quati-crm, domínio https://quati-crm-tan.vercel.app.

| Variável | Uso |
| --- | --- |
| BETTER_AUTH_URL | Origem HTTPS do domínio publicado |
| BETTER_AUTH_SECRET | Segredo persistente privado para as sessões do CRM |
| DATABASE_URL | Conexão privada PostgreSQL persistente |
| CLERK_PUBLISHABLE_KEY | Chave pública da instância do Clerk |
| VITE_AUTH_ENABLED | true |
| QUATI_SEED_TEST_USERS | false |

Os dados publicados ficam no schema quati_site da infraestrutura já existente,
com search_path exclusivo e conexão direta compatível com essa opção da Neon.
As contas de teste do ambiente local não são copiadas. O administrador inicial
é provisionado privadamente no banco, sem senha de demonstração; o vínculo com
Google exige comprovação do e-mail selecionado pelo proprietário.

## Clerk

A instância atual é de **desenvolvimento/testes**, usando as credenciais compartilhadas
de Google fornecidas pelo Clerk. Isso permite validar o site publicado, mas tem limites
de desenvolvimento e não representa uma instância definitiva de produção.

Claims de sessão configuradas:

```json
{
  "aud": "quati-crm",
  "quati_email": "{{user.primary_email_address}}",
  "quati_email_verified": "{{user.email_verified}}",
  "quati_name": "{{user.full_name}}"
}
```

Apenas essas informações de identidade são necessárias. Telefone, nome de usuário
e senha não são requisitos adicionais no cadastro por Google. MFA e verificações de
segurança continuam sendo tratadas pelo Clerk quando exigidas.

Para uso definitivo de produção, configurar uma instância production do Clerk,
domínio próprio/DNS e credenciais OAuth de Google correspondentes. Preservar as claims
e atualizar CLERK_PUBLISHABLE_KEY, verificando a política de migração de identidades.
Não criar automaticamente instâncias production irreversíveis nem desligar CSRF.

## Validação

- npm test inclui testes criptográficos com chaves reais de teste: rejeição de
  assinatura incorreta, outro emissor/audiência/origem, token expirado, sessão pendente
  e e-mail não verificado.
- Verificação de navegador desktop/celular em desenvolvimento e no build.
- Fluxo real do Clerk com usuário temporário: token assinado, troca por sessão do CRM,
  e-mail correto e bloqueio de morador sem aprovação. Remover as identidades e os
  registros temporários após o teste.
- A seleção/consentimento final de uma conta Google real é realizada pelo titular.
