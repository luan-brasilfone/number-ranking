const db_config = require('../../config/db.js');
const postgres_config = require('../../config/postgres.js');
const docker_config = require('../../config/docker.js');

const { execSync } = require('child_process');

const docker_start_line = docker_end_line = "";

if (docker_config.use_containers === 'yes' || docker_config.use_containers === 'y') {

	docker_start_line = `docker exec ${docker_config.container_postgres} sh -c "`;
	docker_end_line = `"`;
}

exports.create_database = () => {

	const create_table = `CREATE TABLE IF NOT EXISTS`;
	const pg_password = `PGPASSWORD=${postgres_config.password}`;
	const pg_params = `${postgres_config.database} -U ${postgres_config.user} -h ${postgres_config.host} -p ${postgres_config.port}`;
	const psql_command = `${docker_start_line}${pg_password} psql -d ${pg_params} -c${docker_end_line}`;

	const table_mo = `${create_table} "mo" ("number" VARCHAR(20) PRIMARY KEY, "balance" INT, "date" DATE);`;
	const table_provider = `${create_table} "provider" ("code" VARCHAR(20) PRIMARY KEY, "MO" INT, "s200" INT, "s404" INT, "s500" INT, "s503" INT, "default" INT);`;
	const table_log_mo = `${create_table} "log_mo" ("id" SERIAL PRIMARY KEY, "number" VARCHAR(20), "date" BIGINT, "provider" VARCHAR(20), "status" VARCHAR(20), "message" TEXT);`;
	const table_log_provider = `${create_table} "log_provider" ("id" SERIAL PRIMARY KEY, "code" VARCHAR(20), "date" BIGINT, "status" VARCHAR(20), "message" TEXT);`;
	const table_log_history = `${create_table} "log_history" ("id" SERIAL PRIMARY KEY, "number" VARCHAR(20), "provider" VARCHAR(20), "date" BIGINT, "status" VARCHAR(20), "rank" INT, "message" TEXT);`;

	const command_drop = `${docker_start_line}${pg_password} dropdb --if-exists ${pg_params}${docker_end_line}`;
	const command_create = `${docker_start_line}${pg_password} createdb ${pg_params}${docker_end_line}`;

	const command_mo = `${psql_command} '${table_mo}'`;
	const command_provider = `${psql_command} '${table_provider}'`;
	const command_log_mo = `${psql_command} '${table_log_mo}'`;
	const command_log_provider = `${psql_command} '${table_log_provider}'`;
	const command_log_history = `${psql_command} '${table_log_history}'`;

	if (docker_config.drop_database === 'yes' || docker_config.drop_database === 'y')
		execSync(command_drop);
		
	try {
		execSync(command_create);
	} catch (error) {}

	execSync(command_mo);
	execSync(command_provider);
	execSync(command_log_mo);
	execSync(command_log_provider);
	execSync(command_log_history);

	const schemas = this.get_schemas();

	for (let i = 0; i < schemas.length; i++) {

		const schema = schemas[i];
		const command_schema = `CREATE SCHEMA IF NOT EXISTS "${schema}";`;
	
		execSync(`${psql_command} '${command_schema}'`);
	}

	const tables = this.get_tables_from_structure();

	for (let i = 0; i < tables.length; i++) {

		const table = tables[i];
		const command_table = `${create_table} "${table}" ("number_provider" VARCHAR(40) PRIMARY KEY, "sms" JSONB);`;

		execSync(`${psql_command} '${command_table}'`);
	}
};

exports.get_tables_from_structure = () => {

	const { type, country_code, ddd, range } = db_config;
	
	const tables = [];

	type.forEach(type => {

		const output_a = `${type}"."`;

		country_code.forEach(country_code => {
			
			const output_b = output_a + country_code.toString();

			ddd.forEach(ddd => {

				const output_c = output_b + ddd.toString();

				const {number, spread} = range[type];
				const min = number.split('-')[0];
				const max = number.split('-')[1] || min;

				for (let i = min; i <= max; i++) {

					const doesnt_need_spreading = !spread.includes(parseInt(i));

					if (doesnt_need_spreading) {

						const row = output_c + i.toString();
						tables.push(row);
						continue;
					}

					for (let j = 0; j <= 9; j++) {

						const current_number = i.toString() + j.toString();
						const doesnt_need_spreading = !spread.includes(parseInt(current_number));

						if (doesnt_need_spreading) {

							const row = output_c + i.toString() + j.toString();
							tables.push(row);
							continue;
						}

						for (let k = 0; k <= 9; k++) {

							const row = output_c + i.toString() + j.toString() + k.toString();
							tables.push(row);
						}
					}
				}
			});
		});
	});

	return tables;
};

exports.get_schemas = () => {

	let type = [];

	type = db_config.type;

	return type;
};