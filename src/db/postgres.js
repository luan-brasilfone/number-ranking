const pg = require('pg');
const postgres_config = require('../../config/postgres');

const postgres_client = new pg.Client(postgres_config);

postgres_client.connect(error => {
    if (error) console.log(error.message);
});

const res = await postgres_client.query('SELECT $1::text as message', ['Succesfully connected to database']);
console.log(`${new Date().toLocaleTimeString()} - ${res.rows[0].message}`);

module.exports = postgres_client;
