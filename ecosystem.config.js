const fs = require('fs');

const env_path = '.env';
const env = getEnv();

const database_config = {
    host: env['database_host'],
    port: env['database_port'],
    database: env['database_name'],
    user: env['database_user'],
    password: env['database_password'],
}

const redis_config = {
    host: env['redis_host'],
    port: env['redis_port']
}

let ecosystem = new Object();
ecosystem.apps = [];

let api_autorestart = env['api_autorestart'].toLowerCase();

let api_env = {
    api_host: env['api_host'],
    api_port: env['api_port'],
    database_config: database_config,
    redis_config: redis_config
};

ecosystem.apps.push({
    name: env['api_name'],
    script: env['api_script'],
    autorestart: (api_autorestart != 'no' && api_autorestart != 'n'),
    // watch: true,
    args: `${env['app_instances']} '${JSON.stringify(api_env)}'`,
});

let app_autorestart = env['app_autorestart'].toLowerCase();

let app_env = {
    database_config: database_config,
    redis_config: redis_config
}

for (let i = 1; i <= env['app_instances']; i++) {
    ecosystem.apps.push({
        name: `${env['app_name']}-${i}`,
        script: env['app_script'],
        autorestart: (app_autorestart != 'no' && app_autorestart != 'n'),
        // watch: true,
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

module.exports = ecosystem;