# Instalação

0. Antes de começar:

   ```bash
   apt update
   apt upgrade -y
   ```

1. Instale os pacotes necessários:

   ```bash
   apt install nodejs npm postgresql redis -y
   ```

2. Instale o PM2:

   ```bash
   apt update && apt install sudo curl && curl -sL https://raw.githubusercontent.com/Unitech/pm2/master/packager/setup.deb.sh | sudo -E bash -
   ```

3. Cria o banco de dados usando PSQL/PGADMIN/ETC.

    ```bash
   PGPASSWORD=***SENHA_DO_POSTGRES*** createdb ***NOME_DO_BANCO*** -U ***USUÁRIO_DO_POSTGRES*** -h ***HOST_DO_POSTGRES*** -p ***PORTA_DO_POSTGRES***
   ```

4. Renomeie o arquivo ***env*** para ***.env*** e configure-o de acordo com o seu ambiente

    ```bash
    cp ./env ./.env
    ```

5. Instale as dependências do NPM:

    ```bash
    npm install
    ```

6. Na primeira inicialização, ative o ***CHECK_DATABASE*** no arquivo ***.env*** para criar as tabelas no banco

    ```nano
    CHECK_DATABASE=yes
    ```

7. Inicie o projeto usando o PM2:

    ```bash
    pm2 start ecosystem.config.js
    ```

8. Aguarde até que todas as tabelas sejam criadas *(isso pode demorar)*, então pare a execução do projeto e desative a opção ***CHECK_DATABASE*** no arquivo ***.env***

    ```bash
    pm2 del all
    ```
    ```nano
    CHECK_DATABASE=no
    ```

9. Inicie o projeto novamente, agora deveria estar funcionando

    ```bash
    pm2 start ecosystem.config.js
    ```

10. Comece adicionando fornecedores/vendors, depois você poderá utilizar o sistema de ranqueamento. Você pode checar os endpoints da API no arquivo ***/src/api.js***