# Cadastro de produtos para Hiper Gestão

Projeto em Vite, React e TypeScript. Os dados ficam no navegador e podem ser exportados em CSV UTF-8 separado por ponto e vírgula.

## Rodar no computador

Instale o Node.js 20 ou mais recente e execute nesta pasta:

```bash
npm install
npm run dev
```

Para testar a versão de produção:

```bash
npm run build
npm run preview
```

## Publicar na Vercel pelo GitHub

1. Crie um repositório vazio no GitHub.
2. Execute nesta pasta, trocando a URL pela do seu repositório:

```bash
git init
git add .
git commit -m "Primeira versão"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

3. Abra https://vercel.com/new e conecte sua conta do GitHub.
4. Clique em **Import** no repositório do projeto.
5. Confirme `npm run build` como Build Command e `dist` como Output Directory.
6. Clique em **Deploy**.

Os próximos `git push` na branch `main` serão publicados automaticamente.

## Publicar pela linha de comando

```bash
npm install -g vercel
vercel login
vercel
vercel --prod
```

O arquivo `vercel.json` já contém a configuração de build e navegação. Faça exportações periódicas do CSV porque o `localStorage` é específico de cada navegador e dispositivo.
