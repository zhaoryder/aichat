#!/usr/bin/env python3
"""测试 AI 消息消失 - 拦截 fetch 请求和 console"""
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

try:
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
        print(f"   成功: {result.get('id', 'unknown')}")
except urllib.error.HTTPError as e:
    print(f"   失败: {e.code} {e.read().decode()}")
    import sys; sys.exit(1)

# 2. Playwright 测试
from playwright.sync_api import sync_playwright

console_logs = []
page_errors = []
chat_responses = []

def on_console(msg):
    console_logs.append(f"[{msg.type}] {msg.text}")

def on_page_error(error):
    page_errors.append(str(error))

def on_response(response):
    if "/api/chat" in response.url and response.request.method == "POST":
        status = response.status
        ct = response.headers.get("content-type", "")
        print(f"\n   [chat 响应] {status} {response.url}")
        print(f"   [content-type] {ct}")
        chat_responses.append({"status": status, "content_type": ct})
        if status != 200:
            try:
                body = response.text()
                print(f"   [响应体] {body[:300]}")
            except:
                pass

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.on("console", on_console)
    page.on("pageerror", on_page_error)
    page.on("response", on_response)

    print("\n2. 登录")
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
        print(f"   页面文本: {page.inner_text('body')[:200]}")
        browser.close()
        import sys; sys.exit(1)

    print("\n3. 进入聊天页面并发送消息")
    page.goto(f"{PRODUCTION_URL}/chat/confucius")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    # 填写并发送
    textarea = page.locator("textarea").first
    textarea.fill("你好")
    page.wait_for_timeout(500)

    send_btn = page.locator('button[aria-label="发送消息"]').first
    if send_btn.count() == 0:
        send_btn = page.locator('button:has-text("发送")').first
    send_btn.click()
    print("   已点击发送")

    # 每 2 秒截图 + 检查页面状态，持续 20 秒
    for i in range(10):
        page.wait_for_timeout(2000)
        body_text = page.inner_text("body")
        has_user_msg = "你好" in body_text
        has_error_boundary = "页面出错了" in body_text
        has_ai_content = any(c in body_text for c in ["子曰", "三人行", "学而", "孔子曰", "吾日", "有朋", "不亦"])

        # 检查 AI 消息区域（查看是否有 loading dots 或 AI 回复）
        # 简单检查页面中是否包含 AI 回复的常见字
        print(f"   [{(i+1)*2}秒] 用户消息={'是' if has_user_msg else '否'} AI回复={'有' if has_ai_content else '无'} 错误边界={'触发' if has_error_boundary else '无'}")

    # 最终状态
    body_text = page.inner_text("body")
    print(f"\n   最终页面文本:\n   {body_text[:500]}")

    print("\n" + "="*60)
    print("\n页面JS错误:")
    for err in page_errors:
        print(f"  {err}")
    if not page_errors:
        print("  (无)")

    print("\n相关控制台日志:")
    for log in console_logs:
        if any(kw in log.lower() for kw in ["error", "chat", "api", "401", "403", "500", "sse", "stream", "abort"]):
            print(f"  {log}")

    browser.close()
    print("\n验证完成")
