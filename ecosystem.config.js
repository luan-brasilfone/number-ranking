require('dotenv').config();
require('./config/globals');

const config = require('./config/ecosystem');

let ecosystem   = new Object();
ecosystem.apps  = new Array();

const app_autorestart = config.app_autorestart;
const api_autorestart = config.api_autorestart;

const api_instance = {
    name: env['api_name'],
    script: `${env['app_base_dir']}/${env['api_script']}`,
    autorestart: (api_autorestart != 'no' && api_autorestart != 'n'),
    watch: true,
};

const tonelada_instance = {
    name: 'tonelada',
    script: `${env['app_base_dir']}/tonelada.php`,
    autorestart: (api_autorestart != 'no' && api_autorestart != 'n'),
    watch: true,
};

ecosystem.apps.push(api_instance);
ecosystem.apps.push(tonelada_instance);

for (let i = 1; i <= env['app_instances']; i++) {
    ecosystem.apps.push({
        name: `${env['app_name']}-${i}`,
        script: `${env['app_base_dir']}/${env['app_script']}`,
        autorestart: (app_autorestart != 'no' && app_autorestart != 'n'),
        watch: true,
        args: `${i} '${JSON.stringify(app_env)}'`,
    });
}

module.exports = ecosystem;