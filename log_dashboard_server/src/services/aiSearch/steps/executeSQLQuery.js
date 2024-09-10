const connection = require('../../../configs/connection');

async function executeSQLQueryStep(Query) {
    databaseConnectin = await connection.getConnection();
    try {
        const result = await databaseConnectin.query({
        query: Query,
        format: 'JSONEachRow',
        });
        const dataset = await result.json()
    
        console.log(dataset);
        return dataset;
    } catch (e) {
        console.log("Error in fetching data from database", e);
        throw error
    }
}


module.exports = { executeSQLQueryStep };