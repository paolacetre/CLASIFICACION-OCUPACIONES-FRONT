const { Client } = require('pg');
const client = new Client({
  host: 'localhost',
  port: 5433,
  user: 'postgres',
  password: 'rootpassword',
  database: 'clasificacion',
});

client.connect().then(async () => {
  try {
    const res = await client.query("SELECT * FROM clasificacion.cuoc_ocupacion WHERE cod_ocupacion_cuoc = '73140'");
    console.log('73140 CUOC DB count:', res.rows.length);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
});
