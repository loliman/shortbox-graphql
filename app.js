import server from './server';
import sequelize from './config/database'

async function start() {
    await sequelize.authenticate().then(() => {
        console.log('🚀 Database is ready');
    });

    await sequelize.sync();

    server.listen({port: 4000}, () =>
        console.log('🚀 Server ready at https://localhost:4000')
    );
}

start();