module.exports = {
    host:       process.env.DATABASE_HOST       ||  'localhost',
    port:       process.env.DATABASE_PORT       ||   5432,
    user:       process.env.DATABASE_USER       ||  'postgres',
    password:   process.env.DATABASE_PASSWORD   ||  'postgres',
    database:   process.env.DATABASE_NAME       ||  'ranking',
};
