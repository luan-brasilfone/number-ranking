const fs = require('fs');

const env_path = '.env';
const env = getEnv();

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

let ecosystem = new Object();
ecosystem.apps = [];

let database_config = {
    host: env['database_host'],
    port: env['database_port'],
    database: env['database_name'],
    user: env['database_user'],
    password: env['database_password'],
};

let api_autorestart = env['api_autorestart'].toLowerCase();

ecosystem.apps.push({
    name: env['api_name'],
    script: env['api_script'],
    autorestart: (api_autorestart !== 'no' && api_autorestart !== 'n'),
    args: `${env['app_instances']}`,
});

let app_autorestart = env['app_autorestart'].toLowerCase();

for (let i = 1; i <= env['app_instances']; i++) {
    ecosystem.apps.push({
        name: `${env['app_name']}-${i}`,
        script: env['app_script'],
        autorestart: (app_autorestart !== 'no' && app_autorestart !== 'n'),
        args: `${i} '${JSON.stringify(database_config)}'`,
    });
}

module.exports = ecosystem;