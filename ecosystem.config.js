require('dotenv').config();

const config = require('./config/ecosystem');

const api_watch = (config.api_watch == 'yes' && config.api_watch == 'y');
const app_watch = (config.app_watch == 'yes' && config.app_watch == 'y');

const api_autorestart = (config.api_autorestart != 'no' && config.api_autorestart != 'n');
const app_autorestart = (config.app_autorestart != 'no' && config.app_autorestart != 'n');

const api_script = `${config.base_dir}/src/${config.api_script}`;
const app_script = `${config.base_dir}/src/${config.app_script}`;

let ecosystem  = new Object();
ecosystem.apps = new Array();

const api_instance = {
    name: config.api_name,
    script: api_script,
    autorestart: api_autorestart,
    watch: api_watch,
};

const tonelada_instance = {
    name: 'tonelada',
    script: `${config.base_dir}/tonelada.php`,
    autorestart: api_autorestart,
    watch: api_watch,
};

ecosystem.apps.push(api_instance);
// ecosystem.apps.push(tonelada_instance);

for (let instance = 1; instance <= config.app_instances; instance++) {
    ecosystem.apps.push({
        name: `${config.app_name}-${instance}`,
        script: app_script,
        autorestart: app_autorestart,
        watch: app_watch,
        args: instance,
    });
}

module.exports = ecosystem;