import "dotenv/config";
import oracledb from "oracledb";

let pool: oracledb.Pool | null = null;

export async function getOracleConnection(): Promise<oracledb.Connection> {
  if (!pool) {
    pool = await oracledb.createPool({
      user: requiredEnv("ORACLE_USER"),
      password: requiredEnv("ORACLE_PASSWORD"),
      connectString: `${requiredEnv("ORACLE_HOST")}:${process.env.ORACLE_PORT ?? "1521"}/${requiredEnv("ORACLE_SID")}`,
      poolMin: 0,
      poolMax: 5,
      poolIncrement: 1
    });
  }

  return pool.getConnection();
}

export async function closeOraclePool(): Promise<void> {
  if (!pool) {
    return;
  }

  await pool.close(0);
  pool = null;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required.`);
  }
  return value;
}
