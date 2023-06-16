#!/bin/bash

if [ "$1" == "--create-database" ]; then

    source .env

    createdb -U $DATABASE_USER $DATABASE_NAME

    if [ $? -eq 0 ]; then
        echo "Database created successfully."
    else
        echo "Failed to create the database. Check your permissions and .env values."
    fi

    table_history='CREATE TABLE IF NOT EXISTS "history" ("number" VARCHAR(20) PRIMARY KEY, "providers" JSONB);'
    table_mo='CREATE TABLE IF NOT EXISTS "mo" ("number" VARCHAR(20) PRIMARY KEY, "balance" INT, "date" DATE);'
    table_providers='CREATE TABLE IF NOT EXISTS "providers" ("code" VARCHAR(20) PRIMARY KEY, "MO" INT, "200" INT, "404" INT, "500" INT, "503" INT, "default" INT);'

    psql -h $DATABASE_HOST -p $DATABASE_PORT -U $DATABASE_USER -d $DATABASE_NAME -c "$table_history"
    psql -h $DATABASE_HOST -p $DATABASE_PORT -U $DATABASE_USER -d $DATABASE_NAME -c "$table_mo"
    psql -h $DATABASE_HOST -p $DATABASE_PORT -U $DATABASE_USER -d $DATABASE_NAME -c "$table_providers"

    exit 1
fi

if [ "$1" == "--add-example-provider" ]; then

    source .env

    example_provider='INSERT INTO providers (code, "MO", "200", "404", "500", "503", "default") VALUES ('\'example\'', 100, 100, 30, 40, 50, 50)'
    psql -h $DATABASE_HOST -p $DATABASE_PORT -U $DATABASE_USER -d $DATABASE_NAME -c "$example_provider"

    exit 1
fi

# Prompt for user input
read -p "Enter app instances (default: 1) = " app_instances
read -p "Enter database host (default: 127.0.0.1) = " database_host
read -p "Enter database port (default: 5432) = " database_port
read -p "Enter database name (default: ranking) = " database_name
read -p "Enter database user (default: postgres) = " database_user
read -p "Enter database password (default: postgres) = " database_password

# Set default values
if [ -z "$api_name" ]; then
    api_name="ranking-api"
fi
if [ -z "$api_script" ]; then
    api_script="api.js"
fi
if [ -z "$api_autorestart" ]; then
    api_autorestart="yes"
fi
if [ -z "$app_name" ]; then
    app_name="ranking-app"
fi
if [ -z "$app_script" ]; then
    app_script="app.js"
fi
if [ -z "$app_autorestart" ]; then
    app_autorestart="yes"
fi
if [ -z "$app_instances" ]; then
    app_instances=1
fi

if [ -z "$database_host" ]; then
    database_host="127.0.0.1"
fi
if [ -z "$database_port" ]; then
    database_port=5432
fi
if [ -z "$database_name" ]; then
    database_name="ranking"
fi
if [ -z "$database_user" ]; then
    database_user="postgres"
fi
if [ -z "$database_password" ]; then
    database_password="postgres"
fi

# Generate .env file
cat > .env <<EOL
API_NAME=$api_name
API_SCRIPT=$api_script
API_AUTORESTART=$api_autorestart
APP_NAME=$app_name
APP_SCRIPT=$app_script
APP_AUTORESTART=$app_autorestart
APP_INSTANCES=$app_instances
DATABASE_HOST=$database_host
DATABASE_PORT=$database_port
DATABASE_NAME=$database_name
DATABASE_USER=$database_user
DATABASE_PASSWORD=$database_password
EOL

echo ".env file has been created. For additional configurations, please edit the .env file."