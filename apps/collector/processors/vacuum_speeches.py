"""speeches テーブルに VACUUM FULL を実行する（容量回収用）"""
import os
import psycopg2

# セッションモード接続プーラー（IPv4対応）経由で接続
# ユーザー名は postgres.{project_ref} 形式
conn = psycopg2.connect(
    host="aws-0-ap-northeast-1.pooler.supabase.com",
    port=5432,
    user="postgres.yyqktchttzvbzigeiajx",
    password=os.environ["SUPABASE_DB_PASSWORD"],
    dbname="postgres",
    sslmode="require",
    connect_timeout=30,
    options="-c default_transaction_isolation=autocommit",
)
conn.autocommit = True

cur = conn.cursor()
print("Running VACUUM FULL speeches ...")
cur.execute("VACUUM FULL speeches;")
print("Done.")

cur.close()
conn.close()
