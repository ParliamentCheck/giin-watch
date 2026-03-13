"""speeches テーブルに VACUUM FULL を実行する（容量回収用）"""
import os
import socket
import psycopg2

host = "db.yyqktchttzvbzigeiajx.supabase.co"

# IPv4 アドレスを明示的に解決
ipv4 = socket.getaddrinfo(host, 5432, socket.AF_INET)[0][4][0]
print(f"Connecting to {ipv4}:5432 ...")

conn = psycopg2.connect(
    host=ipv4,
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
