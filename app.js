import sequelize from './config/database'
import server from "./server";

async function start() {
    await sequelize.authenticate().then(() => {
        console.log('🚀 Database is ready');
    });

    await sequelize.sync();

    server.listen().then(({ url }) => {
        console.log(`🚀  Server ready at ${url}`);
    });
}

start();