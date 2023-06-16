# Installation

1. Install required packages:

   ```bash
   sudo apt install node nodejs npm postgresql redis-cli pm2 -y
   ```

2. Set execution permissions for the set.environment.sh script:

    ```bash
    chmod +x set.environment.sh
    ```

3. Run the set.environment.sh script:

    ```bash
    ./set.environment.sh
    ```

4. Create a PostgreSQL database (assuming you have PostgreSQL installed):

    ```bash
    sudo -u postgres ./set.environment.sh --create-database
    ```

5. Install npm dependencies:

    ```bash
    npm install
    ```

6. Start the project using PM2:

    ```bash
    pm2 start ecosystem.config.js
    ```