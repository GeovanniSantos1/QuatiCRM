# Gestão cotidiana do condomínio

Objetivo: permitir que moradores acompanhem problemas e uso das áreas comuns sem
depender de conversas dispersas. O usuário delegou a escolha de novas funções.

## Chamados

Moradores e portaria abrem chamados com assunto, categoria, prioridade e descrição.
O autor e a administração podem conversar no chamado. Apenas admin/síndico alteram
o andamento; resolução exige uma resposta. O autor pode cancelar um chamado aberto.
Cada mudança mantém histórico e avisa o autor ou os gestores no painel. Outros
moradores não têm acesso aos relatos. Alterações usam versão para evitar sobrescrita.

## Reservas

Admin/síndico cadastram áreas com capacidade e horário de funcionamento. Moradores
aprovados com unidade solicitam períodos no mesmo dia, em intervalos de 15 minutos,
até 90 dias à frente, no horário de São Paulo. Períodos pendentes já ocupam a agenda.
Admin/síndico aprovam ou recusam com motivo. Autor ou administração podem cancelar
uma reserva futura, liberando o horário. Banco usa slots únicos por área/data/hora
para impedir sobreposição inclusive em solicitações simultâneas. Mudança de unidade
ou desativação cancela reservas futuras. A agenda mostra ocupação sem expor dados
de outros moradores. A portaria consulta as reservas aprovadas para o dia.

## Execução e validação

1. Criar migração aditiva, regras e consultas com autorização no servidor.
2. Testar privacidade, transições, conflitos, cancelamentos e concorrência.
3. Criar páginas com formulários, filtros, histórico e estados de erro/vazio.
4. Integrar navegação, atalhos e notificações usando os componentes existentes.
5. Executar typecheck/build, testes no banco e fluxos reais no navegador, com
   inspeção de desktop/celular no desenvolvimento e na versão compilada.

Manter tokens visuais existentes (verde, superfícies claras e Manrope), autenticação
e aprovação de moradores. Sem novas dependências ou publicação externa automática.
