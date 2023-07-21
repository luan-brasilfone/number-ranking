# Installation

[README EM PORTUGUÊS](README_PTBR.md)

0. Before starting:

   ```bash
   apt update
   apt upgrade -y
   ```

1. Install required packages:

   ```bash
   apt install nodejs npm postgresql redis -y
   ```

2. Install PM2:

   ```bash
   apt update && apt install sudo curl && curl -sL https://raw.githubusercontent.com/Unitech/pm2/master/packager/setup.deb.sh | sudo -E bash -
   ```

3. Create the database using PSQL/PGADMIN/ETC.

    ```bash
   PGPASSWORD=***POSTGRES_PASSWORD*** createdb ***DATABASE_NAME*** -U ***POSTGRES_USER*** -h ***POSTGRES_HOST*** -p ***POSTGRES_PORT***
   ```

4. Rename ***env*** file to ***.env*** and change it according to your environment

    ```bash
    cp ./env ./.env
    ```

5. Install npm dependencies:

    ```bash
    npm install
    ```

6. On first initialization, activate ***CHECK_DATABASE*** on ***.env*** file to create all the needed tables

    ```nano
    CHECK_DATABASE=yes
    ```

7. Start the project using PM2:

    ```bash
    pm2 start ecosystem.config.js
    ```

8. Wait for all the tables to be created *(it can take a while)*, then stop its execution on pm2 and deactivate ***CHECK_DATABASE*** on ***.env***

    ```bash
    pm2 del all
    ```
    ```nano
    CHECK_DATABASE=no
    ```

9. Run the project again, it should now be working

    ```bash
    pm2 start ecosystem.config.js
    ```

10. Start by adding providers/vendors, then you can start using the ranking system. You can check the application's endpoints on ***/src/api.js***