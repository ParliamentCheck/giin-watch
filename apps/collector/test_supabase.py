# Supabase接続テスト

from supabase import create_client

SUPABASE_URL = "https://yyqktchttzvbzigeiajx.supabase.co"
SUPABASE_KEY = "sb_publishable_TFl6ysPhOtUq3vede35sdQ_9b83lXhG"

def test_supabase():
    print("Supabaseに接続中...")
    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # membersテーブルにテストデータを1件入れてみる
    data = {
        "id": "test-001",
        "name": "テスト議員",
        "name_reading": "てすとぎいん",
        "party": "テスト党",
        "house": "衆議院",
        "district": "東京1区",
        "prefecture": "東京",
    }

    result = client.table("members").insert(data).execute()
    print(f"データ挿入成功！: {result.data}")

    # 取り出してみる
    result2 = client.table("members").select("*").eq("id", "test-001").execute()
    print(f"データ取得成功！: {result2.data[0]['name']}")

    # テストデータを削除
    client.table("members").delete().eq("id", "test-001").execute()
    print("テストデータ削除完了")

if __name__ == "__main__":
    test_supabase()