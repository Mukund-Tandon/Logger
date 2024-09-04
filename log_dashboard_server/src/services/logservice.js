const connection = require('../configs/connection');
function getDefaultLastLogTime() {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  return oneHourAgo.toISOString().slice(0, 19).replace('T', ' ');
}

async function getLogsToBeStreamed(lastLogTime = getDefaultLastLogTime()) {
  console.log("Last Log Time:", lastLogTime);
  const databaseConnection = await connection.getConnection();
  const query = `SELECT * FROM logs WHERE Timestamp >= '${lastLogTime}'`;
  const result = await databaseConnection.query({
    query: query,
    format: 'JSONEachRow',
  });
  const dataset = await result.json();
  return dataset;
  // Your logic here
}
async function getLatestLogs() {
  try {
  databaseConnection = await connection.getConnection();
    console.log("Connection to ClickHouse established");

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000 );
    const startDate = oneHourAgo.toISOString().slice(0, 19).replace('T', ' ');

    const query = `SELECT * FROM logs WHERE Timestamp >= '${startDate}'`;

    const result = await databaseConnection.query({
      query: query,
      format: 'JSONEachRow',
    });
    const dataset = await result.json();

    console.log(dataset);
    return dataset;
  } catch (e) {
    console.log("Error in fetching data from database", e);
    throw error
  }


}

async  function getLogsOfSpecificDate(date){
  databaseConnectin = await connection.getConnection();
  const query = `SELECT * FROM testdb.logs WHERE Timestamp >= ${date}`
  try {
    const result = await databaseConnectin.query({
      query: query,
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


async function getLogsByFilters(filterQuery) {
  databaseConnectin = await connection.getConnection();
  const query = `SELECT * FROM testdb.logs WHERE ${filterQuery}`
  try {
    const result = await databaseConnectin.query({
      query: query,
      format: 'JSONEachRow'
    });
    const dataset = await result.json()

    console.log(dataset);
    return dataset;

  }
  catch (e) {
    console.log("Error in fetching data from database", e);
    throw error
  }
}
async  function getLogsOfDateRange(startTime,endTime){
  var databaseConnectin = await connection.getConnection();
  console.log("Connection to ClickHouse established");
  const query = `
  SELECT *
  FROM testdb.logs
  WHERE Timestamp >= toDateTime('${startTime}', 'UTC')
    AND Timestamp <= toDateTime('${endTime}', 'UTC')
`;
  // 
  try {
    const result = await databaseConnectin.query({
      query: query,
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



module.exports = {getLatestLogs,getLogsOfSpecificDate,getLogsOfDateRange,getLogsToBeStreamed,getLogsByFilters}
