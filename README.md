# Installation

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

3. Set execution permissions for the set.environment.sh script:

    ```bash
    chmod +x set.environment.sh
    ```

4. Run the set.environment.sh script:

    ```bash
    ./set.environment.sh
    ```

5. Create a PostgreSQL database (assuming you have PostgreSQL installed):

    ```bash
    sudo -u postgres ./set.environment.sh --create-database
    ```

6. Add at least one provider. You can add an example provider for now with:

    ```bash
    sudo -u postgres ./set.environment.sh --add-example-provider

6. Install npm dependencies:

    ```bash
    npm install
    ```

7. Start the project using PM2:

    ```bash
    pm2 start ecosystem.config.js
    ```