#!/usr/bin/env python3
"""完整验证 AI 聊天修复"""
import json
import time
import urllib.request
import urllib.error

SUPABASE_URL = "https://jadxupuypxilxdwownyb.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphZHh1cHV5cHhpbHhkd293bnliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MDE2MTAsImV4cCI6MjA5OTE3NzYxMH0.aB46Vb5D2znV1DjwqsJZv8t2T8vK3_ms4Q5Vx3CBaxQ"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphZHh1cHV5cHhpbHhkd293bnliIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzYwMTYxMCwiZXhwIjoyMDk5MTc3NjEwfQ.0sro3mUqhKxewzoK6vMEI_kY79L3XEEZAXZ1xukydpY"

PRODUCTION_URL = "https://aichat-dgl.pages.dev"
TEST_EMAIL = f"test_{int(time.time())}@test.com"
TEST_PASSWORD = "Test123456!"

print(f"测试账号: {TEST_EMAIL}")

# 1. 创建用户 + profiles
print("\n1. 创建用户 + profiles")
admin_url = f"{SUPABASE_URL}/auth/v1/admin/users"
admin_data = json.dumps({
    "email": TEST_EMAIL,
    "password": TEST_PASSWORD,
    "email_confirm": True,
    "user_metadata": {"nickname": "测试用户"}
}).encode()

req = urllib.request.Request(admin_url, data=admin_data, method="POST")
req.add_header("Authorization", f"Bearer {SERVICE_ROLE_KEY}")
req.add_header("apikey", SUPABASE_ANON_KEY)
req.add_header("Content-Type", "application/json")

user_id = None
try:
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
        user_id = result.get("id")
        print(f"   用户创建成功: {user_id}")
except urllib.error.HTTPError as e:
    print(f"   失败: {e.code} {e.read().decode()}")
    import sys; sys.exit(1)

# 创建 profiles 记录
profile_url = f"{SUPABASE_URL}/rest/v1/profiles"
profile_data = json.dumps({"id": user_id, "nickname": "测试用户"}).encode()
req = urllib.request.Request(profile_url, data=profile_data, method="POST")
req.add_header("Authorization", f"Bearer {SERVICE_ROLE_KEY}")
req.add_header("apikey", SUPABASE_ANON_KEY)
req.add_header("Content-Type", "application/json")
req.add_header("Prefer", "return=minimal")
try:
    with urllib.request.urlopen(req) as resp:
        print(f"   profiles 创建成功: {resp.status}")
except urllib.error.HTTPError as e:
    print(f"   profiles 创建失败: {e.code} {e.read().decode()[:100]}")

# 2. 登录获取 token
print("\n2. 登录获取 token")
login_url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
login_data = json.dumps({"email": TEST_EMAIL, "password": TEST_PASSWORD}).encode()
req = urllib.request.Request(login_url, data=login_data, method="POST")
req.add_header("apikey", SUPABASE_ANON_KEY)
req.add_header("Content-Type", "application/json")

access_token = None
try:
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
        access_token = result.get("access_token")
        print(f"   token 获取成功")
except urllib.error.HTTPError as e:
    print(f"   失败: {e.code} {e.read().decode()}")
    import sys; sys.exit(1)

# 3. 直接调用 /api/chat 读取 SSE 流
print("\n3. 调用 /api/chat（通过 Cloudflare 代理）")
chat_url = f"{PRODUCTION_URL}/api/chat"
chat_data = json.dumps({
    "conversationId": None,
    "agentId": "confucius",
    "message": "你好",
}).encode()

req = urllib.request.Request(chat_url, data=chat_data, method="POST")
req.add_header("Authorization", f"Bearer {access_token}")
req.add_header("Content-Type", "application/json")
req.add_header("Accept", "text/event-stream")
req.add_header("Origin", PRODUCTION_URL)
req.add_header("Referer", f"{PRODUCTION_URL}/chat/confucius")

try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        print(f"   HTTP 状态: {resp.status}")
        ct = resp.headers.get("Content-Type", "")
        print(f"   Content-Type: {ct}")

        buffer = ""
        events = []
        while True:
            chunk = resp.read(1024)
            if not chunk:
                break
            buffer += chunk.decode("utf-8", errors="replace")
            while "\n\n" in buffer:
                event_block, buffer = buffer.split("\n\n", 1)
                events.append(event_block)

        if buffer.strip():
            events.append(buffer)

        print(f"\n   --- 收到 {len(events)} 个事件 ---")
        for ev in events:
            print(f"   {ev}")
        print("   --- 结束 ---")

except urllib.error.HTTPError as e:
    print(f"   请求失败: {e.code}")
    body = e.read().decode("utf-8", errors="replace")
    print(f"   响应体: {body[:500]}")
except Exception as e:
    print(f"   异常: {type(e).__name__}: {e}")

print("\n验证完成")
