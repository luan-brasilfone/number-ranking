require('dotenv').config();

const config = require('./config/ecosystem');

const start_simulation = (config.start_simulation == 'yes' || config.start_simulation == 'y');

const api_watch        = (config.api_watch == 'yes' || config.api_watch == 'y');
const app_watch        = (config.app_watch == 'yes' || config.app_watch == 'y');
const simulation_watch = (config.simulation_watch == 'yes' || config.simulation_watch == 'y');

const api_autorestart        = (config.api_autorestart != 'no' && config.api_autorestart != 'n');
const app_autorestart        = (config.app_autorestart != 'no' && config.app_autorestart != 'n');
const simulation_autorestart = (config.simulation_autorestart != 'no' && config.simulation_autorestart != 'n');

const api_script        = `${config.base_dir}/src/${config.api_script}`;
const app_script        = `${config.base_dir}/src/${config.app_script}`;
const simulation_script = `${config.base_dir}/src/${config.simulation_script}`;

let ecosystem  = new Object();
ecosystem.apps = new Array();

const api_instance = {
    name: config.api_name,
    script: api_script,
    autorestart: api_autorestart,
    watch: api_watch,
};

const simulation_instance = {
    name: config.simulation_name,
    script: simulation_script,
    autorestart: simulation_autorestart,
    watch: simulation_watch,
};

if (start_simulation)
ecosystem.apps.push(simulation_instance);
ecosystem.apps.push(api_instance);

for (let instance = 1; instance <= config.app_instances; instance++) {
    ecosystem.apps.push({
        name: `${config.app_name}-${instance}`,
        script: app_script,
        autorestart: app_autorestart,
        watch: app_watch,
        args: [instance],
    });
}

module.exports = ecosystem;