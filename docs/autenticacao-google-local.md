# Google no ambiente de testes

O Quati utiliza Better Auth e o intermediário `https://auth.grok.me`. O cliente
compartilhado `grok_preview` é destinado aos previews `*.grok-sandbox.com`;
ele não autoriza o retorno para o ambiente local deste projeto.

Para habilitar o Google neste ambiente:

1. Provisionar um cliente próprio no intermediário de autenticação, com o retorno
   `http://127.0.0.1:8080/api/auth/oauth2/callback/grok-google` autorizado.
2. Configurar no ambiente do processo servidor `GROK_AUTH_CLIENT_ID` e
   `GROK_AUTH_CLIENT_SECRET` desse cliente, além de
   `BETTER_AUTH_URL=http://127.0.0.1:8080`.
3. Reiniciar o servidor e testar o login completo, incluindo o retorno ao painel
   e a aprovação do cadastro do morador.

Essas credenciais pertencem ao intermediário; um client ID do Google Cloud não
substitui diretamente o cliente do intermediário. Não colocar segredos em arquivos
versionados, variáveis `VITE_*`, mensagens ou no navegador.

Sem essa configuração, a tela informa a indisponibilidade antes de iniciar o
redirecionamento. Login e cadastro com e-mail e senha continuam disponíveis.
Essa proteção não comprova um login Google completo: a validação final depende
do provisionamento externo e de uma conta Google real.
