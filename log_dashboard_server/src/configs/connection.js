const ClickHouse = require("@clickhouse/client")

class ClickHouseConnection {
    constructor() {
      this.hostaddr = "http://127.0.0.1:8123";
      this.username = "default";
      this.password = "";
      this.database = "testdb";
  
      this.client = ClickHouse.createClient({
        url: this.hostaddr,
        username: this.username,
        password: this.password,
        database: this.database,
      });
    }
    async getConnection() {
      if (!this.client) {
        console.log("Connecting to ClickHouse... becuse no connection previouly made");
        this.client = ClickHouse.createClient({
          url: this.hostaddr,
          username: this.username,
          password: this.password,
          database: this.database,
        });
      }
      console.log("getting connection to ClickHouse...");
  
      return this.client;
    }
  
    static getInstance() {
      if (!ClickHouseConnection.instance) {
        ClickHouseConnection.instance = new ClickHouseConnection();
        console.log("Connection to ClickHouse established");
      }
  
      return ClickHouseConnection.instance;
    }
  }


module.exports = ClickHouseConnection.getInstance();