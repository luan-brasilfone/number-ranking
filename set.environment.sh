#!/bin/bash

if [ "$1" == "--create-database" ]; then

    source .env

    table_history='CREATE TABLE IF NOT EXISTS "history" ("number_provider" VARCHAR(40) PRIMARY KEY, "sms" JSONB);'
    table_mo='CREATE TABLE IF NOT EXISTS "mo" ("number" VARCHAR(20) PRIMARY KEY, "balance" INT, "date" DATE);'
    table_provider='CREATE TABLE IF NOT EXISTS "provider" ("code" VARCHAR(20) PRIMARY KEY, "MO" INT, "s200" INT, "s404" INT, "s500" INT, "s503" INT, "default" INT);'
    table_log_mo='CREATE TABLE IF NOT EXISTS "log_mo" ("id" SERIAL PRIMARY KEY, "number" VARCHAR(20), "date" TIMESTAMP, "provider" VARCHAR(20), "status" VARCHAR(20), "message" TEXT);'
    table_log_provider='CREATE TABLE IF NOT EXISTS "log_provider" ("id" SERIAL PRIMARY KEY, "code" VARCHAR(20), "date" TIMESTAMP, "status" VARCHAR(20), "message" TEXT);'
    table_log_history='CREATE TABLE IF NOT EXISTS "log_history" ("id" SERIAL PRIMARY KEY, "number" VARCHAR(20), "provider" VARCHAR(20), "date" TIMESTAMP, "status" VARCHAR(20), "rank" INT, "message" TEXT);'
    #table_cursor='CREATE TABLE IF NOT EXISTS "cursor" ("number_provider" VARCHAR(40) PRIMARY KEY, "counter" INT, "statement" VARCHAR(20));'
    #table_rank='CREATE TABLE IF NOT EXISTS "rank" ("number" VARCHAR(20) PRIMARY KEY, "total" INT, "sms_counter" INT);'
    

    command_drop="PGPASSWORD=$database_password dropdb $database_name -U $database_user -h $database_host -p $database_port --if-exists"
    command_create="PGPASSWORD=$database_password createdb $database_name -U $database_user -h $database_host -p $database_port -e"

    command_history="PGPASSWORD=$database_password psql -d $database_name -U $database_user -h $database_host -p $database_port -c '$table_history'"
    command_mo="PGPASSWORD=$database_password psql -d $database_name -U $database_user -h $database_host -p $database_port -c '$table_mo'"
    command_provider="PGPASSWORD=$database_password psql -d $database_name -U $database_user -h $database_host -p $database_port -c '$table_provider'"
    command_log_mo="PGPASSWORD=$database_password psql -d $database_name -U $database_user -h $database_host -p $database_port -c '$table_log_mo'"
    command_log_provider="PGPASSWORD=$database_password psql -d $database_name -U $database_user -h $database_host -p $database_port -c '$table_log_provider'"
    command_log_history="PGPASSWORD=$database_password psql -d $database_name -U $database_user -h $database_host -p $database_port -c '$table_log_history'"
    #command_cursor="PGPASSWORD=$database_password psql -d $database_name -U $database_user -h $database_host -p $database_port -c '$table_cursor'"
    #command_rank="PGPASSWORD=$database_password psql -d $database_name -U $database_user -h $database_host -p $database_port -c '$table_rank'"

    if [ "$use_containers" == "yes" ] || [ "$use_containers" == "y" ]; then

        docker exec $container_postgres sh -c "$command_drop"
        docker exec $container_postgres sh -c "$command_create"

        if [ $? -eq 0 ]; then
            echo "Database created successfully."
        else
            echo "Failed to create the database. Check your permissions and .env values."
        fi

        docker exec $container_postgres sh -c "$command_history"
        docker exec $container_postgres sh -c "$command_mo"
        docker exec $container_postgres sh -c "$command_provider"
        docker exec $container_postgres sh -c "$command_log_mo"
        docker exec $container_postgres sh -c "$command_log_provider"
        docker exec $container_postgres sh -c "$command_log_history"
        #docker exec $container_postgres sh -c "$command_cursor"
        #docker exec $container_postgres sh -c "$command_rank"

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
    eval $command_provider
    eval $command_log_mo
    eval $command_log_provider
    eval $command_log_history
    #eval $command_cursor
    #eval $command_rank

    exit 0
fi

if [ "$1" == "--add-example-provider" ]; then

    source .env

    insert_provider='INSERT INTO provider (code, \"MO\", \"200\", \"404\", \"500\", \"503\", \"default\") VALUES ('\'example\'', 100, 100, 30, 40, 50, 50)'
    command_insert="PGPASSWORD=$database_password psql -d $database_name -U $database_user -h $database_host -p $database_port -c "\"$insert_provider\"""

    if [ "$use_containers" == "yes" ] || [ "$use_containers" == "y" ]; then

        docker exec $container_postgres sh -c "$command_insert"

        exit 0
    fi

    eval $command_insert

    exit 0
fi

if [ "$1" == "--use-last-choices" ]; then

    source .env

