#!/bin/bash

if [ "$1" == "--create-database" ]; then

    source .env

    table_history='CREATE TABLE IF NOT EXISTS "history" ("number" VARCHAR(20) PRIMARY KEY, "providers" JSONB);'
    table_mo='CREATE TABLE IF NOT EXISTS "mo" ("number" VARCHAR(20) PRIMARY KEY, "balance" INT, "date" DATE);'
    table_providers='CREATE TABLE IF NOT EXISTS "providers" ("code" VARCHAR(20) PRIMARY KEY, "MO" INT, "200" INT, "404" INT, "500" INT, "503" INT, "default" INT);'

    command_drop="PGPASSWORD=$DATABASE_PASSWORD dropdb $DATABASE_NAME -U $DATABASE_USER -h $DATABASE_HOST -p $DATABASE_PORT --if-exists"
    command_create="PGPASSWORD=$DATABASE_PASSWORD createdb $DATABASE_NAME -U $DATABASE_USER -h $DATABASE_HOST -p $DATABASE_PORT -e"

    command_history="PGPASSWORD=$DATABASE_PASSWORD psql -d $DATABASE_NAME -U $DATABASE_USER -h $DATABASE_HOST -p $DATABASE_PORT -c '$table_history'"
    command_mo="PGPASSWORD=$DATABASE_PASSWORD psql -d $DATABASE_NAME -U $DATABASE_USER -h $DATABASE_HOST -p $DATABASE_PORT -c '$table_mo'"
    command_providers="PGPASSWORD=$DATABASE_PASSWORD psql -d $DATABASE_NAME -U $DATABASE_USER -h $DATABASE_HOST -p $DATABASE_PORT -c '$table_providers'"

    if [ "$USE_DOCKER" == "yes" ] || [ "$USE_DOCKER" == "y" ]; then

        docker exec $POSTGRES_CONTAINER sh -c "$command_drop"
        docker exec $POSTGRES_CONTAINER sh -c "$command_create"

        if [ $? -eq 0 ]; then
            echo "Database created successfully."
        else
            echo "Failed to create the database. Check your permissions and .env values."
        fi

        docker exec $POSTGRES_CONTAINER sh -c "$command_history"
        docker exec $POSTGRES_CONTAINER sh -c "$command_mo"
        docker exec $POSTGRES_CONTAINER sh -c "$command_providers"

        exit 0
    fi

    eval $command_drop
    eval $command_create

    if [ $? -eq 0 ]; then
        echo "Database created successfully."
    else
        echo "Failed to create the database. Check your permissions and .env values."
    fi

    eval $command_history
    eval $command_mo
    eval $command_providers

    exit 0
fi

if [ "$1" == "--add-example-provider" ]; then

    source .env

    insert_provider='INSERT INTO providers (code, \"MO\", \"200\", \"404\", \"500\", \"503\", \"default\") VALUES ('\'example\'', 100, 100, 30, 40, 50, 50)'
    command_insert="PGPASSWORD=$DATABASE_PASSWORD psql -d $DATABASE_NAME -U $DATABASE_USER -h $DATABASE_HOST -p $DATABASE_PORT -c "\"$insert_provider\"""

    if [ "$USE_DOCKER" == "yes" ] || [ "$USE_DOCKER" == "y" ]; then

        docker exec $POSTGRES_CONTAINER sh -c "$command_insert"

        exit 0
    fi

    eval $command_insert

    exit 0
fi

# Prompt for user input
read -p "Enter app instances (default: 1) = " app_instances;
read -p "Use default api settings? (yes/no) (default: yes) = " api_use_default;
if [ "$api_use_default" == "no" ] || [ "$api_use_default" == "n" ]; then
    read -p "Enter api hostname (default: localhost) = " api_host;
    read -p "Enter api port (default: 3000) = " api_port;
fi; echo

read -p "Use docker? (yes/no) (default: no) = " use_docker;
if [ "$use_docker" == "yes" ] || [ "$use_docker" == "y" ]; then
    read -p "Enter Postgres container name (default: postgres-container) = " container_postgres
fi; echo

read -p "Use default database settings? (yes/no) (default: yes) = " database_use_default
if [ "$database_use_default" == "no" ] || [ "$database_use_default" == "n" ]; then
    read -p "Enter database host (default: localhost) = " database_host
    read -p "Enter database port (default: 5432) = " database_port
    read -p "Enter database name (default: ranking) = " database_name
    read -p "Enter database user (default: postgres) = " database_user
    read -p "Enter database password (default: postgres) = " database_password
fi; echo


# Set default values
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

if [ -z "$api_host" ]; then
    api_host="localhost"
fi
if [ -z "$api_port" ]; then
    api_port="3000"
fi
if [ -z "$api_name" ]; then
    api_name="ranking-api"
fi
if [ -z "$api_script" ]; then
    api_script="api.js"
fi
if [ -z "$api_autorestart" ]; then
    api_autorestart="yes"
fi

if [ -z "$database_host" ]; then
    database_host="localhost"
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

if [ -z "$use_docker" ]; then
    use_docker="no"
fi
if [ -z "$container_postgres" ]; then
    container_postgres="postgres-container"
fi

if [ "$use_docker" == "yes" ] || [ "$use_docker" == "y" ]; then
    database_host=$container_postgres
fi

# Generate .env file
cat > .env <<EOL
DATABASE_HOST=$database_host
DATABASE_PORT=$database_port
DATABASE_NAME=$database_name
DATABASE_USER=$database_user
DATABASE_PASSWORD=$database_password

APP_INSTANCES=$app_instances
APP_NAME=$app_name
APP_SCRIPT=$app_script
APP_AUTORESTART=$app_autorestart

API_HOST=$api_host
API_PORT=$api_port
API_NAME=$api_name
API_SCRIPT=$api_script
API_AUTORESTART=$api_autorestart

USE_DOCKER=$use_docker
POSTGRES_CONTAINER=$container_postgres
EOL

echo ".env file has been created. For additional configurations, please edit the .env file."