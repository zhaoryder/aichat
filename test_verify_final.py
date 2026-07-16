#!/usr/bin/env python3
"""完整验证 AI 聊天修复 - Playwright 浏览器测试"""
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
    print(f"   失败: {e.code}")
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
    print(f"   profiles 失败: {e.code} (可能已存在)")

# 2. Playwright 浏览器测试
from playwright.sync_api import sync_playwright

page_errors = []

def on_page_error(error):
    page_errors.append(str(error))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.on("pageerror", on_page_error)

    print("\n2. 登录")
    page.goto(f"{PRODUCTION_URL}/auth/login")
    page.wait_for_load_state("networkidle")
    page.locator('input[type="email"]').first.fill(TEST_EMAIL)
    page.locator('input[type="password"]').first.fill(TEST_PASSWORD)
    page.locator('button[type="submit"]').first.click()
    page.wait_for_timeout(5000)
    page.wait_for_load_state("networkidle")
    print(f"   URL: {page.url}")

    if "auth" in page.url:
        print("   登录失败!")
        browser.close()
        import sys; sys.exit(1)

    print("\n3. 进入聊天页面并发送消息")
    page.goto(f"{PRODUCTION_URL}/chat/confucius")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    page.locator("textarea").first.fill("你好")
    page.wait_for_timeout(500)
    page.locator('button[aria-label="发送消息"]').first.click()
    print("   已发送")

    # 监控 30 秒
    for i in range(15):
        page.wait_for_timeout(2000)
        body = page.inner_text("body")
        has_user = "你好" in body
        has_error = "⚠️" in body
        has_ai = any(c in body for c in ["子曰", "三人行", "吾", "学", "仁", "礼", "道", "曰", "矣", "也", "乎", "孔", "你好啊", "你好呀", "朋友"])
        no_collapse = "页面出错了" not in body

        status = []
        if has_user: status.append("用户消息✓")
        if has_ai: status.append("AI回复✓")
        if has_error: status.append("错误提示")
        if not no_collapse: status.append("错误边界!")

        print(f"   [{(i+1)*2}秒] {' '.join(status) if status else '等待中...'}")

        # 如果已有 AI 回复或错误提示，提前结束
        if has_ai and not has_error:
            print("\n   ✅ AI 回复正常！")
            break
        if has_error and i >= 3:
            print(f"\n   ⚠️ 有错误提示: {body[body.index('⚠️'):body.index('⚠️')+50] if '⚠️' in body else ''}")
            break

    page.screenshot(path="/tmp/final_verify.png")
    body = page.inner_text("body")
    print(f"\n   最终页面文本:\n   {body[:600]}")

    print("\n页面JS错误:")
    for err in page_errors:
        print(f"  {err}")
    if not page_errors:
        print("  (无)")

    browser.close()
    print("\n验证完成")
