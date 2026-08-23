import { Sequelize } from "sequelize";
import { env } from "./env.js";

export const sequelize = new Sequelize(env.db.name, env.db.user, env.db.password, {
  host: env.db.host,
  port: env.db.port,
  dialect: "mysql",
  logging: false,
  dialectOptions: {
    connectTimeout: 20000,
  },
  define: {
    underscored: false,
    freezeTableName: true,
  },
});
