module.exports = {
    use_containers:          process.env.USE_CONTAINERS          || 'no',
    drop_database:           process.env.DROP_DATABASE           || 'no',
    container_postgres:      process.env.CONTAINER_POSTGRES      || 'postgres-container',
    container_postgres_port: process.env.CONTAINER_POSTGRES_PORT ||  5432,
    container_node_host:     process.env.CONTAINER_NODE_HOST     || 'node-container',
    container_node_port:     process.env.CONTAINER_NODE_PORT     ||  3000,
    container_redis:         process.env.CONTAINER_REDIS         || 'redis-container',
    container_redis_port:    process.env.CONTAINER_REDIS_PORT    ||  6379
};