# Pontua Tasks — site conectado ao app

Esta versão web usa o mesmo Firebase e a mesma conta Google do app Android. Ela acompanha em tempo real as áreas que o app já publica em `users/{uid}/itens`: tarefas, notas, água, cuidados pessoais, exercícios extras e os registros diários de cuidados e exercícios.

## Preparação única do Firebase

O projeto Android já tem Firebase. Para permitir login pela web:

1. Abra o [Console do Firebase](https://console.firebase.google.com/) e escolha o projeto **pontua-993a2**.
2. Em **Configurações do projeto**, adicione um aplicativo **Web** e copie a configuração mostrada.
3. Abra `firebase-config.js` e substitua o objeto `firebaseConfig` pelo objeto do aplicativo Web.
4. Em **Authentication → Configurações → Domínios autorizados**, adicione `localhost` para testar no computador. Quando publicar o site, adicione também o endereço do site.
5. Em **Realtime Database → Regras**, mantenha as regras que o app já usa. Se o banco ainda não tiver regras por usuário, use o exemplo em `realtime-database-rules.example.json` como referência para permitir acesso somente à conta conectada.

O site não usa uma base paralela. Ele grava em `users/SEU_UID/itens/`, no mesmo formato lido pelo Android. As alterações aparecem enquanto os dois estão conectados à internet e logados na mesma conta.

## Abrir no computador

1. Abra a pasta do site no Explorador de Arquivos.
2. Dê dois cliques em `INICIAR-SITE.bat`. Ele abre o site no navegador e mantém uma janela do servidor aberta.
3. Entre com a mesma conta Google usada no app.
4. Para encerrar o site local, feche a janela chamada **Pontua Tasks - servidor local**.

O primeiro uso também precisa das configurações do Firebase descritas acima. O site precisa ser aberto por um servidor local, não pelo duplo clique em `index.html`, porque o login seguro do Google não funciona em páginas `file://`.

## O que funciona nesta primeira versão

- Tarefas: criar, editar, excluir, marcar como concluídas e filtrar.
- Cuidados pessoais: criar, editar, excluir e registrar como feito hoje.
- Água: registrar, editar e excluir entradas do dia.
- Notas: criar, editar e excluir.
- Exercícios extras: criar, editar, excluir e registrar a sessão de hoje.
- Mais áreas: consultar dados de diário, finanças, dívidas, estudos, sono, livros, humor e outras áreas que o app já tenha enviado ao backup.
- Layout responsivo para computador e celular, com atualizações ao vivo do Realtime Database.

As tarefas, notas, água, cuidados pessoais e exercícios extras são atualizados ao vivo nos dois lados. As demais áreas podem ser consultadas e editadas pelo site a partir do backup; depois de uma edição web, puxe a tela para baixo no app Android para aplicar a mudança e sincronizar o backup combinado. Esse fluxo exige a versão Android atualizada com o suporte a alterações do site. Dados antigos que estejam só no armazenamento local do telefone não são enviados automaticamente; use **Importar backup** para trazer tarefas, notas, água, cuidados e exercícios que já tenham sido salvos na nuvem. Os dois dispositivos precisam usar a mesma conta Google.

## Notícias, pontuação e patentes

- A aba **Notícias** mostra os avisos para qualquer usuário que tenha entrado no site. O botão para publicar e os controles para editar/excluir aparecem somente quando a conta conectada é `sotrabalho683@gmail.com`.
- Para aplicar essa restrição também no banco, atualize as regras do Realtime Database usando a seção `news` de `realtime-database-rules.example.json`. Preserve as regras existentes do app e acrescente essa seção dentro de `rules`; não abra o banco para acesso público. A leitura é permitida a usuários autenticados e a escrita exige o e-mail administrador.
- A pontuação e a patente são lidas do backup enviado pelo app. A patente usa os mesmos limites, nomes, faixa de segurança para rebaixamento e insígnias do aplicativo. Deixe o app conectado e abra-o com internet para sincronizar o backup.
- As tarefas com prazo seguem as mesmas cores de urgência do aplicativo: cinza sem prazo/mais distante, verde quando faltam até 20 horas, amarelo até 8 horas, vermelho até 3 horas, vermelho forte até 1 hora e preto depois do vencimento.

## Segurança

O objeto de configuração Firebase identifica o projeto, mas a autorização deve continuar sendo feita pelo Firebase Authentication e pelas regras do Realtime Database. Não deixe o banco aberto para leitura ou escrita pública. Nunca compartilhe arquivos de credencial de conta de serviço.
