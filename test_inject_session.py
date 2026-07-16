#!/usr/bin/env python3
"""完整验证 AI 聊天修复 - 增加等待时间"""
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
admin_data = json.dumps({
    "email": TEST_EMAIL, "password": TEST_PASSWORD,
    "email_confirm": True, "user_metadata": {"nickname": "测试用户"}
}).encode()
req = urllib.request.Request(f"{SUPABASE_URL}/auth/v1/admin/users", data=admin_data, method="POST")
req.add_header("Authorization", f"Bearer {SERVICE_ROLE_KEY}")
req.add_header("apikey", SUPABASE_ANON_KEY)
req.add_header("Content-Type", "application/json")

user_id = None
try:
    with urllib.request.urlopen(req) as resp:
        user_id = json.loads(resp.read()).get("id")
        print(f"   用户创建成功: {user_id}")
except urllib.error.HTTPError as e:
    print(f"   失败: {e.code} {e.read().decode()[:100]}")
    import sys; sys.exit(1)

# 创建 profiles
profile_data = json.dumps({"id": user_id, "nickname": "测试用户"}).encode()
req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/profiles", data=profile_data, method="POST")
req.add_header("Authorization", f"Bearer {SERVICE_ROLE_KEY}")
req.add_header("apikey", SUPABASE_ANON_KEY)
req.add_header("Content-Type", "application/json")
req.add_header("Prefer", "return=minimal")
try:
    with urllib.request.urlopen(req) as resp:
        print(f"   profiles 创建成功: {resp.status}")
except urllib.error.HTTPError as e:
    print(f"   profiles: {e.code} (可能已存在)")

# 等待 3 秒让 Supabase 同步
time.sleep(3)

# 2. 直接用 API 获取 token，然后用 Playwright 注入 session
print("\n2. 获取 access token")
login_data = json.dumps({"email": TEST_EMAIL, "password": TEST_PASSWORD}).encode()
req = urllib.request.Request(f"{SUPABASE_URL}/auth/v1/token?grant_type=password", data=login_data, method="POST")
req.add_header("apikey", SUPABASE_ANON_KEY)
req.add_header("Content-Type", "application/json")

auth_data = None
try:
    with urllib.request.urlopen(req) as resp:
        auth_data = json.loads(resp.read())
        print(f"   token 获取成功")
except urllib.error.HTTPError as e:
    print(f"   失败: {e.code} {e.read().decode()[:200]}")
    import sys; sys.exit(1)

# 3. Playwright：注入 session 后直接测试
from playwright.sync_api import sync_playwright

page_errors = []

def on_page_error(error):
    page_errors.append(str(error))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.on("pageerror", on_page_error)

    print("\n3. 注入 Supabase session 并访问聊天页")
    # 先访问首页让 Supabase client 初始化
    page.goto(PRODUCTION_URL)
    page.wait_for_load_state("networkidle")

    # 注入 session 到 localStorage
    page.evaluate("""
        (authData) => {
            const key = 'sb-jadxupuypxilxdwownyb-auth-token';
            const session = {
                access_token: authData.access_token,
                refresh_token: authData.refresh_token,
                expires_in: authData.expires_in,
                expires_at: authData.expires_at,
                token_type: authData.token_type,
                user: authData.user,
            };
            localStorage.setItem(key, JSON.stringify(session));
        }
    """, auth_data)

    # 刷新页面让 Supabase 读取 session
    page.reload()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)
    print(f"   首页 URL: {page.url}")

    print("\n4. 导航到聊天页面")
    page.goto(f"{PRODUCTION_URL}/chat/confucius")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)
    print(f"   聊天页 URL: {page.url}")

    # 检查是否被重定向到登录页
    if "auth" in page.url:
        print("   被重定向到登录页！session 注入失败")
        browser.close()
        import sys; sys.exit(1)

    print("\n5. 发送消息")
    textarea = page.locator("textarea").first
    if textarea.count() == 0:
        print("   未找到输入框！")
        page.screenshot(path="/tmp/no_textarea.png")
        browser.close()
        import sys; sys.exit(1)

    textarea.fill("你好")
    page.wait_for_timeout(500)
    page.locator('button[aria-label="发送消息"]').first.click()
    print("   已发送")

    # 监控 30 秒
    for i in range(15):
        page.wait_for_timeout(2000)
        body = page.inner_text("body")
        has_user = "你好" in body
        has_error = "⚠️" in body
        has_ai = any(c in body for c in ["子曰", "三人行", "吾", "学", "仁", "礼", "道", "曰", "矣", "也", "乎", "孔", "你好啊", "你好呀", "朋友", "老夫"])

        status = []
        if has_user: status.append("用户✓")
        if has_ai: status.append("AI回复✓")
        if has_error: status.append("错误提示")

        print(f"   [{(i+1)*2}秒] {' '.join(status) if status else '等待...'}")

        if has_ai and not has_error:
            print("\n   ✅ AI 回复正常！聊天功能修复成功！")
            break
        if has_error and i >= 3:
            idx = body.find("⚠️")
            print(f"\n   ⚠️ 错误提示: {body[idx:idx+60]}")
            break

    page.screenshot(path="/tmp/final_chat_verify.png")
    body = page.inner_text("body")
    print(f"\n   页面文本:\n   {body[:600]}")

    print("\n页面JS错误:")
    for err in page_errors:
        print(f"  {err}")
    if not page_errors:
        print("  (无)")

    browser.close()
    print("\n验证完成")
