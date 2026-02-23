# 国会図書館APIの動作テスト
# 特定の議員の発言回数を取得する

import httpx

def test_ndl_api():
    url = "https://kokkai.ndl.go.jp/api/speech"
    params = {
        "speaker": "石破茂",
        "sessionFrom": 213,
        "sessionTo": 213,
        "maximumRecords": 5,
        "recordPacking": "json",
    }

    print("国会図書館APIに接続中...")
    resp = httpx.get(url, params=params, timeout=30)
    data = resp.json()

    total = data.get("numberOfRecords", 0)
    print(f"取得成功！ 石破茂の第213回国会での発言回数: {total}回")

    records = data.get("speechRecord", [])
    for r in records[:3]:
        print(f"  - {r.get('date')} {r.get('nameOfMeeting')} {r.get('speechURL')}")

if __name__ == "__main__":
    test_ndl_api()