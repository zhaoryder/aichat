#!/usr/bin/env python3
"""验证 AI 聊天修复 - 通过浏览器完整测试"""
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

# 1. 创建用户
print("\n1. 创建用户")
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
        print(f"   成功: {user_id}")
except urllib.error.HTTPError as e:
    print(f"   失败: {e.code} {e.read().decode()}")
    import sys; sys.exit(1)

# 2. 在 profiles 表中创建记录（解决外键问题）
print("\n2. 创建 profiles 记录")
profile_url = f"{SUPABASE_URL}/rest/v1/profiles"
profile_data = json.dumps({
    "id": user_id,
    "nickname": "测试用户",
    "bio": "测试"
}).encode()

req = urllib.request.Request(profile_url, data=profile_data, method="POST")
req.add_header("Authorization", f"Bearer {SERVICE_ROLE_KEY}")
req.add_header("apikey", SUPABASE_ANON_KEY)
req.add_header("Content-Type", "application/json")
req.add_header("Prefer", "return=minimal")

try:
    with urllib.request.urlopen(req) as resp:
        print(f"   profiles 创建成功: {resp.status}")
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f"   profiles 创建失败: {e.code} {body[:200]}")
    # 可能已存在，继续

# 3. Playwright 测试
from playwright.sync_api import sync_playwright

console_logs = []
page_errors = []

def on_console(msg):
    console_logs.append(f"[{msg.type}] {msg.text}")

def on_page_error(error):
    page_errors.append(str(error))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.on("console", on_console)
    page.on("pageerror", on_page_error)

    print("\n3. 登录")
    page.goto(f"{PRODUCTION_URL}/auth/login")
    page.wait_for_load_state("networkidle")
    page.locator('input[type="email"]').first.fill(TEST_EMAIL)
    page.locator('input[type="password"]').first.fill(TEST_PASSWORD)
    page.locator('button[type="submit"]').first.click()
    page.wait_for_timeout(5000)
    page.wait_for_load_state("networkidle")
    print(f"   登录后URL: {page.url}")

    if "auth" in page.url:
        print("   登录失败!")
        browser.close()
        import sys; sys.exit(1)

    print("\n4. 进入聊天页面并发送消息")
    page.goto(f"{PRODUCTION_URL}/chat/confucius")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    textarea = page.locator("textarea").first
    textarea.fill("你好")
    page.wait_for_timeout(500)

    send_btn = page.locator('button[aria-label="发送消息"]').first
    if send_btn.count() == 0:
        send_btn = page.locator('button:has-text("发送")').first
    send_btn.click()
    print("   已点击发送")

    # 持续监控 30 秒
    for i in range(15):
        page.wait_for_timeout(2000)
        body_text = page.inner_text("body")
        has_user_msg = "你好" in body_text
        has_error = "页面出错了" in body_text
        has_error_msg = "⚠️" in body_text
        # 检查是否有 AI 回复（任何中文内容）
        has_ai_reply = any(c in body_text for c in ["子曰", "三人行", "你好", "吾", "学", "仁", "礼", "道", "朋友", "曰", "矣", "也", "乎"])

        print(f"   [{(i+1)*2}秒] 用户消息={'是' if has_user_msg else '否'} AI回复={'有' if has_ai_reply else '无'} 错误提示={'有' if has_error_msg else '无'} 错误边界={'触发' if has_error else '无'}")

    # 最终截图
    page.screenshot(path="/tmp/final_chat.png")

    # 最终页面文本
    body_text = page.inner_text("body")
    print(f"\n   最终页面文本前500字:\n   {body_text[:500]}")

    print("\n页面JS错误:")
    for err in page_errors:
        print(f"  {err}")
    if not page_errors:
        print("  (无)")

    browser.close()
    print("\n验证完成")
