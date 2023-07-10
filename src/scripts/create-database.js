const { execSync } = require('child_process');

const create_table = `CREATE TABLE IF NOT EXISTS`;
const pg_password = `PGPASSWORD=${process.env.DATABASE_PASSWORD}`;
const pg_params = `${process.env.DATABASE_NAME} -U ${process.env.DATABASE_USER} -h ${process.env.DATABASE_HOST} -p ${process.env.DATABASE_PORT}`;
const psql_command = `${pg_password} psql -d ${pg_params} -c`;

const table_history = `${create_table} "history" ("number_provider" VARCHAR(40) PRIMARY KEY, "sms" JSONB);`;
const table_mo = `${create_table} "mo" ("number" VARCHAR(20) PRIMARY KEY, "balance" INT, "date" DATE);`;
const table_provider = `${create_table} "provider" ("code" VARCHAR(20) PRIMARY KEY, "MO" INT, "s200" INT, "s404" INT, "s500" INT, "s503" INT, "default" INT);`;
const table_log_mo = `${create_table} "log_mo" ("id" SERIAL PRIMARY KEY, "number" VARCHAR(20), "date" BIGINT, "provider" VARCHAR(20), "status" VARCHAR(20), "message" TEXT);`;
const table_log_provider = `${create_table} "log_provider" ("id" SERIAL PRIMARY KEY, "code" VARCHAR(20), "date" BIGINT, "status" VARCHAR(20), "message" TEXT);`;
const table_log_history = `${create_table} "log_history" ("id" SERIAL PRIMARY KEY, "number" VARCHAR(20), "provider" VARCHAR(20), "date" BIGINT, "status" VARCHAR(20), "rank" INT, "message" TEXT);`;

const command_drop = `${pg_password} dropdb ${pg_params} --if-exists`;
const command_create = `${pg_password} createdb ${pg_params} -e`;

const command_history = `${psql_command} '${table_history}'`;
const command_mo = `${psql_command} '${table_mo}'`;
const command_provider = `${psql_command} '${table_provider}'`;
const command_log_mo = `${psql_command} '${table_log_mo}'`;
const command_log_provider = `${psql_command} '${table_log_provider}'`;
const command_log_history = `${psql_command} '${table_log_history}'`;

if (process.env.use_containers === 'yes' || process.env.use_containers === 'y') {

	execSync(`docker exec ${process.env.CONTAINER_POSTGRES} sh -c "${command_drop}"`);
	execSync(`docker exec ${process.env.CONTAINER_POSTGRES} sh -c "${command_create}"`);

	execSync(`docker exec ${process.env.CONTAINER_POSTGRES} sh -c "${command_history}"`);
	execSync(`docker exec ${process.env.CONTAINER_POSTGRES} sh -c "${command_mo}"`);
	execSync(`docker exec ${process.env.CONTAINER_POSTGRES} sh -c "${command_provider}"`);
	execSync(`docker exec ${process.env.CONTAINER_POSTGRES} sh -c "${command_log_mo}"`);
	execSync(`docker exec ${process.env.CONTAINER_POSTGRES} sh -c "${command_log_provider}"`);
	execSync(`docker exec ${process.env.CONTAINER_POSTGRES} sh -c "${command_log_history}"`);
	
	console.log('Database created successfully.');
	process.exit(0);
}

execSync(command_drop);
execSync(command_create);

execSync(command_history);
execSync(command_mo);
execSync(command_provider);
execSync(command_log_mo);
execSync(command_log_provider);
execSync(command_log_history);

console.log('Database created successfully.');
process.exit(0);
