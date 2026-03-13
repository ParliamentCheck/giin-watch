"""speeches テーブルに VACUUM FULL を実行する（容量回収用）"""
import os
import psycopg2

conn = psycopg2.connect(
    host="db.yyqktchttzvbzigeiajx.supabase.co",
    port=5432,
    user="postgres",
    password=os.environ["SUPABASE_DB_PASSWORD"],
    dbname="postgres",
    sslmode="require",
    connect_timeout=30,
)
conn.autocommit = True

cur = conn.cursor()
print("Running VACUUM FULL speeches ...")
cur.execute("VACUUM FULL speeches;")
print("Done.")

cur.close()
conn.close()