else

    # Prompt for user input
    read -p "Enter app instances (default: 1) = " app_instances;
    read -p "Use default api settings? (yes/no) (default: yes) = " api_use_default;
    if [ "$api_use_default" == "no" ] || [ "$api_use_default" == "n" ]; then
        read -p "Enter api hostname (default: localhost) = " api_host;
        read -p "Enter api port (default: 3000) = " api_port;
    fi; echo

    read -p "Use default database settings? (yes/no) (default: yes) = " database_use_default
    if [ "$database_use_default" == "no" ] || [ "$database_use_default" == "n" ]; then
        read -p "Enter database host (default: localhost) = " database_host
        read -p "Enter database port (default: 5432) = " database_port
        read -p "Enter database name (default: ranking) = " database_name
        read -p "Enter database user (default: postgres) = " database_user
        read -p "Enter database password (default: postgres) = " database_password
    fi; echo

    read -p "Are either Nodejs, Postgresql or Redis going to run in a container? (yes/no) (default: no) = " use_containers;
    if [ "$use_containers" == "yes" ] || [ "$use_containers" == "y" ]; then
        read -p "Is Postgresql going to run in a container? (yes/no) (default: yes) = " use_postgres_container;
        if [ "$use_postgres_container" != "no" ] && [ "$use_postgres_container" != "n" ]; then
            read -p "Enter Postgresql container name (default: postgres-container) = " container_postgres
        fi;
        read -p "Is Nodejs going to run in a container? (yes/no) (default: yes) = " use_node_container;
        if [ "$use_node_container" != "no" ] && [ "$use_node_container" != "n" ]; then
            read -p "Enter Nodejs host (default: 0.0.0.0) = " container_node_host
            read -p "Enter Nodejs port (default: 3000) = " container_node_port
        fi;
        read -p "Is Redis going to run in a container? (yes/no) (default: yes) = " use_redis_container;
        if [ "$use_node_container" != "no" ] && [ "$use_node_container" != "n" ]; then
            read -p "Enter Redis container name (default: redis-container) = " container_redis
        fi;

        if [ "$use_postgres_container" != "no" ] && [ "$use_postgres_container" != "n" ] && [ -z "$container_postgres" ]; then
            container_postgres="postgres-container"
        fi
        if [ "$use_node_container" != "no" ] && [ "$use_node_container" != "n" ] && [ -z "$container_node_host" ]; then
            container_node_host="0.0.0.0"
        fi
        if [ "$use_node_container" != "no" ] && [ "$use_node_container" != "n" ] && [ -z "$container_node_port" ]; then
            container_node_port="3000"
        fi
        if [ "$use_redis_container" != "no" ] && [ "$use_redis_container" != "n" ] && [ -z "$container_redis" ]; then
            container_redis="redis-container"
        fi

        if [ -n "$container_postgres" ] && [ -z "$container_node_host" ]; then
            read -p "Enter Postgresql container port (default: 5432) = " container_postgres_port
            if [ -z "$container_postgres_port" ]; then
                container_postgres_port=5432
            fi
        fi
        if [ -n "$container_redis" ] && [ -z "$container_node_host" ]; then
            read -p "Enter Redis container port (default: 6379) = " container_postgres_port
            if [ -z "$container_redis_port" ]; then
                container_redis_port=6379
            fi
        fi

        if [ -z "$container_postgres" ] || [ -z "$container_redis" ] && [ -n "$container_node_host" ]; then
            YELLOW='\033[0;33m'
            NC='\033[0m'
            echo; echo -e "${YELLOW}Running Nodejs in a container and Postgresql or Redis on host is not supported. If you run into any error, please consider running all of them in a container.${NC}"
        fi
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

    if [ -z "$redis_host" ]; then
        redis_host="localhost"
    fi
    if [ -z "$redis_port" ]; then
        redis_port=6379
    fi

    if [ -z "$use_containers" ]; then
        use_containers="no"
    fi
fi

if [ "$use_containers" == "yes" ] || [ "$use_containers" == "y" ]; then
    if [ -n "$container_postgres_port" ]; then
        echo "Setting database port to container port."
        database_port="$container_postgres_port"
    fi

    if [ -n "$container_postgres" ] && [ -n "$container_node_host" ]; then
        echo "Setting database host to container name."
        database_host="$container_postgres"
    fi

    if [ -n "$container_node_host" ]; then
        echo "Setting API host to container host."
        api_host="$container_node_host"
    fi

    if [ -n "$container_node_port" ]; then
        echo "Setting API port to container port."
        api_port="$container_node_port"
    fi

    if [ -n "$container_redis_port" ]; then
        echo "Setting Redis port to container port."
        redis_port="$container_redis_port"
    fi

    if [ -n "$container_redis" ] && [ -n "$container_node_host" ]; then
        echo "Setting Redis host to container name."
        redis_host="$container_redis"
    fi
fi

# Generate .env file
cat > .env <<EOL
database_host=$database_host
database_port=$database_port
database_name=$database_name
database_user=$database_user
database_password=$database_password

redis_host=$redis_host
redis_port=$redis_port

app_instances=$app_instances
app_base_dir=$PWD
api_host=$api_host
api_port=$api_port

use_containers=$use_containers
container_postgres=$container_postgres
container_postgres_port=$container_postgres_port
container_node_host=$container_node_host
container_node_port=$container_node_port
container_redis=$container_redis
container_redis_port=$container_redis_port

app_name=$app_name
app_script=$app_script
app_autorestart=$app_autorestart
api_name=$api_name
api_script=$api_script
api_autorestart=$api_autorestart
EOL

echo ".env file has been created. For additional configurations, please edit the .env file."