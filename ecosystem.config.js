const fs = require('fs');
const pg = require('pg');
const redis = require('redis');

const env_path = '.env';
const env = getEnv();

const database_config = {
    host: env['database_host'],
    port: env['database_port'],
    database: env['database_name'],
    user: env['database_user'],
    password: env['database_password'],
}

let postgres_client, redis_client;

let ecosystem = new Object();
ecosystem.apps = [];

let api_autorestart = env['api_autorestart'].toLowerCase();

let api_env = {
    postgres_client: postgres_client,
    redis_client: redis_client,
    host: env['app_host'],
    port: env['app_port']
};

ecosystem.apps.push({
    name: env['api_name'],
    script: env['api_script'],
    autorestart: (api_autorestart !== 'no' && api_autorestart !== 'n'),
    args: `${env['app_instances']} '${JSON.stringify(api_env)}'`,
});

let app_autorestart = env['app_autorestart'].toLowerCase();

let app_env = {
    postgres_client: postgres_client,
    redis_client: redis_client
}

for (let i = 1; i <= env['app_instances']; i++) {
    ecosystem.apps.push({
        name: `${env['app_name']}-${i}`,
        script: env['app_script'],
        autorestart: (app_autorestart !== 'no' && app_autorestart !== 'n'),
        args: `${i} '${JSON.stringify(app_env)}'`,
    });
}

function getEnv () {

    let env_file = fs.readFileSync(env_path, 'utf8');
    const env_lines = env_file.split('\n');
    const env_variables = {};
  
    for (const line of env_lines) {
      const trimmed_line = line.trim();
  
      if (trimmed_line && !trimmed_line.startsWith('#')) {
        const [key, value] = trimmed_line.split('=');
        env_variables[key.toLowerCase()] = value;
      }
    }

    return env_variables;
}

async function connectToPostgres () {

    postgres_client = new pg.Client(database_config);
    postgres_client.connect(function (err) {
        if (err) {
            // settings.consoleLog(`=> [connection: ERROR, message: ${err.message}]`);
            console.log(err.message);
        }
    });

    // const res = await postgres_client.query('SELECT $1::text as message', ['\nSuccesfully connected to database\n']);
    // console.log(res.rows[0].message);
}

async function connectToRedis () {

    redis_client = redis.createClient();
    
    redis_client.on('error', (error) => {
        console.log(`Error: ${error}`);
    });

    redis_client.connect();
}

connectToPostgres();
connectToRedis();

module.exports = ecosystem;